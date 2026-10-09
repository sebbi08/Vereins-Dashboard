import type {
  Booking,
  BookingMatch,
  MatchCandidate,
  MatchLevel,
  MatchReason,
  MatchResult,
} from 'shared';

/** An active, unpaid invoice as the matcher needs it. */
export interface OpenInvoice {
  id: number;
  /** "12 / 2026" */
  number: string;
  year: number;
  runningNumber: number;
  /** YYYY-MM-DD */
  invoiceDate: string;
  /** Name on the active revision. */
  name: string;
  /** Gross amount of the active revision. */
  amountCents: number;
}

export type NumberSignal = 'STRONG' | 'WEAK' | null;

const SEPARATOR = String.raw`[\s/\-_.]+`;
// A number chained to its neighbours by . / - belongs to a date (22.03.2025) or a longer
// reference, and a number followed by "Uhr" is a time: neither is an invoice number.
const NOT_CHAINED_BEFORE = String.raw`(?<!\d)(?<!\d[./-])`;
const NOT_CHAINED_AFTER = String.raw`(?!\d)(?![./-]\d)(?!\s*uhr)`;
const KEYWORD = String.raw`(?:rechnungs?(?:nr|nummer)?|re-?nr|re|rg|nr)`;

/** Running number and year next to each other, in either order: "12/2026", "2026-12", "12 26". */
function strongPattern(runningNumber: number, year: number): RegExp {
  const run = `0*${runningNumber}`;
  const yearText = `(?:${year}|${String(year % 100).padStart(2, '0')})`;
  // Year first only with 4 digits: a 2-digit year before the number is the day of a date ("26.12.").
  return new RegExp(
    `${NOT_CHAINED_BEFORE}(?:${run}${SEPARATOR}${yearText}|${year}${SEPARATOR}${run})` +
      NOT_CHAINED_AFTER,
    'i',
  );
}

/** Only the running number, right after a keyword such as "Rechnung" or "RE". */
function weakPattern(runningNumber: number): RegExp {
  return new RegExp(
    String.raw`(?<![a-z])${KEYWORD}\.?\s*:?\s*0*${runningNumber}${NOT_CHAINED_AFTER}`,
    'i',
  );
}

function numberSignal(purpose: string, strong: RegExp, weak: RegExp): NumberSignal {
  if (strong.test(purpose)) return 'STRONG';
  if (weak.test(purpose)) return 'WEAK';
  return null;
}

/** How clearly the purpose text names invoice `<runningNumber> / <year>`. */
export function findInvoiceNumber(
  purpose: string,
  runningNumber: number,
  year: number,
): NumberSignal {
  return numberSignal(purpose, strongPattern(runningNumber, year), weakPattern(runningNumber));
}

// Shorter legal forms (e.V., UG, AG, KG, Co) fall out with the words below three letters.
const LEGAL_FORMS = new Set(['gmbh', 'mbh', 'ohg', 'gbr']);

/** The words of a name that can identify it: lower case, umlauts spelled out, no legal forms. */
export function nameWords(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !LEGAL_FORMS.has(word));
}

function wordsMatch(invoiceWords: string[], payer: string): boolean {
  if (invoiceWords.length === 0) return false;
  const payerWords = new Set(nameWords(payer));
  const found = invoiceWords.filter((word) => payerWords.has(word)).length;
  return found * 2 >= invoiceWords.length;
}

/** At least half of the invoice name's words occur in the payer. */
export function nameMatches(invoiceName: string, payer: string): boolean {
  return wordsMatch(nameWords(invoiceName), payer);
}

const LEVEL_RANK: Record<MatchLevel, number> = { CONFIDENT: 0, AMOUNT_DIFFERS: 1, AMOUNT_ONLY: 2 };

interface PreparedInvoice {
  invoice: OpenInvoice;
  strong: RegExp;
  weak: RegExp;
  words: string[];
}

function rate(
  booking: Booking,
  prepared: PreparedInvoice,
): { level: MatchLevel; candidate: MatchCandidate } | null {
  const { invoice } = prepared;
  const amount = booking.amountCents === invoice.amountCents;
  const number = numberSignal(booking.purpose, prepared.strong, prepared.weak);
  const name = wordsMatch(prepared.words, booking.payer);

  let level: MatchLevel | null = null;
  if (amount && (number === 'STRONG' || name)) level = 'CONFIDENT';
  else if (amount) level = 'AMOUNT_ONLY';
  else if (number === 'STRONG') level = 'AMOUNT_DIFFERS';
  if (!level) return null;

  const reasons: MatchReason[] = [];
  if (amount) reasons.push('AMOUNT');
  if (number) reasons.push('INVOICE_NUMBER');
  if (name) reasons.push('NAME');

  return {
    level,
    candidate: {
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      recipientName: invoice.name,
      invoiceDate: invoice.invoiceDate,
      amountCents: invoice.amountCents,
      reasons,
      differenceCents: booking.amountCents - invoice.amountCents,
    },
  };
}

/**
 * Proposes invoices for incoming bookings. Each booking appears once, with its best level and
 * every candidate of that level; bookings without any candidate are `unmatched`.
 */
export function matchBookings(bookings: Booking[], invoices: OpenInvoice[]): MatchResult {
  const prepared: PreparedInvoice[] = [...invoices]
    .sort((a, b) => a.year - b.year || a.runningNumber - b.runningNumber)
    .map((invoice) => ({
      invoice,
      strong: strongPattern(invoice.runningNumber, invoice.year),
      weak: weakPattern(invoice.runningNumber),
      words: nameWords(invoice.name),
    }));

  const matches: BookingMatch[] = [];
  const unmatched: Booking[] = [];
  for (const booking of bookings) {
    let best: BookingMatch | null = null;
    for (const entry of prepared) {
      if (entry.invoice.invoiceDate > booking.date) continue;
      const rated = rate(booking, entry);
      if (!rated) continue;
      if (!best || LEVEL_RANK[rated.level] < LEVEL_RANK[best.level]) {
        best = { booking, level: rated.level, candidates: [rated.candidate] };
      } else if (rated.level === best.level) {
        best.candidates.push(rated.candidate);
      }
    }
    if (best) matches.push(best);
    else unmatched.push(booking);
  }

  matches.sort(
    (a, b) =>
      LEVEL_RANK[a.level] - LEVEL_RANK[b.level] ||
      a.booking.date.localeCompare(b.booking.date) ||
      a.booking.row - b.booking.row,
  );
  return { matches, unmatched };
}

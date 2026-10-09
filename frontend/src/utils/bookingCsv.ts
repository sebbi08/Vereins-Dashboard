import type { Booking, BookingColumns, BookingEncoding } from 'shared';

/**
 * Decodes the file bytes. A byte order mark wins over the selected encoding, because it states
 * the encoding for certain; TextDecoder drops the mark from the text.
 */
export function decodeBookingFile(
  data: ArrayBuffer | Uint8Array,
  encoding: BookingEncoding,
): { text: string; encoding: BookingEncoding } {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let detected = encoding;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) detected = 'utf-16le';
  else if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) detected = 'utf-8';
  return { text: new TextDecoder(detected).decode(bytes), encoding: detected };
}

/** RFC 4180 style CSV: quoted fields may hold the delimiter, line breaks and "" for a quote. */
export function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch !== '"') field += ch;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else inQuotes = false;
    } else if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

export interface BookingTable {
  header: string[];
  rows: string[][];
}

/** The header (trimmed, so " Betrag" still maps) and the data rows of the file. */
export function readBookingTable(text: string, delimiter: string): BookingTable {
  const [header = [], ...rows] = parseCsv(text, delimiter);
  return { header: header.map((name) => name.trim()), rows };
}

const AMOUNT = /^([+-])?\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/;

/** "-1.284,00" → -128400 cents; null when the text is no German amount. */
export function parseGermanAmount(value: string): number | null {
  const match = AMOUNT.exec(value.replace('€', '').trim());
  if (!match) return null;
  const euros = Number(match[2].replace(/\./g, ''));
  const cents = Number((match[3] ?? '').padEnd(2, '0'));
  const total = euros * 100 + cents;
  return match[1] === '-' ? -total || 0 : total;
}

const GERMAN_DATE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;

/** "24.03.2025" → "2025-03-24"; null for anything else or an impossible day. */
export function parseGermanDate(value: string): string | null {
  const match = GERMAN_DATE.exec(value.trim());
  if (!match) return null;
  const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export interface SkippedRow {
  /** 1-based data row in the file. */
  row: number;
  values: string[];
  reason: 'AMOUNT' | 'DATE';
}

export const SKIP_REASON_LABELS: Record<SkippedRow['reason'], string> = {
  AMOUNT: 'Unreadable amount',
  DATE: 'Unreadable date',
};

/**
 * The incoming bookings of the file. Outgoing bookings (amount ≤ 0) are left out without a word;
 * rows whose amount or date cannot be read are reported.
 */
export function toBookings(
  rows: string[][],
  header: string[],
  columns: BookingColumns,
): { bookings: Booking[]; skipped: SkippedRow[] } {
  const at = (values: string[], name: string) => values[header.indexOf(name)] ?? '';
  const bookings: Booking[] = [];
  const skipped: SkippedRow[] = [];
  rows.forEach((values, index) => {
    const row = index + 1;
    const amountCents = parseGermanAmount(at(values, columns.amount));
    if (amountCents === null) {
      skipped.push({ row, values, reason: 'AMOUNT' });
      return;
    }
    if (amountCents <= 0) return;
    const date = parseGermanDate(at(values, columns.date));
    if (date === null) {
      skipped.push({ row, values, reason: 'DATE' });
      return;
    }
    bookings.push({
      row,
      date,
      payer: at(values, columns.payer).trim(),
      purpose: at(values, columns.purpose).trim(),
      amountCents,
    });
  });
  return { bookings, skipped };
}

import {
  calculateInstructorRent,
  type InstructorRentInputs,
  type TimeBlock,
  type TimeRange,
  toMinutes,
  type Weekday,
  WEEKDAYS,
} from './instructorRent.js';

export type InstructorInvoicePlaceholder =
  | 'name'
  | 'monate'
  | 'stunden_pro_woche'
  | 'wochen_pro_monat'
  | 'stundensatz'
  | 'betrag_pro_monat'
  | 'betrag_gesamt'
  | 'zeiten';

export const INSTRUCTOR_INVOICE_PLACEHOLDERS: readonly {
  key: InstructorInvoicePlaceholder;
  description: string;
}[] = [
  { key: 'name', description: 'Recipient name' },
  { key: 'monate', description: 'Number of months, e.g. "6 Monate"' },
  { key: 'stunden_pro_woche', description: 'Net hours per week, e.g. "7,5 h"' },
  { key: 'wochen_pro_monat', description: 'Weeks per month, e.g. "3,25"' },
  { key: 'stundensatz', description: 'Net hourly rate, e.g. "12,50 €"' },
  { key: 'betrag_pro_monat', description: 'Net amount per month' },
  { key: 'betrag_gesamt', description: 'Net total (the line amount)' },
  { key: 'zeiten', description: 'Weekly schedule, one line per time block' },
];

export const DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE =
  'Raummiete {monate}\n{stunden_pro_woche}/Woche × {wochen_pro_monat} Wochen × {monate} × {stundensatz}';

export const MAX_INSTRUCTOR_INVOICE_TEMPLATE_LENGTH = 2000;

export type InstructorInvoiceTextValues = Record<InstructorInvoicePlaceholder, string>;

const PLACEHOLDER_PATTERN = /\{([a-z_]+)\}/g;
const KNOWN_PLACEHOLDERS = new Set<string>(INSTRUCTOR_INVOICE_PLACEHOLDERS.map((p) => p.key));

const WEEKDAY_LABELS: Record<Weekday, string> = {
  MO: 'Mo',
  DI: 'Di',
  MI: 'Mi',
  DO: 'Do',
  FR: 'Fr',
  SA: 'Sa',
  SO: 'So',
};

/** German decimal formatting without thousands separators (deterministic, no ICU dependency). */
export function formatDecimal(value: number, fractionDigits: number, trimZeros: boolean): string {
  let text = value.toFixed(fractionDigits);
  if (trimZeros && text.includes('.')) text = text.replace(/\.?0+$/, '');
  return text.replace('.', ',');
}

/** German money format with thousands separators, e.g. "1.828,13 €" (no Intl). */
export function formatEuro(cents: number): string {
  const [whole, fraction] = (cents / 100).toFixed(2).split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fraction} €`;
}

export function formatMonths(months: number): string {
  return months === 1 ? '1 Monat' : `${months} Monate`;
}

/**
 * Weekly hours, printed exactly so the line text reproduces the billed amount:
 * a trimmed decimal when it is exact with 2 decimals, otherwise hours and minutes.
 */
export function formatWeeklyHours(netMinutesPerWeek: number): string {
  if (netMinutesPerWeek % 3 === 0) return `${formatDecimal(netMinutesPerWeek / 60, 2, true)} h`;
  return `${Math.floor(netMinutesPerWeek / 60)} h ${netMinutesPerWeek % 60} min`;
}

function formatRange(range: TimeRange): string {
  return `${range.start}–${range.end}`;
}

function byStart(a: TimeRange, b: TimeRange): number {
  return toMinutes(a.start) - toMinutes(b.start);
}

export function formatSchedule(blocks: TimeBlock[]): string {
  return [...blocks]
    .sort((a, b) => WEEKDAYS.indexOf(a.weekday) - WEEKDAYS.indexOf(b.weekday) || byStart(a, b))
    .map((block) => {
      const line = `${WEEKDAY_LABELS[block.weekday]} ${formatRange(block)}`;
      if (block.breaks.length === 0) return line;
      const breaks = [...block.breaks].sort(byStart).map(formatRange).join(', ');
      return `${line} (Pause ${breaks})`;
    })
    .join('\n');
}

export function buildInstructorInvoiceTextValues(
  name: string,
  inputs: InstructorRentInputs,
  weeksPerMonth: number,
): InstructorInvoiceTextValues {
  const result = calculateInstructorRent(inputs, weeksPerMonth);
  return {
    name,
    monate: formatMonths(inputs.months),
    stunden_pro_woche: formatWeeklyHours(result.netMinutesPerWeek),
    wochen_pro_monat: formatDecimal(weeksPerMonth, 2, true),
    stundensatz: formatEuro(inputs.hourlyRateCents),
    betrag_pro_monat: formatEuro(result.monthlyCents),
    betrag_gesamt: formatEuro(result.totalCents),
    zeiten: formatSchedule(inputs.timeBlocks),
  };
}

export function normalizeInstructorInvoiceTemplate(template: string): string {
  return template.replace(/\r\n?/g, '\n');
}

export function findUnknownPlaceholders(template: string): string[] {
  const unknown: string[] = [];
  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
    if (!KNOWN_PLACEHOLDERS.has(match[1]) && !unknown.includes(match[0])) unknown.push(match[0]);
  }
  return unknown;
}

export function renderInstructorInvoiceText(
  template: string,
  values: InstructorInvoiceTextValues,
): string {
  return normalizeInstructorInvoiceTemplate(template).replace(
    PLACEHOLDER_PATTERN,
    (token, key: string) =>
      KNOWN_PLACEHOLDERS.has(key) ? values[key as InstructorInvoicePlaceholder] : token,
  );
}

export function effectiveInstructorInvoiceTemplate(template: string | null | undefined): string {
  return template && template.trim() !== '' ? template : DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE;
}

export function validateInstructorInvoiceTemplate(template: string): string | null {
  const normalized = normalizeInstructorInvoiceTemplate(template);
  const unknown = findUnknownPlaceholders(normalized);
  if (unknown.length > 0) return `Unknown placeholders: ${unknown.join(', ')}`;
  if (normalized.length > MAX_INSTRUCTOR_INVOICE_TEMPLATE_LENGTH) {
    return `Invoice text must be at most ${MAX_INSTRUCTOR_INVOICE_TEMPLATE_LENGTH} characters`;
  }
  return null;
}

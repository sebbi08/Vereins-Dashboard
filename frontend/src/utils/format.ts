export function formatCents(cents: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

export function formatHours(minutes: number): string {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(minutes / 60);
}

const GERMAN_DATE: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
};

/**
 * Calendar date of an API date field ("YYYY-MM-DD" or an ISO string whose date part is the
 * calendar day), German format (e.g. 01.03.2026). Never shifted by the browser time zone.
 */
export function formatDate(iso: string): string {
  const date = fromIsoDate(iso);
  return date ? new Intl.DateTimeFormat('de-DE', GERMAN_DATE).format(date) : iso;
}

/** Local calendar date of a timestamp (instant), German format, e.g. for `updatedAt`. */
export function formatTimestampDate(iso: string): string {
  return new Intl.DateTimeFormat('de-DE', GERMAN_DATE).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Local calendar date as YYYY-MM-DD (what the API expects for date-only fields). */
export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** YYYY-MM-DD (optionally followed by a time) → local midnight of that calendar day. */
export function fromIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

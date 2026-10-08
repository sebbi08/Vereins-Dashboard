import { toCurrency } from 'n2words/de';

/**
 * Writes an amount in cents as German words for the "Betrag in Buchstaben"
 * field of a donation receipt, e.g. 123456 → "Eintausendzweihundertvierunddreißig
 * Euro und sechsundfünfzig Cent". The amount is passed as a decimal string, so
 * no float rounding can creep in.
 */
export function amountInWords(cents: number): string {
  const euros = Math.floor(cents / 100);
  const rest = cents % 100;
  const words = toCurrency(`${euros}.${String(rest).padStart(2, '0')}`, { currency: 'EUR' });
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** German decimal notation without a currency sign, e.g. 123456 → "1.234,56". */
export function formatEuroNumber(cents: number): string {
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatAmount(cents: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

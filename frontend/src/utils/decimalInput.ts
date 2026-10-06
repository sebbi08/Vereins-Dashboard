/** "1250" or "1250,5" — comma as decimal separator, no grouping. */
const COMMA_DECIMAL = /^\d+(,\d+)?$/;
/** "1.250" or "1.250,5" — German thousands grouping with dots. */
const GROUPED = /^\d{1,3}(\.\d{3})+(,\d+)?$/;
/** "12.5" — a single dot as decimal point (English style). */
const DOT_DECIMAL = /^\d+\.\d+$/;

/**
 * Parses German or English decimals ("12,50", "12.50", "1.250,00").
 * Returns null for empty input and NaN for anything it cannot read unambiguously
 * or with more than `maxFractionDigits` decimals. A dot followed by exactly three
 * digits groups thousands, as in German ("1.250" = 1250).
 */
export function parseDecimal(text: string, maxFractionDigits: number): number | null {
  const compact = text.replace(/[\s€]/g, '');
  if (compact === '') return null;

  let normalized: string;
  if (COMMA_DECIMAL.test(compact)) normalized = compact.replace(',', '.');
  else if (GROUPED.test(compact)) normalized = compact.replace(/\./g, '').replace(',', '.');
  else if (DOT_DECIMAL.test(compact)) normalized = compact;
  else return Number.NaN;

  const fraction = normalized.split('.')[1] ?? '';
  if (fraction.length > maxFractionDigits) return Number.NaN;
  return Number(normalized);
}

export function formatDecimal(
  value: number,
  minFractionDigits: number,
  maxFractionDigits: number,
): string {
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: minFractionDigits,
    maximumFractionDigits: maxFractionDigits,
  }).format(value);
}

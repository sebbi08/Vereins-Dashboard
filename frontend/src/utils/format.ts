export function formatCents(cents: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

export function formatHours(minutes: number): string {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(minutes / 60);
}

/** Accepts "12,50" or "12.5"; anything else (incl. thousands separators) → NaN. */
export function parseEuroToCents(text: string): number {
  const trimmed = text.trim();
  if (!/^\d+([.,]\d+)?$/.test(trimmed)) return Number.NaN;
  return Math.round(Number(trimmed.replace(',', '.')) * 100);
}

export function centsToEuroInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

/**
 * Sort key for invoice numbers such as "9 / 2026": as text, "9 / 2026" would sort after
 * "10 / 2026". The key orders by year, then running number; other formats stay as they are.
 */
export function invoiceNumberSortKey(number: string): string {
  const match = /^(\d+)\s*\/\s*(\d{4})$/.exec(number.trim());
  if (!match) return number;
  return `${match[2]}-${match[1].padStart(8, '0')}`;
}

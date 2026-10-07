/** One month whose invoice has been requested from an instructor. `month` is "YYYY-MM". */
export interface InstructorInvoiceRequestDto {
  instructorId: number;
  month: string;
}

export const MIN_REQUEST_YEAR = 2000;
export const MAX_REQUEST_YEAR = 2100;

export function isValidRequestYear(year: number): boolean {
  return Number.isInteger(year) && year >= MIN_REQUEST_YEAR && year <= MAX_REQUEST_YEAR;
}

/** True for "YYYY-MM" with month 01–12 and a year in the supported range. */
export function isValidRequestMonth(value: string): boolean {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return false;
  const month = Number(match[2]);
  return isValidRequestYear(Number(match[1])) && month >= 1 && month <= 12;
}

/** "YYYY-MM" for a 0-based month index (0 = January). */
export function requestMonth(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

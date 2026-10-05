import { DEFAULT_WEEKS_PER_MONTH } from '../../../shared/src/instructorRent.js';

export const WEEKS_PER_MONTH_KEY = 'instructorWeeksPerMonth';

export function parseWeeksPerMonth(value: string | undefined): number {
  const parsed = value === undefined || value.trim() === '' ? Number.NaN : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_WEEKS_PER_MONTH;
}

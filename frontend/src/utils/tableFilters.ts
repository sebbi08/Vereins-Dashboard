import { FilterService } from '@primevue/core/api';
import { toIsoDate } from './format';

/** DataTable match modes for range filters (registered globally on import). */
export const AMOUNT_RANGE = 'amountRange';
export const DATE_RANGE = 'dateRange';

/** [from, to] in euros; either end may be null. */
export type AmountRange = [number | null, number | null] | null;
/** DatePicker range model: [start, end?]; either may be null. */
export type DateRange = (Date | null)[] | null;

export function inAmountRange(cents: number, range: AmountRange | undefined): boolean {
  if (!range) return true;
  const [from, to] = range;
  if (from !== null && cents < Math.round(from * 100)) return false;
  if (to !== null && cents > Math.round(to * 100)) return false;
  return true;
}

/** Compares calendar days; `iso` is an API date (UTC midnight of the intended day). */
export function inDateRange(iso: string, range: DateRange | undefined): boolean {
  if (!range || range.length === 0) return true;
  const day = iso.slice(0, 10);
  const [from, to] = range;
  if (from && day < toIsoDate(from)) return false;
  if (to && day > toIsoDate(to)) return false;
  return true;
}

FilterService.register(AMOUNT_RANGE, (value: number, filter: AmountRange) =>
  inAmountRange(value, filter),
);
FilterService.register(DATE_RANGE, (value: string, filter: DateRange) =>
  inDateRange(value, filter),
);

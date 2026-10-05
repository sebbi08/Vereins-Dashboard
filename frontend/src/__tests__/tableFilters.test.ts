import { FilterService } from '@primevue/core/api';
import { describe, expect, it } from 'vitest';
import { AMOUNT_RANGE, DATE_RANGE, inAmountRange, inDateRange } from '../utils/tableFilters';

describe('inAmountRange (range in euros, value in cents)', () => {
  it.each([
    [5000, null, true],
    [5000, [null, null], true],
    [5000, [50, null], true],
    [4999, [50, null], false],
    [5000, [null, 50], true],
    [5001, [null, 50], false],
    [1250, [12.5, 12.5], true],
  ] as const)('%i in %j → %s', (cents, range, expected) => {
    expect(inAmountRange(cents, range as never)).toBe(expected);
  });
});

describe('inDateRange (API dates are UTC midnight ISO strings)', () => {
  const march1 = '2026-03-01T00:00:00.000Z';

  it('accepts everything without a range', () => {
    expect(inDateRange(march1, null)).toBe(true);
    expect(inDateRange(march1, [])).toBe(true);
    expect(inDateRange(march1, [null, null])).toBe(true);
  });

  it('includes both ends by calendar day', () => {
    expect(inDateRange(march1, [new Date(2026, 2, 1), new Date(2026, 2, 1)])).toBe(true);
    expect(inDateRange(march1, [new Date(2026, 1, 1), new Date(2026, 2, 1, 23, 0)])).toBe(true);
    expect(inDateRange(march1, [new Date(2026, 2, 2), null])).toBe(false);
    expect(inDateRange(march1, [null, new Date(2026, 1, 28)])).toBe(false);
  });

  it('treats a range with only a start as open-ended', () => {
    expect(inDateRange(march1, [new Date(2026, 0, 1)])).toBe(true);
  });
});

describe('registration', () => {
  it('registers both match modes with PrimeVue', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filters = (FilterService as any).filters;
    expect(filters[AMOUNT_RANGE]).toBeTypeOf('function');
    expect(filters[DATE_RANGE]).toBeTypeOf('function');
    expect(filters[AMOUNT_RANGE](1000, [20, null])).toBe(false);
  });
});

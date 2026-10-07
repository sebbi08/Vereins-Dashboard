import { describe, expect, it } from 'vitest';
import {
  isValidRequestMonth,
  isValidRequestYear,
  MAX_REQUEST_YEAR,
  MIN_REQUEST_YEAR,
  requestMonth,
} from '../../../../shared/src/instructorInvoiceRequests';

describe('isValidRequestYear', () => {
  it.each([2000, 2026, 2100])('accepts %i', (year) => {
    expect(isValidRequestYear(year)).toBe(true);
  });

  it.each([1999, 2101, 2026.5, Number.NaN])('rejects %s', (year) => {
    expect(isValidRequestYear(year)).toBe(false);
  });

  it('exposes the supported range', () => {
    expect([MIN_REQUEST_YEAR, MAX_REQUEST_YEAR]).toEqual([2000, 2100]);
  });
});

describe('isValidRequestMonth', () => {
  it.each(['2026-01', '2026-10', '2026-12', '2000-01', '2100-12'])('accepts %s', (value) => {
    expect(isValidRequestMonth(value)).toBe(true);
  });

  it.each(['2026-00', '2026-13', '26-01', '1999-12', '2101-01', '2026-1', '2026-010', '', 'abc'])(
    'rejects %j',
    (value) => {
      expect(isValidRequestMonth(value)).toBe(false);
    },
  );
});

describe('requestMonth', () => {
  it('builds a zero-padded YYYY-MM from a 0-based month index', () => {
    expect(requestMonth(2026, 0)).toBe('2026-01');
    expect(requestMonth(2026, 9)).toBe('2026-10');
    expect(requestMonth(2026, 11)).toBe('2026-12');
  });
});

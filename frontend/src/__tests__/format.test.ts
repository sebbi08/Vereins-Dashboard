import { describe, expect, it } from 'vitest';
import {
  centsToEuroInput,
  formatCents,
  formatDate,
  formatDateTime,
  formatHours,
  formatTimestampDate,
  fromIsoDate,
  parseEuroToCents,
  toIsoDate,
} from '../utils/format';

describe('format utils', () => {
  it('formats cents as euro', () => {
    expect(formatCents(175500)).toMatch(/^1\.755,00\s€$/);
  });

  it('formats minutes as German hours', () => {
    expect(formatHours(450)).toBe('7,5');
    expect(formatHours(20)).toBe('0,33');
    expect(formatHours(480)).toBe('8');
  });

  it.each([
    ['12,50', 1250],
    ['12.5', 1250],
    [' 12 ', 1200],
    ['1,05', 105],
  ])('parses %j to cents', (text, cents) => {
    expect(parseEuroToCents(text)).toBe(cents);
  });

  it.each(['', '   ', 'abc', '1.234,50', '12,505', '1,005'])('returns NaN for %j', (text) => {
    expect(parseEuroToCents(text)).toBeNaN();
  });

  it('formats cents for an input field', () => {
    expect(centsToEuroInput(1250)).toBe('12,50');
    expect(centsToEuroInput(1200)).toBe('12,00');
  });
});

describe('date helpers', () => {
  it('formats ISO strings as German dates', () => {
    expect(formatDate('2026-03-01T00:00:00.000Z')).toBe('01.03.2026');
    expect(formatDate('2026-12-24')).toBe('24.12.2026');
  });

  it('formats the local calendar date of a timestamp', () => {
    expect(formatTimestampDate('2026-03-01T09:05:00')).toBe('01.03.2026');
  });

  it('returns unparseable input unchanged', () => {
    expect(formatDate('n/a')).toBe('n/a');
  });

  it('formats date and time', () => {
    expect(formatDateTime('2026-03-01T09:05:00')).toMatch(/^01\.03\.26,? 09:05$/);
  });

  it('converts a local date to YYYY-MM-DD', () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toIsoDate(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });

  it('parses YYYY-MM-DD to local midnight', () => {
    const date = fromIsoDate('2026-03-01');
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(2);
    expect(date?.getDate()).toBe(1);
    expect(date?.getHours()).toBe(0);
    expect(fromIsoDate('2026-03-01T00:00:00.000Z')?.getDate()).toBe(1);
  });

  it.each(['', 'abc', '01.03.2026'])('returns null for %j', (value) => {
    expect(fromIsoDate(value)).toBeNull();
  });
});

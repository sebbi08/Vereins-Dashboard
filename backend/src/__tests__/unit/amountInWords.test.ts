import { describe, expect, it } from 'vitest';
import {
  amountInWords,
  formatAmount,
  formatDate,
  formatEuroNumber,
} from '../../services/amountInWords';

describe('formatEuroNumber', () => {
  it.each([
    [0, '0,00'],
    [5, '0,05'],
    [8403, '84,03'],
    [123456, '1.234,56'],
    [100000000, '1.000.000,00'],
  ])('writes %i cents as %j without a currency sign', (cents, expected) => {
    expect(formatEuroNumber(cents)).toBe(expected);
  });
});

describe('amountInWords', () => {
  it.each([
    [100, 'Ein Euro'],
    [101, 'Ein Euro und ein Cent'],
    [150, 'Ein Euro und fünfzig Cent'],
    [200, 'Zwei Euro'],
    [2121, 'Einundzwanzig Euro und einundzwanzig Cent'],
    [5001, 'Fünfzig Euro und ein Cent'],
    [10000, 'Einhundert Euro'],
    [10100, 'Einhunderteins Euro'],
    [123456, 'Eintausendzweihundertvierunddreißig Euro und sechsundfünfzig Cent'],
    [1000000, 'Zehntausend Euro'],
    [100000000, 'Eine Million Euro'],
    [250000000, 'Zwei Millionen fünfhunderttausend Euro'],
  ])('writes %i cents as %j', (cents, expected) => {
    expect(amountInWords(cents)).toBe(expected);
  });

  it('writes the amount as one word per number, joined the German way', () => {
    expect(amountInWords(123456)).not.toMatch(/Tausend Zwei|Hundert Vier/);
  });

  it('does not add a cent part for whole euro amounts', () => {
    expect(amountInWords(500)).not.toContain('Cent');
  });

  it('does not lose precision on amounts that are inexact as floats', () => {
    // 0.1 + 0.2 style values: 1,10 € must not become 1,09 € or 1,11 €
    expect(amountInWords(110)).toBe('Ein Euro und zehn Cent');
    expect(amountInWords(29)).toBe('Neunundzwanzig Cent');
  });
});

describe('formatAmount', () => {
  it('formats euro amounts in German locale', () => {
    const result = formatAmount(100);
    expect(result).toContain('1');
    expect(result).toContain('€');
  });

  it('formats with decimal places', () => {
    const result = formatAmount(150);
    expect(result).toContain('1');
    expect(result).toContain('50');
  });

  it('formats large amounts', () => {
    const result = formatAmount(100000);
    expect(result).toContain('1.000');
  });
});

describe('formatDate', () => {
  it('formats a date in German dd.mm.yyyy format', () => {
    const date = new Date('2024-01-15T00:00:00Z');
    const result = formatDate(date);
    expect(result).toMatch(/15\.01\.2024/);
  });

  it('pads day and month with leading zeros', () => {
    const date = new Date('2024-03-05T00:00:00Z');
    const result = formatDate(date);
    expect(result).toMatch(/05\.03\.2024/);
  });
});

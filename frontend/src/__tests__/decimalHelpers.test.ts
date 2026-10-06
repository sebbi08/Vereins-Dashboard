import { describe, expect, it } from 'vitest';
import { formatDecimal, parseDecimal } from '../utils/decimalInput';

describe('parseDecimal', () => {
  it.each([
    ['12,50', 2, 12.5],
    ['12.50', 2, 12.5],
    ['12.5', 2, 12.5],
    ['1250', 2, 1250],
    ['1.250', 2, 1250],
    ['1.250,00', 2, 1250],
    ['1.234.567,8', 2, 1234567.8],
    [' 12,50 € ', 2, 12.5],
    ['0', 2, 0],
    ['6', 0, 6],
    ['3.25', 2, 3.25],
    ['0.5', 2, 0.5],
    ['0,5', 2, 0.5],
    ['1.000.000,00', 2, 1000000],
    ['12,', 2, 12],
    ['12.', 2, 12],
    ['1.250,', 2, 1250],
  ])('parses %j (max %i decimals) as %d', (text, max, expected) => {
    expect(parseDecimal(text, max)).toBe(expected);
  });

  it.each(['', '   ', ' € '])('returns null for empty input %j', (text) => {
    expect(parseDecimal(text, 2)).toBeNull();
  });

  it.each([
    ['abc', 2],
    ['12,505', 2],
    ['1,2,3', 2],
    ['1,5', 0],
    ['1.5', 0],
    ['-5', 2],
    [',5', 2],
    ['1.25.0', 2],
    ['0.500', 2],
    ['01.250', 2],
    ['12 50', 2],
    ['1 2', 2],
    ['12345678901234567890', 2],
  ])('rejects %j (max %i decimals)', (text, max) => {
    expect(parseDecimal(text, max)).toBeNaN();
  });
});

describe('parseDecimal without grouping', () => {
  it.each([
    ['3.5', 3.5],
    ['3,25', 3.25],
    ['1000', 1000],
    ['12,', 12],
  ])('parses %j as %d', (text, expected) => {
    expect(parseDecimal(text, 2, false)).toBe(expected);
  });

  it.each(['4.333', '1.000', '1.250,00'])('rejects %j', (text) => {
    expect(parseDecimal(text, 2, false)).toBeNaN();
  });
});

describe('formatDecimal', () => {
  it('leaves out thousands grouping when asked', () => {
    expect(formatDecimal(1000, 0, 2, false)).toBe('1000');
    expect(formatDecimal(1000, 0, 2)).toBe('1.000');
  });

  it.each([
    [1250.5, 2, 2, '1.250,50'],
    [12, 2, 2, '12,00'],
    [3.25, 0, 2, '3,25'],
    [3.5, 0, 2, '3,5'],
    [6, 0, 0, '6'],
  ])('formats %d (min %i, max %i) as %j', (value, min, max, expected) => {
    expect(formatDecimal(value, min, max)).toBe(expected);
  });
});

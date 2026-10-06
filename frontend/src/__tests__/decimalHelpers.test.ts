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
    ['12,', 2],
    [',5', 2],
    ['1.25.0', 2],
  ])('rejects %j (max %i decimals)', (text, max) => {
    expect(parseDecimal(text, max)).toBeNaN();
  });
});

describe('formatDecimal', () => {
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

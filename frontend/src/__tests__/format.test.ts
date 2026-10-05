import { describe, expect, it } from 'vitest';
import { centsToEuroInput, formatCents, formatHours, parseEuroToCents } from '../utils/format';

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
    ['0,015', 2],
  ])('parses %j to cents', (text, cents) => {
    expect(parseEuroToCents(text)).toBe(cents);
  });

  it.each(['', '   ', 'abc', '1.234,50'])('returns NaN for %j', (text) => {
    expect(parseEuroToCents(text)).toBeNaN();
  });

  it('formats cents for an input field', () => {
    expect(centsToEuroInput(1250)).toBe('12,50');
    expect(centsToEuroInput(1200)).toBe('12,00');
  });
});

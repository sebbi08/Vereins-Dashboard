import { describe, expect, it } from 'vitest';
import { betragInWorten, formatBetrag, formatDatum } from '../../services/betragInWorten';

describe('betragInWorten', () => {
  it('converts whole euro amounts', () => {
    // to-words de-DE: 1 → "Eins"
    expect(betragInWorten(100)).toBe('Eins Euro');
  });

  it('converts amounts with cents', () => {
    expect(betragInWorten(150)).toBe('Eins Euro und Fünfzig Cent');
  });

  it('converts two euro amounts', () => {
    expect(betragInWorten(200)).toBe('Zwei Euro');
  });

  it('converts large amounts', () => {
    expect(betragInWorten(10000)).toBe('Hundert Euro');
  });

  it('capitalises the first letter', () => {
    const result = betragInWorten(200);
    expect(result.charAt(0)).toBe(result.charAt(0).toUpperCase());
  });

  it('handles zero cents (no cent suffix)', () => {
    const result = betragInWorten(500);
    expect(result).not.toContain('Cent');
  });

  it('includes cent suffix when cents are present', () => {
    const result = betragInWorten(501);
    expect(result).toContain('Cent');
  });
});

describe('formatBetrag', () => {
  it('formats euro amounts in German locale', () => {
    const result = formatBetrag(100);
    expect(result).toContain('1');
    expect(result).toContain('€');
  });

  it('formats with decimal places', () => {
    const result = formatBetrag(150);
    expect(result).toContain('1');
    expect(result).toContain('50');
  });

  it('formats large amounts', () => {
    const result = formatBetrag(100000);
    expect(result).toContain('1.000');
  });
});

describe('formatDatum', () => {
  it('formats a date in German dd.mm.yyyy format', () => {
    const date = new Date('2024-01-15T00:00:00Z');
    const result = formatDatum(date);
    expect(result).toMatch(/15\.01\.2024/);
  });

  it('pads day and month with leading zeros', () => {
    const date = new Date('2024-03-05T00:00:00Z');
    const result = formatDatum(date);
    expect(result).toMatch(/05\.03\.2024/);
  });
});

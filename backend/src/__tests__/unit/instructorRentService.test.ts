import { describe, expect, it } from 'vitest';
import { parseWeeksPerMonth } from '../../services/instructorRent';

describe('parseWeeksPerMonth', () => {
  it('parses a stored positive number', () => {
    expect(parseWeeksPerMonth('4.5')).toBe(4.5);
  });

  it.each([undefined, '', 'abc', '0', '-2'])('falls back to 3.25 for %s', (value) => {
    expect(parseWeeksPerMonth(value)).toBe(3.25);
  });
});

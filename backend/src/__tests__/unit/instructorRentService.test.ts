import { describe, expect, it } from 'vitest';
import {
  buildInvoiceLineText,
  formatDecimal,
  parseInstructorSaveBody,
  parseWeeksPerMonth,
} from '../../services/instructorRent';

describe('parseWeeksPerMonth', () => {
  it('parses a stored positive number', () => {
    expect(parseWeeksPerMonth('4.5')).toBe(4.5);
  });

  it.each([undefined, '', 'abc', '0', '-2'])('falls back to 3.25 for %s', (value) => {
    expect(parseWeeksPerMonth(value)).toBe(3.25);
  });
});

const validBody = {
  recipientData: { name: 'Anna Alt', street: 'Hauptstr. 1', city: '12345 Berlin' },
  hourlyRateCents: 1200,
  months: 6,
  timeBlocks: [
    { weekday: 'MO', start: '14:00', end: '18:00', breaks: [{ start: '16:00', end: '16:30' }] },
  ],
};

describe('parseInstructorSaveBody', () => {
  it('parses a valid body', () => {
    expect(parseInstructorSaveBody(validBody)).toEqual({
      recipientId: undefined,
      recipientData: {
        name: 'Anna Alt',
        street: 'Hauptstr. 1',
        city: '12345 Berlin',
        email: null,
        salutation: null,
      },
      inputs: {
        hourlyRateCents: 1200,
        months: 6,
        timeBlocks: validBody.timeBlocks,
      },
    });
  });

  it('keeps a numeric recipientId', () => {
    const parsed = parseInstructorSaveBody({ ...validBody, recipientId: 7 });
    expect(parsed).toMatchObject({ recipientId: 7 });
  });

  it.each([
    ['null body', null],
    ['missing timeBlocks', { ...validBody, timeBlocks: undefined }],
    ['timeBlocks not an array', { ...validBody, timeBlocks: 'MO 8-12' }],
    ['rate as string', { ...validBody, hourlyRateCents: '1200' }],
    [
      'break without end',
      {
        ...validBody,
        timeBlocks: [{ weekday: 'MO', start: '08:00', end: '12:00', breaks: [{ start: '10:00' }] }],
      },
    ],
    [
      'block without breaks array',
      { ...validBody, timeBlocks: [{ weekday: 'MO', start: '08:00', end: '12:00' }] },
    ],
    ['recipientId as string', { ...validBody, recipientId: '7' }],
    ['recipientData without city', { ...validBody, recipientData: { name: 'A', street: 'B' } }],
  ])('rejects %s', (_label, body) => {
    expect(parseInstructorSaveBody(body)).toEqual({ error: 'Invalid request body' });
  });

  it('rejects a blank recipient name', () => {
    expect(
      parseInstructorSaveBody({
        ...validBody,
        recipientData: { ...validBody.recipientData, name: '  ' },
      }),
    ).toEqual({ error: 'Recipient name is required' });
  });
});

describe('formatDecimal', () => {
  it.each([
    [7.5, 2, true, '7,5'],
    [3.25, 2, true, '3,25'],
    [8, 2, true, '8'],
    [10, 2, true, '10'],
    [1 / 3, 2, true, '0,33'],
    [12, 2, false, '12,00'],
    [12.5, 2, false, '12,50'],
  ])('formats %s', (value, digits, trim, expected) => {
    expect(formatDecimal(value, digits, trim)).toBe(expected);
  });
});

describe('buildInvoiceLineText', () => {
  const timeBlocks = [{ weekday: 'MO' as const, start: '08:00', end: '15:30', breaks: [] }];

  it('describes the calculation in German', () => {
    expect(buildInvoiceLineText({ hourlyRateCents: 1200, months: 6, timeBlocks }, 3.25)).toBe(
      'Raummiete 6 Monate (7,5 h/Woche × 3,25 Wochen × 6 Monate × 12,00 €)',
    );
  });

  it('uses the singular for one month', () => {
    expect(buildInvoiceLineText({ hourlyRateCents: 1250, months: 1, timeBlocks }, 4)).toBe(
      'Raummiete 1 Monat (7,5 h/Woche × 4 Wochen × 1 Monat × 12,50 €)',
    );
  });
});

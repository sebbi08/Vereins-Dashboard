import { describe, expect, it } from 'vitest';
import { parseInstructorSaveBody, parseWeeksPerMonth } from '../../services/instructorRent';

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

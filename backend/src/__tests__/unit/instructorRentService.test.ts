import { describe, expect, it } from 'vitest';
import {
  parseInstructorSaveBody,
  parseSettingsUpdate,
  parseWeeksPerMonth,
  storedInvoiceTemplate,
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

describe('parseSettingsUpdate', () => {
  it('accepts weeksPerMonth alone', () => {
    expect(parseSettingsUpdate({ weeksPerMonth: 4 })).toEqual({ weeksPerMonth: 4 });
  });

  it('accepts a template alone and normalizes line endings', () => {
    expect(parseSettingsUpdate({ invoiceTemplate: 'Miete {name}\r\n{zeiten}' })).toEqual({
      invoiceTemplate: 'Miete {name}\n{zeiten}',
    });
  });

  it.each([null, '', '  \n '])('treats template %j as reset to default', (invoiceTemplate) => {
    expect(parseSettingsUpdate({ invoiceTemplate })).toEqual({ invoiceTemplate: null });
  });

  it('accepts both keys together', () => {
    expect(parseSettingsUpdate({ weeksPerMonth: 4, invoiceTemplate: '{name}' })).toEqual({
      weeksPerMonth: 4,
      invoiceTemplate: '{name}',
    });
  });

  it.each([{}, { other: 1 }])('rejects %j as nothing to update', (body) => {
    expect(parseSettingsUpdate(body)).toEqual({ error: 'Nothing to update' });
  });

  it.each([null, 'x', [1]])('rejects non-object body %j', (body) => {
    expect(parseSettingsUpdate(body)).toEqual({ error: 'Invalid request body' });
  });

  it('rejects a non-string template', () => {
    expect(parseSettingsUpdate({ invoiceTemplate: 5 })).toEqual({ error: 'Invalid request body' });
  });

  it('rejects an invalid template with the validator message', () => {
    expect(parseSettingsUpdate({ invoiceTemplate: '{monat}' })).toEqual({
      error: 'Unknown placeholders: {monat}',
    });
  });

  it.each([null, '4'])('rejects weeksPerMonth %j', (weeksPerMonth) => {
    expect(parseSettingsUpdate({ weeksPerMonth })).toEqual({
      error: 'Weeks per month must be greater than 0',
    });
  });

  it('rejects weeksPerMonth with more than 2 decimals', () => {
    expect(parseSettingsUpdate({ weeksPerMonth: 4.333 })).toEqual({
      error: 'Weeks per month may have at most 2 decimals',
    });
  });

  it('validates both keys before accepting either', () => {
    expect(parseSettingsUpdate({ weeksPerMonth: 4, invoiceTemplate: '{monat}' })).toEqual({
      error: 'Unknown placeholders: {monat}',
    });
  });
});

describe('storedInvoiceTemplate', () => {
  it.each([undefined, '', '  \n'])('maps %j to null', (value) => {
    expect(storedInvoiceTemplate(value)).toBeNull();
  });

  it('keeps a stored template', () => {
    expect(storedInvoiceTemplate('Miete {name}')).toBe('Miete {name}');
  });
});

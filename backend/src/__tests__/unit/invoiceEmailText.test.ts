import { describe, expect, it } from 'vitest';
import {
  buildInvoiceEmailText,
  fillInvoiceNumber,
  storedOrBuiltEmailText,
} from '../../services/invoiceEmailText';

const values = {
  emailSalutation: 'Sehr geehrte Frau Alt',
  name: 'Anna Alt',
  title: 'Raummiete Oktober',
  email: 'anna@example.org',
};

const settings = [
  { key: 'emailSubject', value: 'Rechnung {number}: {title}' },
  { key: 'emailBody', value: '{salutation},\n\nRechnung {number} für {name} ({email}).' },
];

describe('buildInvoiceEmailText', () => {
  it('fills in the values and keeps {number} for sending', () => {
    expect(buildInvoiceEmailText(settings, values)).toEqual({
      emailSubject: 'Rechnung {number}: Raummiete Oktober',
      emailBody: 'Sehr geehrte Frau Alt,\n\nRechnung {number} für Anna Alt (anna@example.org).',
    });
  });

  it('uses the default templates when the settings are empty or missing', () => {
    const expected = {
      emailSubject: 'Ihre Rechnung {number}',
      emailBody:
        'Sehr geehrte Frau Alt\n\nanbei erhalten Sie Ihre Rechnung {number}.\n\nMit freundlichen Grüßen',
    };
    expect(buildInvoiceEmailText([], values)).toEqual(expected);
    expect(
      buildInvoiceEmailText(
        [
          { key: 'emailSubject', value: '' },
          { key: 'emailBody', value: '' },
        ],
        values,
      ),
    ).toEqual(expected);
  });

  it('puts values in literally, whatever they contain', () => {
    const text = buildInvoiceEmailText(settings, {
      ...values,
      name: 'A {title} $& $1 B',
      title: 'Kurs {name}',
    });
    expect(text.emailSubject).toBe('Rechnung {number}: Kurs {name}');
    expect(text.emailBody).toContain('für A {title} $& $1 B (');
  });

  it('builds a subject that fits one line of at most 200 characters', () => {
    const multiline = [{ key: 'emailSubject', value: 'Rechnung\r\n{number}\n{title}' }];
    expect(buildInvoiceEmailText(multiline, values).emailSubject).toBe(
      'Rechnung {number} Raummiete Oktober',
    );

    const long = buildInvoiceEmailText(settings, { ...values, title: 'x'.repeat(500) });
    expect(long.emailSubject).toHaveLength(200);
  });
});

describe('fillInvoiceNumber', () => {
  it('replaces every {number} and nothing else', () => {
    expect(fillInvoiceNumber('Nr. {number} / {number}, {name}', '7 / 2026')).toBe(
      'Nr. 7 / 2026 / 7 / 2026, {name}',
    );
  });
});

describe('storedOrBuiltEmailText', () => {
  it('prefers the stored text', () => {
    const stored = { emailSubject: 'Mein Betreff', emailBody: 'Mein Text' };
    expect(storedOrBuiltEmailText(stored, settings, values)).toEqual(stored);
  });

  it('builds the text when nothing is stored', () => {
    const built = buildInvoiceEmailText(settings, values);
    expect(
      storedOrBuiltEmailText({ emailSubject: null, emailBody: null }, settings, values),
    ).toEqual(built);
    expect(storedOrBuiltEmailText({}, settings, values)).toEqual(built);
  });
});

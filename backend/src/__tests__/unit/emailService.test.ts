import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — applied before any module loads
// ---------------------------------------------------------------------------
const { sendMailMock, createTransportMock } = vi.hoisted(() => {
  const sendMailMock = vi.fn();
  const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }));
  return { sendMailMock, createTransportMock };
});

vi.mock('nodemailer', () => ({
  default: { createTransport: createTransportMock },
}));

vi.mock('../config.js', () => ({
  toAbsolutePath: vi.fn((p: string) => `/data/${p}`),
  ABSOLUTE_DATA_DIR: '/data',
  DATA_DIR: '/data',
}));

// ---------------------------------------------------------------------------
// Imports — mocks are applied by the time these load
// ---------------------------------------------------------------------------
import { getSetting, replaceVariables, sendInvoiceEmail } from '../../services/emailService';

// ---------------------------------------------------------------------------
// Unit tests for the pure helper functions
// ---------------------------------------------------------------------------

describe('getSetting', () => {
  const rows = [
    { key: 'smtpHost', value: 'smtp.example.com' },
    { key: 'smtpPort', value: '587' },
    { key: 'emailSubject', value: 'Invoice {number}' },
  ];

  it('returns the value for an existing key', () => {
    expect(getSetting(rows, 'smtpHost')).toBe('smtp.example.com');
  });

  it('returns empty string for a missing key', () => {
    expect(getSetting(rows, 'nonexistent')).toBe('');
  });

  it('returns empty string when the array is empty', () => {
    expect(getSetting([], 'smtpHost')).toBe('');
  });

  it('returns the first match when there are duplicate keys', () => {
    const dupes = [
      { key: 'a', value: 'first' },
      { key: 'a', value: 'second' },
    ];
    expect(getSetting(dupes, 'a')).toBe('first');
  });
});

describe('replaceVariables', () => {
  it('replaces {salutation}, {name}, {number}, {email} in a template', () => {
    const template = '{salutation} {name},\n\nRechnung {number}\n\n{email}';
    const vars = {
      salutation: 'Herr',
      name: 'Max Mustermann',
      number: '2024-001',
      email: 'max@example.com',
    };
    const result = replaceVariables(template, vars);
    expect(result).toBe('Herr Max Mustermann,\n\nRechnung 2024-001\n\nmax@example.com');
  });

  it('replaces a single variable', () => {
    expect(replaceVariables('Hallo {name}', { name: 'Anna' })).toBe('Hallo Anna');
  });

  it('leaves the template unchanged when no variables match', () => {
    const template = 'Hello {something}';
    expect(replaceVariables(template, { other: 'x' })).toBe('Hello {something}');
  });

  it('replaces multiple occurrences of the same variable', () => {
    const template = '{name} — reminder for {name}';
    expect(replaceVariables(template, { name: 'John' })).toBe('John — reminder for John');
  });

  it('handles an empty vars object (no replacements)', () => {
    const template = '{salutation} {name}';
    expect(replaceVariables(template, {})).toBe('{salutation} {name}');
  });

  it('handles special characters in variable values', () => {
    const template = 'Subject: {subject}';
    const vars = { subject: '100% "free" & more' };
    expect(replaceVariables(template, vars)).toBe('Subject: 100% "free" & more');
  });

  it('replaces {name} inside {{name}} (replaceAll replaces all occurrences of the pattern)', () => {
    // replaceAll('{name}', 'Bob') on '{{name}}' → '{Bob}'
    const template = '{{name}} and {name}';
    expect(replaceVariables(template, { name: 'Bob' })).toBe('{Bob} and Bob');
  });
});

// ---------------------------------------------------------------------------
// Tests for dev-override logic in sendInvoiceEmail
// ---------------------------------------------------------------------------

describe('sendInvoiceEmail — dev override', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  // Shared fixture data
  const smtpSettings = [
    { key: 'smtpHost', value: 'smtp.example.com' },
    { key: 'smtpPort', value: '587' },
    { key: 'smtpUser', value: 'user@example.com' },
    { key: 'smtpPassword', value: 'secret' },
    { key: 'smtpSecure', value: 'false' },
    { key: 'emailSubject', value: 'Rechnung {number}' },
    { key: 'emailBody', value: '{salutation}\n\nRechnung {number}.' },
    { key: 'emailTestAddress', value: 'test@example.com' },
  ];

  const revision = {
    id: 1,
    emailSalutation: 'Herr',
    name: 'Max Mustermann',
    email: 'max@example.com',
    pdfStatus: 'OK' as const,
    filePath: 'invoices/1/r1/doc.pdf',
    invoice: { number: '2024-001' },
  };

  function buildPrismaMock(
    overrides: Partial<{
      settings: typeof smtpSettings;
      revision: typeof revision | null;
    }> = {},
  ) {
    return {
      systemSetting: {
        findMany: vi
          .fn()
          .mockResolvedValue('settings' in overrides ? overrides.settings : smtpSettings),
      },
      invoiceRevision: {
        findUnique: vi
          .fn()
          .mockResolvedValue('revision' in overrides ? overrides.revision : revision),
        update: vi.fn().mockResolvedValue({}),
      },
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    sendMailMock.mockReset();
    sendMailMock.mockResolvedValue({ messageId: 'test-msg-id' });
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  // ------------------------------------------------------------------
  // Dev-override: NODE_ENV !== 'production' + testAddress → redirect
  // ------------------------------------------------------------------

  it('redirects to test address and prepends dev notice when NODE_ENV is not production', async () => {
    process.env.NODE_ENV = 'development';

    const result = await sendInvoiceEmail(buildPrismaMock(), 1);

    expect(result.success).toBe(true);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const mailOpts = sendMailMock.mock.calls[0][0];
    expect(mailOpts.to).toBe('test@example.com');
    expect(mailOpts.text).toContain(
      '[DEV OVERRIDE — Original recipient: Max Mustermann <max@example.com>]',
    );
    expect(mailOpts.text).toContain('Herr');
    expect(mailOpts.text).toContain('Rechnung 2024-001');
  });

  it('does NOT redirect when NODE_ENV is production', async () => {
    process.env.NODE_ENV = 'production';

    const result = await sendInvoiceEmail(buildPrismaMock(), 1);

    expect(result.success).toBe(true);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const mailOpts = sendMailMock.mock.calls[0][0];
    expect(mailOpts.to).toBe('max@example.com');
    expect(mailOpts.text).not.toContain('[DEV OVERRIDE');
  });

  it('does NOT redirect when NODE_ENV is not production but testAddress is empty', async () => {
    process.env.NODE_ENV = 'development';

    const settingsWithoutTest = smtpSettings.map((s) =>
      s.key === 'emailTestAddress' ? { ...s, value: '' } : s,
    );

    const result = await sendInvoiceEmail(buildPrismaMock({ settings: settingsWithoutTest }), 1);

    expect(result.success).toBe(true);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const mailOpts = sendMailMock.mock.calls[0][0];
    expect(mailOpts.to).toBe('max@example.com');
    expect(mailOpts.text).not.toContain('[DEV OVERRIDE');
  });

  it('returns error when revision is not found', async () => {
    process.env.NODE_ENV = 'development';

    const result = await sendInvoiceEmail(buildPrismaMock({ revision: null }), 999);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Revision not found');
  });

  it('returns error when SMTP settings are missing', async () => {
    process.env.NODE_ENV = 'development';

    const result = await sendInvoiceEmail(
      buildPrismaMock({
        settings: [
          { key: 'smtpHost', value: '' },
          { key: 'smtpUser', value: '' },
          { key: 'smtpPassword', value: '' },
        ],
      }),
      1,
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('SMTP settings are not configured');
  });
});

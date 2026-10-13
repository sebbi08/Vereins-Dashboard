import supertest from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMailMock } = vi.hoisted(() => ({ sendMailMock: vi.fn() }));
vi.mock('nodemailer', () => ({
  default: { createTransport: vi.fn(() => ({ sendMail: sendMailMock })) },
}));

import { createApp } from '../../app';
import { initializeApp } from '../../init';
import { prisma } from '../../prismaClient';
import { useCleanDatabase } from './helpers';

let request: ReturnType<typeof supertest>;

beforeAll(async () => {
  await initializeApp();
  request = supertest(createApp());
});

useCleanDatabase();

beforeEach(() => {
  sendMailMock.mockReset().mockResolvedValue({ messageId: 'id' });
});

async function seedSettings() {
  const settings: Record<string, string> = {
    smtpHost: 'smtp.example.com',
    smtpPort: '587',
    smtpUser: 'user@example.com',
    smtpPassword: 'secret',
    smtpSecure: 'false',
    emailTestAddress: 'test@example.com',
  };
  for (const [key, value] of Object.entries(settings)) {
    await prisma.systemSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
}

async function seedInvoice() {
  const template = await prisma.template.create({
    data: {
      type: 'RECHNUNG',
      version: 1,
      fileName: 'template.docx',
      filePath: 'templates/template.docx',
      active: true,
    },
  });
  const recipient = await prisma.invoiceRecipient.create({
    data: {
      name: 'Test Firma',
      street: 'Teststraße 1',
      city: 'Teststadt',
      email: 'x@example.com',
    },
  });
  const invoice = await prisma.invoice.create({
    data: {
      number: '1 / 2026',
      year: 2026,
      runningNumber: 1,
      recipientId: recipient.id,
      invoiceDate: new Date('2026-06-01'),
    },
  });
  const revision = await prisma.invoiceRevision.create({
    data: {
      invoiceId: invoice.id,
      revisionNumber: 1,
      salutation: '',
      name: 'Test Firma',
      street: 'Teststraße 1',
      city: 'Teststadt',
      invoiceDate: new Date('2026-06-01'),
      title: 'Test Rechnung',
      positions: JSON.stringify([{ text: 'Position', priceInCents: 10000 }]),
      vat: 19,
      directDebit: false,
      email: 'x@example.com',
      emailSalutation: 'Hallo',
      templateId: template.id,
      pdfStatus: 'OK',
      filePath: 'invoices/1/r1/doc.pdf',
    },
  });
  return { invoice, revision };
}

describe('invoice email text to the mail', () => {
  it('sends the edited text with only the number filled in and keeps the status', async () => {
    await seedSettings();
    const { invoice, revision } = await seedInvoice();

    const patch = await request.patch(`/api/invoice/${invoice.id}/email-text`).send({
      emailSubject: 'Eigener Betreff {number} {title}',
      emailBody: 'Eigener Text {number}',
    });
    expect(patch.status).toBe(200);

    const res = await request.post(`/api/invoice/revision/${revision.id}/send-test-email`);

    expect(res.status).toBe(200);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const mail = sendMailMock.mock.calls[0][0];
    expect(mail.subject).toBe('Eigener Betreff 1 / 2026 {title}');
    expect(mail.text).toBe(
      '[TEST SEND — Original recipient: Test Firma <x@example.com>]\n\nEigener Text 1 / 2026',
    );
    const stored = await prisma.invoiceRevision.findUniqueOrThrow({ where: { id: revision.id } });
    expect(stored.emailStatus).toBe('NOT_SENT');
  });
});

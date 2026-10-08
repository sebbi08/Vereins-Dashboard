import supertest from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
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

describe('Email Settings API', () => {
  it('GET /api/email-settings returns empty object by default (no email settings seeded)', async () => {
    const res = await request.get('/api/email-settings');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });

  it('PUT /api/email-settings saves and GET returns saved settings', async () => {
    // Save settings
    const putRes = await request
      .put('/api/email-settings')
      .send({ smtpHost: 'smtp.test.com', smtpPort: '587', emailSubject: 'Test {number}' });
    expect(putRes.status).toBe(200);
    expect(putRes.body.message).toBe('Email settings saved');

    // Read back
    const getRes = await request.get('/api/email-settings');
    expect(getRes.status).toBe(200);
    expect(getRes.body.smtpHost).toBe('smtp.test.com');
    expect(getRes.body.emailSubject).toBe('Test {number}');
  });

  it('POST /api/email-settings/test fails without valid SMTP config', async () => {
    const res = await request.post('/api/email-settings/test');
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  /** An invoice revision with a finished PDF, ready to be sent. */
  async function seedSendableRevision() {
    const template = await prisma.template.create({
      data: { type: 'RECHNUNG', version: 1, fileName: 't.docx', filePath: 't', active: true },
    });
    const recipient = await prisma.invoiceRecipient.create({
      data: { name: 'Firma', street: 'Str. 1', city: 'Stadt', email: 'firma@example.org' },
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
    return prisma.invoiceRevision.create({
      data: {
        invoiceId: invoice.id,
        revisionNumber: 1,
        salutation: '',
        name: 'Firma',
        street: 'Str. 1',
        city: 'Stadt',
        invoiceDate: new Date('2026-06-01'),
        title: 'Rechnung',
        positions: '[]',
        vat: 19,
        directDebit: false,
        email: 'firma@example.org',
        emailSalutation: 'Hallo',
        templateId: template.id,
        pdfStatus: 'OK',
        filePath: 'invoices/1/r1/1-2026-R1.pdf',
      },
    });
  }

  it('POST /api/invoice/revision/:id/send-email reports missing SMTP settings', async () => {
    const revision = await seedSendableRevision();
    const res = await request.post(`/api/invoice/revision/${revision.id}/send-email`);
    expect(res.status).toBe(400);
    expect(res.body.emailError).toBe('SMTP settings are not configured');
  });

  it('POST /api/invoice/revision/:id/send-test-email reports missing SMTP settings', async () => {
    const revision = await seedSendableRevision();
    const res = await request.post(`/api/invoice/revision/${revision.id}/send-test-email`);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('SMTP settings are not configured');
  });
});

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

/** A revision that claims a finished PDF whose file does not exist. */
async function seedRevisionWithMissingPdf() {
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
    data: { name: 'Test Firma', street: 'Teststraße 1', city: 'Teststadt', email: null },
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
      name: 'Test Firma',
      street: 'Teststraße 1',
      city: 'Teststadt',
      invoiceDate: new Date('2026-06-01'),
      title: 'Test Rechnung',
      positions: '[]',
      vat: 19,
      directDebit: false,
      email: '',
      emailSalutation: '',
      templateId: template.id,
      pdfStatus: 'OK',
      filePath: 'invoices/missing/1-R1.pdf',
    },
  });
}

// A request that used to crash the process never gets a response; fail fast instead of waiting.
const CRASH_TIMEOUT = 10_000;

describe('error handling', () => {
  it(
    'answers a malformed invoice body with a JSON error and keeps serving',
    async () => {
      const res = await request.post('/api/invoice').send({});
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.body).toHaveProperty('error');
      expect((await request.get('/api/health')).status).toBe(200);
    },
    CRASH_TIMEOUT,
  );

  it('answers invalid JSON with a 400 JSON error', async () => {
    const res = await request
      .post('/api/invoice')
      .set('Content-Type', 'application/json')
      .send('{');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it.each(['/api/donor/999999', '/api/invoice-recipient/999999'])(
    'answers PATCH %s for an unknown id with 404',
    async (url) => {
      const res = await request.patch(url).send({ name: 'x', street: 'y', city: 'z' });
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    },
    CRASH_TIMEOUT,
  );

  it(
    'answers a download whose PDF is missing on disk with 404 and keeps serving',
    async () => {
      const revision = await seedRevisionWithMissingPdf();
      const res = await request.get(`/api/invoice/revision/${revision.id}/download`);
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
      expect((await request.get('/api/health')).status).toBe(200);
    },
    CRASH_TIMEOUT,
  );
});

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

async function seedRecipientAndInvoice(overrides?: {
  pdfStatus?: string;
  filePath?: string | null;
  status?: string;
}) {
  const template = await prisma.template.create({
    data: {
      type: 'RECHNUNG',
      version: 1,
      fileName: 'test.docx',
      filePath: 'templates/test.docx',
      active: true,
    },
  });
  const recipient = await prisma.invoiceRecipient.create({
    data: { name: 'Test GmbH', street: 'Teststr. 1', city: 'Berlin', email: 'test@test.de' },
  });
  const invoice = await prisma.invoice.create({
    data: {
      number: `RE-2026-${Math.floor(Math.random() * 9000) + 1000}`,
      year: 2026,
      runningNumber: 1,
      recipientId: recipient.id,
      invoiceDate: new Date('2026-01-15'),
      status: overrides?.status || 'AKTIV',
    },
  });
  const revision = await prisma.invoiceRevision.create({
    data: {
      invoiceId: invoice.id,
      revisionNumber: 1,
      status: 'AKTIV',
      salutation: 'Herr',
      name: 'Test GmbH',
      street: 'Teststr. 1',
      city: 'Berlin',
      invoiceDate: new Date('2026-01-15'),
      title: 'Consulting',
      positions: JSON.stringify([{ text: 'Item 1', priceInCents: 10000 }]),
      vat: 19,
      directDebit: false,
      email: 'test@test.de',
      emailSalutation: 'Sehr geehrte Damen und Herren',
      templateId: template.id,
      pdfStatus: overrides?.pdfStatus || 'OK',
      filePath:
        overrides?.filePath === undefined
          ? 'invoices/99/r1/test.pdf'
          : (overrides?.filePath ?? null),
    },
  });
  return { template, recipient, invoice, revision };
}

describe('POST /api/invoice/download-batch', () => {
  it('returns ZIP with correct content type and filename for valid IDs', async () => {
    const { invoice } = await seedRecipientAndInvoice();

    const res = await request.post('/api/invoice/download-batch').send({ ids: [invoice.id] });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="rechnungen-/);
  });

  it('returns 400 when IDs array is empty', async () => {
    const res = await request.post('/api/invoice/download-batch').send({ ids: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('MISSING_IDS');
  });

  it('returns 400 when IDs array is missing', async () => {
    const res = await request.post('/api/invoice/download-batch').send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('MISSING_IDS');
  });

  it('returns 400 when an ID is not found', async () => {
    const res = await request.post('/api/invoice/download-batch').send({ ids: [99999] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('NOT_FOUND');
    expect(res.body.ids).toEqual([99999]);
  });

  it('returns 400 when an invoice is cancelled', async () => {
    const { invoice } = await seedRecipientAndInvoice({ status: 'STORNIERT' });

    const res = await request.post('/api/invoice/download-batch').send({ ids: [invoice.id] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('CANCELLED');
    expect(res.body.ids).toContain(invoice.id);
  });

  it('returns 400 when PDF is not ready (PENDING)', async () => {
    const { invoice } = await seedRecipientAndInvoice({ pdfStatus: 'PENDING', filePath: null });

    const res = await request.post('/api/invoice/download-batch').send({ ids: [invoice.id] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('PDF_NOT_READY');
    expect(res.body.ids).toContain(invoice.id);
  });

  it('returns 400 when PDF is FAILED', async () => {
    const { invoice } = await seedRecipientAndInvoice({ pdfStatus: 'FAILED', filePath: null });

    const res = await request.post('/api/invoice/download-batch').send({ ids: [invoice.id] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('PDF_NOT_READY');
    expect(res.body.ids).toContain(invoice.id);
  });

  it('reports all problematic IDs in one response', async () => {
    const { invoice: i1 } = await seedRecipientAndInvoice({ status: 'STORNIERT' });
    const { invoice: i2 } = await seedRecipientAndInvoice({ pdfStatus: 'PENDING', filePath: null });

    const res = await request.post('/api/invoice/download-batch').send({ ids: [i1.id, i2.id] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('CANCELLED');
    expect(res.body.ids).toContain(i1.id);
    expect(res.body.ids).toContain(i2.id);
  });

  it('works with multiple valid IDs', async () => {
    const { invoice: i1 } = await seedRecipientAndInvoice();
    const { invoice: i2 } = await seedRecipientAndInvoice();

    const res = await request.post('/api/invoice/download-batch').send({ ids: [i1.id, i2.id] });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
  });
});

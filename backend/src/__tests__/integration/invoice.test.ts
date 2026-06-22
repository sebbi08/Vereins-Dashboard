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

async function seedTemplate() {
  return prisma.template.create({
    data: {
      type: 'RECHNUNG',
      version: 1,
      fileName: 'template.docx',
      filePath: 'templates/template.docx',
      active: true,
    },
  });
}

async function seedRecipientAndInvoice() {
  const template = await seedTemplate();

  const recipient = await prisma.invoiceRecipient.create({
    data: {
      name: 'Test Firma',
      street: 'Teststraße 1',
      city: 'Teststadt',
      email: 'test@example.com',
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
      positions: JSON.stringify([{ text: 'Test Position', priceInCents: 10000 }]),
      vat: 19,
      directDebit: false,
      email: 'test@example.com',
      emailSalutation: 'Sehr geehrte Damen und Herren',
      templateId: template.id,
      pdfStatus: 'OK',
    },
  });

  return { template, recipient, invoice, revision };
}

const gInputs = {
  salutation: '',
  name: 'Test Firma',
  street: 'Teststraße 1',
  city: 'Teststadt',
  invoiceDate: '2026-06-01',
  title: 'Test Rechnung',
  lineItems: [{ text: 'Test Position', priceInCents: 10000 }],
  vat: 19,
  directDebit: false,
  email: 'test@example.com',
  emailSalutation: 'Sehr geehrte Damen und Herren',
};

describe('GET /api/invoice', () => {
  it('returns empty list when no invoices exist', async () => {
    const res = await request.get('/api/invoice');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns list of active invoices', async () => {
    await seedRecipientAndInvoice();

    const res = await request.get('/api/invoice');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      number: '1 / 2026',
      status: 'AKTIV',
      recipientName: 'Test Firma',
    });
  });

  it('excludes cancelled invoices by default', async () => {
    const { invoice } = await seedRecipientAndInvoice();
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: 'STORNIERT' },
    });

    const res = await request.get('/api/invoice');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it('includes cancelled invoices when withCancelled=true', async () => {
    const { invoice } = await seedRecipientAndInvoice();
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: 'STORNIERT' },
    });

    const res = await request.get('/api/invoice?withCancelled=true');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].status).toBe('STORNIERT');
  });
});

describe('GET /api/invoice/recipient', () => {
  it('returns empty list when no recipients exist', async () => {
    const res = await request.get('/api/invoice/recipient');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns recipients matching search', async () => {
    await prisma.invoiceRecipient.create({
      data: { name: 'Test Firma', street: 'X', city: 'Y' },
    });

    const res = await request.get('/api/invoice/recipient?search=Test');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe('GET /api/invoice/:id', () => {
  it('returns an invoice with revisions', async () => {
    const { invoice } = await seedRecipientAndInvoice();

    const res = await request.get(`/api/invoice/${invoice.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: invoice.id,
      number: '1 / 2026',
      status: 'AKTIV',
    });
    expect(res.body.revisions).toHaveLength(1);
  });

  it('returns 404 for non-existent invoice', async () => {
    const res = await request.get('/api/invoice/99999');
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid id', async () => {
    const res = await request.get('/api/invoice/invalid');
    expect(res.status).toBe(400);
  });
});

describe('POST /api/invoice', () => {
  it('returns 400 without template', async () => {
    const res = await request.post('/api/invoice').send({
      recipientData: { name: 'Test', street: 'X', city: 'Y' },
      inputs: gInputs,
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 with empty line items', async () => {
    await seedTemplate();
    const res = await request.post('/api/invoice').send({
      recipientData: { name: 'Test', street: 'X', city: 'Y' },
      inputs: { ...gInputs, lineItems: [] },
    });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/invoice/:id/cancel', () => {
  it('sets invoice status to STORNIERT', async () => {
    const { invoice } = await seedRecipientAndInvoice();

    const res = await request.patch(`/api/invoice/${invoice.id}/cancel`);
    expect(res.status).toBe(200);

    const updated = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(updated?.status).toBe('STORNIERT');
  });

  it('returns 404 for non-existent invoice', async () => {
    const res = await request.patch('/api/invoice/99999/cancel');
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid id', async () => {
    const res = await request.patch('/api/invoice/invalid/cancel');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/invoice/revision/:revisionId/download', () => {
  it('returns 404 when revision has no PDF', async () => {
    const { revision } = await seedRecipientAndInvoice();
    await prisma.invoiceRevision.update({
      where: { id: revision.id },
      data: { pdfStatus: 'FAILED', filePath: null },
    });

    const res = await request.get(`/api/invoice/revision/${revision.id}/download`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for non-existent revision', async () => {
    const res = await request.get('/api/invoice/revision/99999/download');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/invoice/revision/:revisionId/retry-pdf', () => {
  it('returns 400 when pdfStatus is not FAILED', async () => {
    const { revision } = await seedRecipientAndInvoice();
    const res = await request.post(`/api/invoice/revision/${revision.id}/retry-pdf`);
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent revision', async () => {
    const res = await request.post('/api/invoice/revision/99999/retry-pdf');
    expect(res.status).toBe(404);
  });
});

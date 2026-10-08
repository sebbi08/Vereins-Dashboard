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

  it('lists the newest invoice number first, comparing numbers as numbers', async () => {
    const { recipient } = await seedRecipientAndInvoice();
    for (const [year, runningNumber] of [
      [2026, 9],
      [2026, 10],
      [2025, 12],
    ]) {
      await prisma.invoice.create({
        data: {
          number: `${runningNumber} / ${year}`,
          year,
          runningNumber,
          recipientId: recipient.id,
          invoiceDate: new Date(`${year}-06-01`),
        },
      });
    }

    const res = await request.get('/api/invoice');

    expect(res.body.map((i: { number: string }) => i.number)).toEqual([
      '10 / 2026',
      '9 / 2026',
      '1 / 2026',
      '12 / 2025',
    ]);
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

describe('GET /api/invoice-recipient', () => {
  it('returns empty list when no recipients exist', async () => {
    const res = await request.get('/api/invoice-recipient');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns recipients matching search', async () => {
    await prisma.invoiceRecipient.create({
      data: { name: 'Test Firma', street: 'X', city: 'Y' },
    });

    const res = await request.get('/api/invoice-recipient?search=Test');
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

  it('creates an invoice with a new recipient, number and revision 1', async () => {
    await seedTemplate();
    const year = new Date().getFullYear();

    const res = await request.post('/api/invoice').send({
      recipientData: { name: 'Neue Firma', street: 'Weg 1', city: 'Stadt', email: 'n@example.com' },
      inputs: { ...gInputs, name: 'Neue Firma', street: 'Weg 1', city: 'Stadt' },
    });

    expect(res.status).toBe(201);
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: res.body.invoiceId },
      include: { revisions: true, recipient: true },
    });
    expect(invoice.number).toBe(`1 / ${year}`);
    expect(invoice.recipient.name).toBe('Neue Firma');
    expect(invoice.revisions).toHaveLength(1);
    expect(invoice.revisions[0]).toMatchObject({
      revisionNumber: 1,
      title: 'Test Rechnung',
      name: 'Neue Firma',
    });
  });

  it('updates an existing recipient in place when recipientId is given', async () => {
    await seedTemplate();
    const recipient = await prisma.invoiceRecipient.create({
      data: { name: 'Alt', street: 'Alt 1', city: 'Altstadt' },
    });

    const res = await request.post('/api/invoice').send({
      recipientId: recipient.id,
      inputs: { ...gInputs, name: 'Neu', street: 'Neu 2', city: 'Neustadt' },
    });

    expect(res.status).toBe(201);
    expect(await prisma.invoiceRecipient.count()).toBe(1);
    const updated = await prisma.invoiceRecipient.findUniqueOrThrow({
      where: { id: recipient.id },
    });
    expect(updated).toMatchObject({ name: 'Neu', street: 'Neu 2', city: 'Neustadt' });
  });

  it('returns 400 for an unknown recipientId', async () => {
    await seedTemplate();
    const res = await request.post('/api/invoice').send({ recipientId: 99999, inputs: gInputs });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Recipient not found');
    expect(await prisma.invoice.count()).toBe(0);
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

describe('POST /api/invoice/revision/:revisionId/send-email', () => {
  it('returns 400 when trying to send an older revision', async () => {
    const { template, invoice, revision } = await seedRecipientAndInvoice();

    await prisma.invoiceRevision.update({
      where: { id: revision.id },
      data: { status: 'ERSETZT' },
    });

    await prisma.invoiceRevision.create({
      data: {
        invoiceId: invoice.id,
        revisionNumber: 2,
        status: 'AKTIV',
        salutation: '',
        name: 'Test Firma',
        street: 'Teststraße 1',
        city: 'Teststadt',
        invoiceDate: new Date('2026-06-02'),
        title: 'Test Rechnung R2',
        positions: JSON.stringify([{ text: 'Test Position 2', priceInCents: 12000 }]),
        vat: 19,
        directDebit: false,
        email: 'test@example.com',
        emailSalutation: 'Sehr geehrte Damen und Herren',
        templateId: template.id,
        pdfStatus: 'OK',
      },
    });

    const sendOlder = await request.post(`/api/invoice/revision/${revision.id}/send-email`);
    expect(sendOlder.status).toBe(400);
    expect(sendOlder.body.error).toBe('Email can only be sent for the latest revision');
  });
});

describe('POST /api/invoice/revision/:revisionId/send-test-email', () => {
  it('returns 400 when trying to send-test an older revision', async () => {
    const { template, invoice, revision } = await seedRecipientAndInvoice();

    await prisma.invoiceRevision.update({
      where: { id: revision.id },
      data: { status: 'ERSETZT' },
    });

    await prisma.invoiceRevision.create({
      data: {
        invoiceId: invoice.id,
        revisionNumber: 2,
        status: 'AKTIV',
        salutation: '',
        name: 'Test Firma',
        street: 'Teststraße 1',
        city: 'Teststadt',
        invoiceDate: new Date('2026-06-02'),
        title: 'Test Rechnung R2',
        positions: JSON.stringify([{ text: 'Test Position 2', priceInCents: 12000 }]),
        vat: 19,
        directDebit: false,
        email: 'test@example.com',
        emailSalutation: 'Sehr geehrte Damen und Herren',
        templateId: template.id,
        pdfStatus: 'OK',
      },
    });

    const sendOlder = await request.post(`/api/invoice/revision/${revision.id}/send-test-email`);
    expect(sendOlder.status).toBe(400);
    expect(sendOlder.body.error).toBe('Email can only be sent for the latest revision');
  });
});

describe('POST /api/invoice/revision/:revisionId/send-email with canceled invoice', () => {
  it('returns 400 when the invoice is canceled', async () => {
    const { invoice, revision } = await seedRecipientAndInvoice();

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: 'STORNIERT' },
    });
    await prisma.invoiceRevision.update({
      where: { id: revision.id },
      data: { pdfStatus: 'OK', filePath: 'invoices/1/r1/doc.pdf' },
    });

    const res = await request.post(`/api/invoice/revision/${revision.id}/send-email`);
    expect(res.status).toBe(400);
    expect(res.body.emailError).toBe('Canceled invoices cannot be sent by email');
  });

  it('returns 400 for test sends when the invoice is canceled', async () => {
    const { invoice, revision } = await seedRecipientAndInvoice();

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: 'STORNIERT' },
    });
    await prisma.invoiceRevision.update({
      where: { id: revision.id },
      data: { pdfStatus: 'OK', filePath: 'invoices/1/r1/doc.pdf' },
    });

    const res = await request.post(`/api/invoice/revision/${revision.id}/send-test-email`);
    expect(res.status).toBe(400);
    expect(res.body.emailError).toBe('Canceled invoices cannot be sent by email');
  });
});

describe('POST /api/invoice/:id/revision', () => {
  it('updates the linked recipient record in place for a new revision', async () => {
    const { invoice, recipient } = await seedRecipientAndInvoice();

    const res = await request.post(`/api/invoice/${invoice.id}/revision`).send({
      inputs: {
        salutation: 'Herr',
        name: 'Updated Firma',
        street: 'Neue Straße 5',
        city: 'Neu Stadt',
        invoiceDate: '2026-06-15',
        title: 'Updated Test Rechnung',
        lineItems: [{ text: 'Updated Position', priceInCents: 15000 }],
        vat: 19,
        directDebit: false,
        email: 'updated@example.com',
        emailSalutation: 'Sehr geehrter Herr',
      },
    });

    expect(res.status).toBe(201);
    expect(res.body.recipientUpdated).toBe(true);

    const updatedRecipient = await prisma.invoiceRecipient.findUnique({
      where: { id: recipient.id },
    });
    expect(updatedRecipient).not.toBeNull();
    expect(updatedRecipient).toMatchObject({
      id: recipient.id,
      name: 'Updated Firma',
      street: 'Neue Straße 5',
      city: 'Neu Stadt',
      email: 'updated@example.com',
      salutation: 'Herr',
    });

    const updatedRevision = await prisma.invoiceRevision.findUnique({
      where: { id: res.body.revisionId },
    });
    expect(updatedRevision).not.toBeNull();
    expect(updatedRevision?.name).toBe('Updated Firma');
    expect(updatedRevision?.email).toBe('updated@example.com');

    const invoiceAfter = await prisma.invoice.findUnique({
      where: { id: invoice.id },
      include: { recipient: true, revisions: true },
    });
    expect(invoiceAfter?.recipient.id).toBe(recipient.id);
    expect(invoiceAfter?.recipient.name).toBe('Updated Firma');
    expect(invoiceAfter?.revisions).toHaveLength(2);
    expect(invoiceAfter?.revisions.find((r) => r.status === 'AKTIV')?.revisionNumber).toBe(2);
  });
});

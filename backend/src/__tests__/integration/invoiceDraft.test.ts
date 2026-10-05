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

const completeInputs = {
  salutation: 'Herr',
  name: 'Draft Firma',
  street: 'Draftweg 1',
  city: 'Draftstadt',
  invoiceDate: '2020-01-01',
  title: 'Draft Rechnung',
  lineItems: [
    { text: 'Pos A', priceInCents: 1000 },
    { text: 'Pos B', priceInCents: 2000 },
  ],
  vat: 19,
  directDebit: false,
  email: 'draft@example.com',
  emailSalutation: 'Sehr geehrter Herr',
};

const nameOnlyInputs = {
  salutation: '',
  name: 'Nur Name',
  street: '',
  city: '',
  invoiceDate: '',
  title: '',
  lineItems: [{ text: '', priceInCents: 0 }],
  vat: 19,
  directDebit: false,
  email: '',
  emailSalutation: '',
};

async function createDraft(inputs = completeInputs) {
  const res = await request.post('/api/invoice-draft').send({
    recipientData: {
      name: inputs.name,
      street: inputs.street,
      city: inputs.city,
      email: inputs.email,
      salutation: inputs.salutation,
    },
    inputs,
  });
  expect(res.status).toBe(201);
  return res.body.draftId as number;
}

describe('POST /api/invoice-draft', () => {
  it('creates a draft and a new recipient from recipientData', async () => {
    const draftId = await createDraft();

    const draft = await prisma.invoiceDraft.findUniqueOrThrow({
      where: { id: draftId },
      include: { recipient: true },
    });
    expect(draft).toMatchObject({
      name: 'Draft Firma',
      title: 'Draft Rechnung',
      vat: 19,
      email: 'draft@example.com',
    });
    expect(JSON.parse(draft.positions)).toEqual(completeInputs.lineItems);
    expect(draft.recipient).toMatchObject({
      name: 'Draft Firma',
      street: 'Draftweg 1',
      city: 'Draftstadt',
    });
  });

  it('accepts an incomplete draft with only a name', async () => {
    const draftId = await createDraft(nameOnlyInputs);
    const draft = await prisma.invoiceDraft.findUniqueOrThrow({ where: { id: draftId } });
    expect(draft.name).toBe('Nur Name');
    expect(draft.street).toBe('');
  });

  it('updates an existing recipient in place when recipientId is given', async () => {
    const recipient = await prisma.invoiceRecipient.create({
      data: { name: 'Alt', street: 'Alt 1', city: 'Altstadt' },
    });

    const res = await request
      .post('/api/invoice-draft')
      .send({ recipientId: recipient.id, inputs: completeInputs });

    expect(res.status).toBe(201);
    expect(await prisma.invoiceRecipient.count()).toBe(1);
    const updated = await prisma.invoiceRecipient.findUniqueOrThrow({
      where: { id: recipient.id },
    });
    expect(updated).toMatchObject({
      name: 'Draft Firma',
      street: 'Draftweg 1',
      city: 'Draftstadt',
      email: 'draft@example.com',
      salutation: 'Herr',
    });
  });

  it('returns 400 without a name', async () => {
    const res = await request.post('/api/invoice-draft').send({
      recipientData: { name: ' ', street: '', city: '' },
      inputs: { ...nameOnlyInputs, name: ' ' },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Name is required');
    expect(await prisma.invoiceDraft.count()).toBe(0);
  });

  it('returns 400 for an unknown recipientId', async () => {
    const res = await request
      .post('/api/invoice-draft')
      .send({ recipientId: 99999, inputs: completeInputs });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Recipient not found');
    expect(await prisma.invoiceDraft.count()).toBe(0);
  });

  it('creates no invoice, no revision and does not consume an invoice number', async () => {
    await seedTemplate();
    await createDraft();

    expect(await prisma.invoice.count()).toBe(0);
    expect(await prisma.invoiceRevision.count()).toBe(0);

    const res = await request.post('/api/invoice').send({
      recipientData: { name: 'X', street: 'Y', city: 'Z' },
      inputs: { ...completeInputs, name: 'X', street: 'Y', city: 'Z' },
    });
    expect(res.status).toBe(201);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: res.body.invoiceId } });
    expect(invoice.number).toBe(`1 / ${new Date().getFullYear()}`);
  });
});

describe('GET /api/invoice-draft', () => {
  it('returns an empty list when there are no drafts', async () => {
    const res = await request.get('/api/invoice-draft');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('lists drafts newest-edited first with gross amount', async () => {
    const first = await createDraft();
    const second = await createDraft({ ...completeInputs, title: 'Zweiter' });
    await prisma.invoiceDraft.update({
      where: { id: first },
      data: { updatedAt: new Date(Date.now() + 60_000) },
    });

    const res = await request.get('/api/invoice-draft');
    expect(res.status).toBe(200);
    expect(res.body.map((d: { id: number }) => d.id)).toEqual([first, second]);
    expect(res.body[0]).toMatchObject({
      id: first,
      recipientName: 'Draft Firma',
      title: 'Draft Rechnung',
      amountCents: 3570,
    });
    expect(typeof res.body[0].updatedAt).toBe('string');
  });
});

describe('GET /api/invoice-draft/:id', () => {
  it('returns the draft with recipient and inputs without invoiceDate', async () => {
    const draftId = await createDraft();
    const res = await request.get(`/api/invoice-draft/${draftId}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(draftId);
    expect(res.body.recipient).toMatchObject({ name: 'Draft Firma', street: 'Draftweg 1' });
    expect(res.body.inputs).toEqual({
      salutation: 'Herr',
      name: 'Draft Firma',
      street: 'Draftweg 1',
      city: 'Draftstadt',
      title: 'Draft Rechnung',
      lineItems: completeInputs.lineItems,
      vat: 19,
      directDebit: false,
      email: 'draft@example.com',
      emailSalutation: 'Sehr geehrter Herr',
    });
  });

  it('returns 404 for a missing draft', async () => {
    const res = await request.get('/api/invoice-draft/99999');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Draft not found');
  });

  it('returns 400 for an invalid id', async () => {
    const res = await request.get('/api/invoice-draft/abc');
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/invoice-draft/:id', () => {
  it('updates the draft and the linked recipient in place', async () => {
    const draftId = await createDraft();
    const draft = await prisma.invoiceDraft.findUniqueOrThrow({ where: { id: draftId } });

    const res = await request.put(`/api/invoice-draft/${draftId}`).send({
      recipientId: draft.recipientId,
      inputs: { ...completeInputs, name: 'Umbenannt', title: 'Neuer Titel' },
    });

    expect(res.status).toBe(200);
    expect(res.body.draftId).toBe(draftId);
    const updated = await prisma.invoiceDraft.findUniqueOrThrow({ where: { id: draftId } });
    expect(updated).toMatchObject({ name: 'Umbenannt', title: 'Neuer Titel' });
    const recipient = await prisma.invoiceRecipient.findUniqueOrThrow({
      where: { id: draft.recipientId },
    });
    expect(recipient.name).toBe('Umbenannt');
    expect(await prisma.invoiceRecipient.count()).toBe(1);
  });

  it('returns 404 for a missing draft', async () => {
    const recipient = await prisma.invoiceRecipient.create({
      data: { name: 'R', street: 'S', city: 'C' },
    });
    const res = await request
      .put('/api/invoice-draft/99999')
      .send({ recipientId: recipient.id, inputs: completeInputs });
    expect(res.status).toBe(404);
  });

  it('returns 400 without a name', async () => {
    const draftId = await createDraft();
    const draft = await prisma.invoiceDraft.findUniqueOrThrow({ where: { id: draftId } });
    const res = await request
      .put(`/api/invoice-draft/${draftId}`)
      .send({ recipientId: draft.recipientId, inputs: { ...completeInputs, name: '' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Name is required');
  });
});

describe('DELETE /api/invoice-draft/:id', () => {
  it('deletes the draft and keeps the recipient', async () => {
    const draftId = await createDraft();

    const res = await request.delete(`/api/invoice-draft/${draftId}`);

    expect(res.status).toBe(204);
    expect(await prisma.invoiceDraft.count()).toBe(0);
    expect(await prisma.invoiceRecipient.count()).toBe(1);
  });

  it('returns 404 for a missing draft', async () => {
    const res = await request.delete('/api/invoice-draft/99999');
    expect(res.status).toBe(404);
  });
});

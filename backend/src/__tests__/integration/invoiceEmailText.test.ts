import supertest from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

const inputs = {
  salutation: 'Frau',
  name: 'Anna Alt',
  street: 'Hauptstr. 1',
  city: '12345 Berlin',
  invoiceDate: '2026-10-01',
  title: 'Raummiete',
  lineItems: [{ text: 'Raummiete Oktober', priceInCents: 10000 }],
  vat: 19,
  directDebit: false,
  email: 'anna@example.org',
  emailSalutation: 'Sehr geehrte Frau Alt',
};
const recipientData = { name: 'Anna Alt', street: 'Hauptstr. 1', city: '12345 Berlin' };

const BUILT = {
  emailSubject: 'Rechnung {number}: Raummiete',
  emailBody: 'Sehr geehrte Frau Alt,\n\nRechnung {number} für Anna Alt.',
};

async function setTemplates(subject: string, body: string) {
  for (const [key, value] of [
    ['emailSubject', subject],
    ['emailBody', body],
  ]) {
    await prisma.systemSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
}

beforeEach(async () => {
  await prisma.template.create({
    data: {
      type: 'RECHNUNG',
      version: 1,
      fileName: 'template.docx',
      filePath: 'templates/template.docx',
      active: true,
    },
  });
  await setTemplates(
    'Rechnung {number}: {title}',
    '{salutation},\n\nRechnung {number} für {name}.',
  );
});

async function createDraft(): Promise<number> {
  const res = await request.post('/api/invoice-draft').send({ recipientData, inputs });
  expect(res.status).toBe(201);
  return res.body.draftId;
}

async function createInvoice(): Promise<number> {
  const res = await request.post('/api/invoice').send({ recipientData, inputs });
  expect(res.status).toBe(201);
  return res.body.invoiceId;
}

function emailTextOf(body: { emailSubject: string | null; emailBody: string | null }) {
  return { emailSubject: body.emailSubject, emailBody: body.emailBody };
}

describe('email text of a draft', () => {
  it('is built from the template when the draft is first saved', async () => {
    const id = await createDraft();
    const stored = await prisma.invoiceDraft.findUniqueOrThrow({ where: { id } });
    expect(emailTextOf(stored)).toEqual(BUILT);
    expect(emailTextOf((await request.get(`/api/invoice-draft/${id}`)).body)).toEqual(BUILT);
  });

  it('stays as it is when the draft is saved again, whatever else changes', async () => {
    const id = await createDraft();
    await setTemplates('Neu {number}', 'Neue Vorlage');

    const res = await request
      .put(`/api/invoice-draft/${id}`)
      .send({ recipientData, inputs: { ...inputs, title: 'Anderer Titel', name: 'Anna Neu' } });
    expect(res.status).toBe(200);
    expect(emailTextOf((await request.get(`/api/invoice-draft/${id}`)).body)).toEqual(BUILT);
  });

  it('is replaced by the text sent with a save', async () => {
    const id = await createDraft();
    const emailText = { emailSubject: 'Mein Betreff {number}', emailBody: 'Mein Text' };

    const res = await request
      .put(`/api/invoice-draft/${id}`)
      .send({ recipientData, inputs, emailText });
    expect(res.status).toBe(200);
    expect(emailTextOf((await request.get(`/api/invoice-draft/${id}`)).body)).toEqual(emailText);
  });

  it.each([
    [{ emailSubject: '   ', emailBody: 'Text' }, 'Email subject is required'],
    [{ emailSubject: 'Zeile 1\nZeile 2', emailBody: 'Text' }, 'Invalid request body'],
    [{ emailSubject: 'x'.repeat(201), emailBody: 'Text' }, 'Invalid request body'],
    [{ emailSubject: 'Betreff', emailBody: 'x'.repeat(10_001) }, 'Invalid request body'],
    [{ emailSubject: 'Betreff' }, 'Invalid request body'],
    ['text', 'Invalid request body'],
  ])('rejects the text %j and keeps the stored one', async (emailText, error) => {
    const id = await createDraft();
    const res = await request
      .put(`/api/invoice-draft/${id}`)
      .send({ recipientData, inputs, emailText });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(error);
    expect(emailTextOf((await request.get(`/api/invoice-draft/${id}`)).body)).toEqual(BUILT);
  });

  it('is shown from the current template for a draft from before texts were stored', async () => {
    const id = await createDraft();
    await prisma.invoiceDraft.update({
      where: { id },
      data: { emailSubject: null, emailBody: null },
    });
    await setTemplates('Aktuell {number}', 'Aktueller Text für {name}');

    expect(emailTextOf((await request.get(`/api/invoice-draft/${id}`)).body)).toEqual({
      emailSubject: 'Aktuell {number}',
      emailBody: 'Aktueller Text für Anna Alt',
    });
    const stored = await prisma.invoiceDraft.findUniqueOrThrow({ where: { id } });
    expect(stored.emailSubject).toBeNull();
  });
});

describe('email text of an invoice', () => {
  it('is built from the template when the invoice is created directly', async () => {
    const id = await createInvoice();
    const stored = await prisma.invoice.findUniqueOrThrow({ where: { id } });
    expect(emailTextOf(stored)).toEqual(BUILT);
    expect(emailTextOf((await request.get(`/api/invoice/${id}`)).body)).toEqual(BUILT);
  });

  it('is taken over from the draft, edits included', async () => {
    const draftId = await createDraft();
    const emailText = { emailSubject: 'Mein Betreff {number}', emailBody: 'Mein Text' };
    await request.put(`/api/invoice-draft/${draftId}`).send({ recipientData, inputs, emailText });

    const res = await request.post(`/api/invoice-draft/${draftId}/activate`);
    expect(res.status).toBe(201);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: res.body.invoiceId } });
    expect(emailTextOf(invoice)).toEqual(emailText);
  });

  it('is built when a draft without stored text becomes an invoice', async () => {
    const draftId = await createDraft();
    await prisma.invoiceDraft.update({
      where: { id: draftId },
      data: { emailSubject: null, emailBody: null },
    });

    const res = await request.post(`/api/invoice-draft/${draftId}/activate`);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: res.body.invoiceId } });
    expect(emailTextOf(invoice)).toEqual(BUILT);
  });

  it('stays as it is when a new revision changes name and title', async () => {
    const id = await createInvoice();
    await setTemplates('Neu {number}', 'Neue Vorlage');

    const res = await request
      .post(`/api/invoice/${id}/revision`)
      .send({ inputs: { ...inputs, name: 'Anna Neu', title: 'Anderer Titel' } });
    expect(res.status).toBeLessThan(300);
    expect(emailTextOf((await request.get(`/api/invoice/${id}`)).body)).toEqual(BUILT);
  });

  it('is shown from the current template and the active revision when nothing is stored', async () => {
    const id = await createInvoice();
    await prisma.invoice.update({ where: { id }, data: { emailSubject: null, emailBody: null } });
    await setTemplates('Aktuell {number}', 'Aktueller Text für {name}, {title}');

    expect(emailTextOf((await request.get(`/api/invoice/${id}`)).body)).toEqual({
      emailSubject: 'Aktuell {number}',
      emailBody: 'Aktueller Text für Anna Alt, Raummiete',
    });
  });
});

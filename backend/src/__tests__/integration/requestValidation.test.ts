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

const invoiceInputs = {
  salutation: '',
  name: 'Test Firma',
  street: 'Teststraße 1',
  city: 'Teststadt',
  invoiceDate: '2026-06-01',
  title: 'Rechnung',
  lineItems: [{ text: 'Position', priceInCents: 1000 }],
  vat: 19,
  directDebit: false,
  email: '',
  emailSalutation: '',
};

const receiptInputs = {
  name: 'Test Spender',
  street: 'Teststraße 1',
  city: 'Teststadt',
  letterSalutation: 'Sehr geehrte Damen und Herren',
  addressSalutation: null,
  donationAmountCents: 10000,
  donationDate: '2026-06-01',
  withCoverLetter: false,
  treasurer: '',
  charitablePurpose: '',
  taxOfficeName: 'Finanzamt Teststadt',
  taxNumber: '12/345/67890',
  exemptionDate: '2024-01-01',
  assessmentPeriod: '',
};

const donorData = { name: 'Test Spender', street: 'Teststraße 1', city: 'Teststadt' };

async function seedActiveTemplates() {
  for (const type of ['RECHNUNG', 'QUITTUNG']) {
    await prisma.template.create({
      data: { type, version: 1, fileName: 't', filePath: `templates/${type}`, active: true },
    });
  }
}

async function expect400(res: supertest.Response, error: string | RegExp) {
  expect(res.status).toBe(400);
  if (typeof error === 'string') expect(res.body).toEqual({ error });
  else expect(res.body.error).toMatch(error);
}

describe('invoice bodies', () => {
  beforeEach(seedActiveTemplates);

  it.each([
    ['no inputs at all', {}],
    ['inputs that are not an object', { inputs: 'x' }],
    ['a name that is not text', { inputs: { ...invoiceInputs, name: 5 } }],
    ['line items that are not a list', { inputs: { ...invoiceInputs, lineItems: 'x' } }],
    [
      'a price given as text',
      { inputs: { ...invoiceInputs, lineItems: [{ text: 'P', priceInCents: '500' }] } },
    ],
    [
      'a fractional cent price',
      { inputs: { ...invoiceInputs, lineItems: [{ text: 'P', priceInCents: 12.5 }] } },
    ],
    ['a VAT rate given as text', { inputs: { ...invoiceInputs, vat: '19' } }],
    ['direct debit given as text', { inputs: { ...invoiceInputs, directDebit: 'no' } }],
    ['a recipient id that is not a number', { recipientId: 'x', inputs: invoiceInputs }],
  ])('POST /api/invoice rejects %s', async (_label, body) => {
    await expect400(await request.post('/api/invoice').send(body), 'Invalid request body');
    expect(await prisma.invoice.count()).toBe(0);
  });

  it.each(['foo', '2026-13-01', '2026-02-30'])(
    'POST /api/invoice rejects the invoice date %j',
    async (invoiceDate) => {
      const res = await request
        .post('/api/invoice')
        .send({ recipientData: { name: 'Test Firma' }, inputs: { ...invoiceInputs, invoiceDate } });
      await expect400(res, 'Invalid invoice date');
    },
  );

  it('POST /api/invoice/:id/revision rejects a body without inputs', async () => {
    const res = await request.post('/api/invoice/1/revision').send({});
    await expect400(res, 'Invalid request body');
  });

  it('POST /api/invoice-draft rejects line items that are not a list', async () => {
    const res = await request
      .post('/api/invoice-draft')
      .send({ inputs: { name: 'Firma', lineItems: 'x' } });
    await expect400(res, 'Invalid request body');
  });

  it('POST /api/invoice-draft still accepts an incomplete draft with just a name', async () => {
    const res = await request
      .post('/api/invoice-draft')
      .send({ recipientData: { name: 'Nur Name' }, inputs: { name: 'Nur Name' } });
    expect(res.status).toBe(201);
  });
});

describe('donation receipt bodies', () => {
  beforeEach(seedActiveTemplates);

  it.each([
    ['no inputs at all', {}],
    ['an amount given as text', { inputs: { ...receiptInputs, donationAmountCents: '100' } }],
    ['a fractional cent amount', { inputs: { ...receiptInputs, donationAmountCents: 10.5 } }],
    ['a cover-letter flag given as text', { inputs: { ...receiptInputs, withCoverLetter: 'y' } }],
    ['a tax number that is not text', { inputs: { ...receiptInputs, taxNumber: 123 } }],
  ])('POST /api/donation-receipt rejects %s', async (_label, body) => {
    const res = await request.post('/api/donation-receipt').send({ donorData, ...body });
    await expect400(res, 'Invalid request body');
    expect(await prisma.donationReceipt.count()).toBe(0);
  });

  it.each([0, -100])('POST /api/donation-receipt rejects the amount %i', async (amount) => {
    const res = await request
      .post('/api/donation-receipt')
      .send({ donorData, inputs: { ...receiptInputs, donationAmountCents: amount } });
    await expect400(res, 'Donation amount must be greater than 0');
    expect(await prisma.donationReceipt.count()).toBe(0);
  });

  it.each(['', 'foo', '2026-02-30'])(
    'POST /api/donation-receipt rejects the donation date %j',
    async (donationDate) => {
      const res = await request
        .post('/api/donation-receipt')
        .send({ donorData, inputs: { ...receiptInputs, donationDate } });
      await expect400(res, 'Invalid donation date');
    },
  );

  const requiredTaxFields = [
    ['taxOfficeName', 'Tax office is required'],
    ['taxNumber', 'Tax number is required'],
    ['exemptionDate', 'Exemption date is required'],
  ] as const;

  it.each(requiredTaxFields)(
    'POST /api/donation-receipt requires %s on the tax document',
    async (field, error) => {
      const res = await request
        .post('/api/donation-receipt')
        .send({ donorData, inputs: { ...receiptInputs, [field]: '  ' } });
      await expect400(res, error);
      expect(await prisma.donationReceipt.count()).toBe(0);
    },
  );

  it.each(requiredTaxFields)(
    'POST /api/donation-receipt/:id/revision requires %s',
    async (field, error) => {
      const res = await request
        .post('/api/donation-receipt/1/revision')
        .send({ inputs: { ...receiptInputs, [field]: '' } });
      await expect400(res, error);
    },
  );

  it('POST /api/donation-receipt answers an unknown donor with 400', async () => {
    const res = await request
      .post('/api/donation-receipt')
      .send({ donorId: 999999, inputs: receiptInputs });
    await expect400(res, 'Donor not found');
    expect(await prisma.donationReceipt.count()).toBe(0);
  });

  it('POST /api/donation-receipt answers a missing donor with 400', async () => {
    const res = await request.post('/api/donation-receipt').send({ inputs: receiptInputs });
    await expect400(res, 'No donor specified');
  });

  it('POST /api/donation-receipt/:id/revision rejects the amount 0', async () => {
    const res = await request
      .post('/api/donation-receipt/1/revision')
      .send({ inputs: { ...receiptInputs, donationAmountCents: 0 } });
    await expect400(res, 'Donation amount must be greater than 0');
  });
});

describe('settings and master data bodies', () => {
  it('PUT /api/settings rejects a value that is not text', async () => {
    const res = await request.put('/api/settings').send({ treasurer: 1 });
    await expect400(res, 'Invalid request body');
  });

  it('PUT /api/email-settings rejects a value that is not text', async () => {
    const res = await request.put('/api/email-settings').send({ smtpPort: 587 });
    await expect400(res, 'Invalid request body');
  });

  it('PUT /api/settings still saves text values', async () => {
    const res = await request.put('/api/settings').send({ treasurer: 'Erika Muster' });
    expect(res.status).toBe(200);
  });

  it.each([
    ['/api/donor', { name: 5 }],
    ['/api/donor', { name: '  ' }],
    ['/api/invoice-recipient', { city: 5 }],
    ['/api/invoice-recipient', { name: '' }],
  ])('PATCH %s rejects %j', async (base, body) => {
    const donor = await prisma.donor.create({
      data: { name: 'D', street: 'S', city: 'C', letterSalutation: 'Hallo' },
    });
    const recipient = await prisma.invoiceRecipient.create({
      data: { name: 'R', street: 'S', city: 'C' },
    });
    const id = base === '/api/donor' ? donor.id : recipient.id;

    const res = await request.patch(`${base}/${id}`).send(body);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

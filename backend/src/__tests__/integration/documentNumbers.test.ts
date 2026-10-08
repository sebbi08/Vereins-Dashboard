import fs from 'fs';
import path from 'path';
import supertest from 'supertest';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { TEMPLATES_DIR } from '../../config';
import { initializeApp } from '../../init';
import { prisma } from '../../prismaClient';
import { useCleanDatabase } from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RECEIPT_FIXTURE = path.resolve(__dirname, '../../../../e2e/fixture/geldspende_verein.pdf');

let request: ReturnType<typeof supertest>;

beforeAll(async () => {
  await initializeApp();
  request = supertest(createApp());
});

useCleanDatabase();

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
  const revisionData = {
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
  };
  await prisma.invoiceRevision.create({ data: revisionData });
  return { invoice, revisionData };
}

function postRevision(invoiceId: number) {
  return request.post(`/api/invoice/${invoiceId}/revision`).send({
    inputs: {
      salutation: '',
      name: 'Test Firma',
      street: 'Teststraße 1',
      city: 'Teststadt',
      invoiceDate: '2026-06-15',
      title: 'Korrigierte Rechnung',
      lineItems: [{ text: 'Position', priceInCents: 15000 }],
      vat: 19,
      directDebit: false,
      email: '',
      emailSalutation: '',
    },
  });
}

async function seedReceiptTemplate() {
  const fileName = 'quittung_v1_geldspende_verein.pdf';
  await fs.promises.mkdir(TEMPLATES_DIR, { recursive: true });
  await fs.promises.copyFile(RECEIPT_FIXTURE, path.join(TEMPLATES_DIR, fileName));
  return prisma.template.create({
    data: {
      type: 'QUITTUNG',
      version: 1,
      fileName,
      filePath: `templates/${fileName}`,
      active: true,
    },
  });
}

function postReceipt() {
  const donor = {
    name: 'Test Spender',
    street: 'Teststraße 1',
    city: 'Teststadt',
    letterSalutation: 'Sehr geehrte Damen und Herren',
  };
  return request.post('/api/donation-receipt').send({
    donorData: donor,
    inputs: {
      ...donor,
      addressSalutation: null,
      donationAmountCents: 10000,
      donationDate: '2026-06-01',
      withCoverLetter: false,
      treasurer: 'Kassenwart',
      charitablePurpose: 'Förderung der Musik',
      taxOfficeName: 'Finanzamt Teststadt',
      taxNumber: '12/345/67890',
      exemptionDate: '2024-01-01',
      assessmentPeriod: '2023',
    },
  });
}

describe('invoice revision numbers', () => {
  it('gives two simultaneous revisions distinct numbers', async () => {
    const { invoice } = await seedInvoice();

    const [a, b] = await Promise.all([postRevision(invoice.id), postRevision(invoice.id)]);

    expect([a.status, b.status]).toEqual([201, 201]);
    const revisions = await prisma.invoiceRevision.findMany({
      where: { invoiceId: invoice.id },
      orderBy: { revisionNumber: 'asc' },
    });
    expect(revisions.map((r) => r.revisionNumber)).toEqual([1, 2, 3]);
  });

  it('rejects a second revision row with the same number for one invoice', async () => {
    const { revisionData } = await seedInvoice();
    await expect(prisma.invoiceRevision.create({ data: revisionData })).rejects.toThrow();
  });
});

describe('receipt numbers', () => {
  it('gives two simultaneous receipts distinct numbers', async () => {
    await seedReceiptTemplate();

    const [a, b] = await Promise.all([postReceipt(), postReceipt()]);

    expect([a.status, b.status]).toEqual([201, 201]);
    const receipts = await prisma.donationReceipt.findMany({ orderBy: { runningNumber: 'asc' } });
    expect(receipts.map((r) => r.runningNumber)).toEqual([1, 2]);
  });

  it('rejects a second revision row with the same number for one receipt', async () => {
    const template = await seedReceiptTemplate();
    const donor = await prisma.donor.create({
      data: {
        name: 'Test Spender',
        street: 'Teststraße 1',
        city: 'Teststadt',
        letterSalutation: 'Sehr geehrte Damen und Herren',
      },
    });
    const receipt = await prisma.donationReceipt.create({
      data: {
        number: 'SQ-2026-0001',
        year: 2026,
        runningNumber: 1,
        donorId: donor.id,
        donationDate: new Date('2026-06-01'),
      },
    });
    const revisionData = {
      donationReceiptId: receipt.id,
      revisionNumber: 1,
      name: donor.name,
      street: donor.street,
      city: donor.city,
      letterSalutation: donor.letterSalutation,
      donationAmountCents: 10000,
      donationDate: new Date('2026-06-01'),
      withCoverLetter: false,
      treasurer: 'Kassenwart',
      charitablePurpose: 'Förderung der Musik',
      taxOfficeName: 'Finanzamt Teststadt',
      taxNumber: '12/345/67890',
      exemptionDate: '2024-01-01',
      assessmentPeriod: '2023',
      receiptTemplateId: template.id,
    };
    await prisma.donationReceiptRevision.create({ data: revisionData });

    await expect(prisma.donationReceiptRevision.create({ data: revisionData })).rejects.toThrow();
  });
});

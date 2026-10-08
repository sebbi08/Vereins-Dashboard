import { beforeAll, describe, expect, it } from 'vitest';
import { initializeApp } from '../../init';
import { prisma } from '../../prismaClient';
import { recoverInterruptedPdfs } from '../../services/pdfRecovery';
import { useCleanDatabase } from './helpers';

beforeAll(async () => {
  await initializeApp();
});

useCleanDatabase();

async function seedInvoiceRevisions() {
  const template = await prisma.template.create({
    data: {
      type: 'RECHNUNG',
      version: 1,
      fileName: 't.docx',
      filePath: 'templates/t.docx',
      active: true,
    },
  });
  const recipient = await prisma.invoiceRecipient.create({
    data: { name: 'Firma', street: 'Str. 1', city: 'Stadt', email: null },
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
  const base = {
    invoiceId: invoice.id,
    salutation: '',
    name: 'Firma',
    street: 'Str. 1',
    city: 'Stadt',
    invoiceDate: new Date('2026-06-01'),
    title: 'Rechnung',
    positions: '[]',
    vat: 19,
    directDebit: false,
    email: '',
    emailSalutation: '',
    templateId: template.id,
  };
  const pending = await prisma.invoiceRevision.create({
    data: { ...base, revisionNumber: 1, pdfStatus: 'PENDING' },
  });
  const ok = await prisma.invoiceRevision.create({
    data: { ...base, revisionNumber: 2, pdfStatus: 'OK', filePath: 'invoices/x.pdf' },
  });
  return { pending, ok };
}

async function seedPendingReceiptRevision() {
  const template = await prisma.template.create({
    data: {
      type: 'QUITTUNG',
      version: 1,
      fileName: 'q.pdf',
      filePath: 'templates/q.pdf',
      active: true,
    },
  });
  const donor = await prisma.donor.create({
    data: { name: 'Spender', street: 'Str. 1', city: 'Stadt', letterSalutation: 'Hallo' },
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
  return prisma.donationReceiptRevision.create({
    data: {
      donationReceiptId: receipt.id,
      revisionNumber: 1,
      name: 'Spender',
      street: 'Str. 1',
      city: 'Stadt',
      letterSalutation: 'Hallo',
      donationAmountCents: 1000,
      donationDate: new Date('2026-06-01'),
      withCoverLetter: false,
      treasurer: '',
      charitablePurpose: '',
      taxOfficeName: '',
      taxNumber: '',
      exemptionDate: '',
      assessmentPeriod: '',
      receiptTemplateId: template.id,
      pdfStatus: 'PENDING',
    },
  });
}

describe('recoverInterruptedPdfs', () => {
  it('marks PENDING invoice and receipt PDFs as FAILED so they can be retried', async () => {
    const { pending } = await seedInvoiceRevisions();
    const receiptRevision = await seedPendingReceiptRevision();

    const recovered = await recoverInterruptedPdfs();

    expect(recovered).toBe(2);
    const invoiceRev = await prisma.invoiceRevision.findUniqueOrThrow({
      where: { id: pending.id },
    });
    expect(invoiceRev.pdfStatus).toBe('FAILED');
    expect(invoiceRev.pdfError).toMatch(/interrupted/i);
    const receiptRev = await prisma.donationReceiptRevision.findUniqueOrThrow({
      where: { id: receiptRevision.id },
    });
    expect(receiptRev.pdfStatus).toBe('FAILED');
    expect(receiptRev.pdfError).toMatch(/interrupted/i);
  });

  it('leaves finished PDFs alone', async () => {
    const { ok } = await seedInvoiceRevisions();

    await recoverInterruptedPdfs();

    const untouched = await prisma.invoiceRevision.findUniqueOrThrow({ where: { id: ok.id } });
    expect(untouched.pdfStatus).toBe('OK');
    expect(untouched.pdfError).toBeNull();
  });
});

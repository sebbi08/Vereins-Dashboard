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

async function seedDonorAndReceipt(overrides?: {
  pdfStatus?: string;
  filePath?: string | null;
  status?: string;
}) {
  const donor = await prisma.donor.create({
    data: {
      name: 'Max Mustermann',
      street: 'Teststr. 1',
      city: 'Berlin',
      letterSalutation: 'Sehr geehrte Damen und Herren',
    },
  });
  const template = await prisma.template.create({
    data: {
      type: 'QUITTUNG',
      version: 1,
      fileName: 'test.pdf',
      filePath: 'templates/test.pdf',
      active: true,
    },
  });
  const receipt = await prisma.donationReceipt.create({
    data: {
      number: `Q-2026-${Math.floor(Math.random() * 9000) + 1000}`,
      year: 2026,
      runningNumber: 1,
      donorId: donor.id,
      donationDate: new Date('2026-01-15'),
      status: overrides?.status || 'AKTIV',
    },
  });
  const revision = await prisma.donationReceiptRevision.create({
    data: {
      donationReceiptId: receipt.id,
      revisionNumber: 1,
      status: 'AKTIV',
      name: 'Max Mustermann',
      street: 'Teststr. 1',
      city: 'Berlin',
      letterSalutation: 'Sehr geehrte Damen und Herren',
      addressSalutation: null,
      donationAmountCents: 50000,
      donationDate: new Date('2026-01-15'),
      withCoverLetter: false,
      treasurer: 'Treasurer Name',
      charitablePurpose: 'Purpose',
      taxOfficeName: 'Tax Office',
      taxNumber: '123/456',
      exemptionDate: '2025-01-01',
      assessmentPeriod: '2024-2026',
      receiptTemplateId: template.id,
      pdfStatus: overrides?.pdfStatus || 'OK',
      filePath:
        overrides?.filePath === undefined
          ? 'receipts/99/r1/test.pdf'
          : (overrides?.filePath ?? null),
    },
  });
  return { donor, receipt, revision, template };
}

describe('POST /api/donation-receipt/download-batch', () => {
  it('returns ZIP with correct content type and filename for valid IDs', async () => {
    const { receipt } = await seedDonorAndReceipt();

    const res = await request
      .post('/api/donation-receipt/download-batch')
      .send({ ids: [receipt.id] });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="quittungen-/);
  });

  it('returns 400 when IDs array is empty', async () => {
    const res = await request.post('/api/donation-receipt/download-batch').send({ ids: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('MISSING_IDS');
  });

  it('returns 400 when IDs array is missing', async () => {
    const res = await request.post('/api/donation-receipt/download-batch').send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('MISSING_IDS');
  });

  it('returns 400 when an ID is not found', async () => {
    const res = await request.post('/api/donation-receipt/download-batch').send({ ids: [99999] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('NOT_FOUND');
    expect(res.body.ids).toEqual([99999]);
  });

  it('returns 400 when a receipt is cancelled', async () => {
    const { receipt } = await seedDonorAndReceipt({ status: 'STORNIERT' });

    const res = await request
      .post('/api/donation-receipt/download-batch')
      .send({ ids: [receipt.id] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('CANCELLED');
    expect(res.body.ids).toContain(receipt.id);
  });

  it('returns 400 when PDF is not ready (PENDING)', async () => {
    const { receipt } = await seedDonorAndReceipt({ pdfStatus: 'PENDING', filePath: null });

    const res = await request
      .post('/api/donation-receipt/download-batch')
      .send({ ids: [receipt.id] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('PDF_NOT_READY');
    expect(res.body.ids).toContain(receipt.id);
  });

  it('returns 400 when PDF is FAILED', async () => {
    const { receipt } = await seedDonorAndReceipt({ pdfStatus: 'FAILED', filePath: null });

    const res = await request
      .post('/api/donation-receipt/download-batch')
      .send({ ids: [receipt.id] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('PDF_NOT_READY');
    expect(res.body.ids).toContain(receipt.id);
  });

  it('reports all problematic IDs in one response', async () => {
    const { receipt: r1 } = await seedDonorAndReceipt({ status: 'STORNIERT' });
    const { receipt: r2 } = await seedDonorAndReceipt({ pdfStatus: 'PENDING', filePath: null });

    const res = await request
      .post('/api/donation-receipt/download-batch')
      .send({ ids: [r1.id, r2.id] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('CANCELLED');
    expect(res.body.ids).toContain(r1.id);
    expect(res.body.ids).toContain(r2.id);
  });

  it('works with multiple valid IDs', async () => {
    const { receipt: r1 } = await seedDonorAndReceipt();
    const { receipt: r2 } = await seedDonorAndReceipt();

    const res = await request
      .post('/api/donation-receipt/download-batch')
      .send({ ids: [r1.id, r2.id] });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
  });
});

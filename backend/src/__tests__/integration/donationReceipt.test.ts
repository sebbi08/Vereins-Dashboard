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

async function seedDonorAndReceipt() {
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
      number: 'SQ-2024-0001',
      year: 2024,
      runningNumber: 1,
      donorId: donor.id,
      donationDate: new Date('2024-06-01'),
    },
  });

  // Need a template to create a revision
  const template = await prisma.template.create({
    data: {
      type: 'QUITTUNG',
      version: 1,
      fileName: 'test.pdf',
      filePath: 'templates/test.pdf',
      active: true,
    },
  });

  const revision = await prisma.donationReceiptRevision.create({
    data: {
      donationReceiptId: receipt.id,
      revisionNumber: 1,
      name: 'Test Spender',
      street: 'Teststraße 1',
      city: 'Teststadt',
      letterSalutation: 'Sehr geehrte Damen und Herren',
      donationAmountCents: 5000,
      donationDate: new Date('2024-06-01'),
      withCoverLetter: false,
      treasurer: 'Kassenwart',
      charitablePurpose: 'Förderung',
      taxOfficeName: 'Finanzamt',
      taxNumber: '123/456/789',
      exemptionDate: '01.01.2024',
      assessmentPeriod: '2024',
      receiptTemplateId: template.id,
      pdfStatus: 'OK',
    },
  });

  return { donor, receipt, revision, template };
}

describe('GET /api/donation-receipt', () => {
  it('returns empty list when no receipts exist', async () => {
    const res = await request.get('/api/donation-receipt');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns list of active receipts', async () => {
    await seedDonorAndReceipt();

    const res = await request.get('/api/donation-receipt');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      number: 'SQ-2024-0001',
      status: 'AKTIV',
      donorName: 'Test Spender',
      donationAmountCents: 5000,
    });
  });

  it('excludes cancelled receipts by default', async () => {
    const { receipt } = await seedDonorAndReceipt();
    await prisma.donationReceipt.update({
      where: { id: receipt.id },
      data: { status: 'STORNIERT' },
    });

    const res = await request.get('/api/donation-receipt');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it('includes cancelled receipts when withCancelled=true', async () => {
    const { receipt } = await seedDonorAndReceipt();
    await prisma.donationReceipt.update({
      where: { id: receipt.id },
      data: { status: 'STORNIERT' },
    });

    const res = await request.get('/api/donation-receipt?withCancelled=true');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].status).toBe('STORNIERT');
  });
});

describe('GET /api/donation-receipt/:id', () => {
  it('returns a receipt with revisions', async () => {
    const { receipt } = await seedDonorAndReceipt();

    const res = await request.get(`/api/donation-receipt/${receipt.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: receipt.id,
      number: 'SQ-2024-0001',
      status: 'AKTIV',
    });
    expect(res.body.revisions).toHaveLength(1);
  });

  it('returns 404 for non-existent receipt', async () => {
    const res = await request.get('/api/donation-receipt/99999');
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid id', async () => {
    const res = await request.get('/api/donation-receipt/invalid');
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/donation-receipt/:id/cancel', () => {
  it('sets receipt status to STORNIERT', async () => {
    const { receipt } = await seedDonorAndReceipt();

    const res = await request.patch(`/api/donation-receipt/${receipt.id}/cancel`);
    expect(res.status).toBe(200);

    const updated = await prisma.donationReceipt.findUnique({ where: { id: receipt.id } });
    expect(updated?.status).toBe('STORNIERT');
  });

  it('returns 404 for non-existent receipt', async () => {
    const res = await request.patch('/api/donation-receipt/99999/cancel');
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid id', async () => {
    const res = await request.patch('/api/donation-receipt/invalid/cancel');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/donation-receipt/revision/:revisionId/download', () => {
  it('returns 404 when revision has no PDF', async () => {
    const { revision } = await seedDonorAndReceipt();
    await prisma.donationReceiptRevision.update({
      where: { id: revision.id },
      data: { pdfStatus: 'FAILED', filePath: null },
    });

    const res = await request.get(`/api/donation-receipt/revision/${revision.id}/download`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for non-existent revision', async () => {
    const res = await request.get('/api/donation-receipt/revision/99999/download');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/donation-receipt/revision/:revisionId/retry-pdf', () => {
  it('returns 400 when pdfStatus is not FAILED', async () => {
    const { revision } = await seedDonorAndReceipt();
    // revision has pdfStatus 'OK' from seed
    const res = await request.post(`/api/donation-receipt/revision/${revision.id}/retry-pdf`);
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent revision', async () => {
    const res = await request.post('/api/donation-receipt/revision/99999/retry-pdf');
    expect(res.status).toBe(404);
  });
});

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

function createDonor() {
  return prisma.donor.create({
    data: { name: 'Erika Muster', street: 'Weg 1', city: 'Stadt', letterSalutation: 'Hallo' },
  });
}

function createRecipient() {
  return prisma.invoiceRecipient.create({
    data: { name: 'Firma', street: 'Str. 1', city: 'Stadt' },
  });
}

async function createReceiptFor(donorId: number) {
  return prisma.donationReceipt.create({
    data: {
      number: 'SQ-2026-0001',
      year: 2026,
      runningNumber: 1,
      donorId,
      donationDate: new Date('2026-06-01'),
    },
  });
}

describe('DELETE /api/donor/:id', () => {
  it('deletes a donor without donation receipts', async () => {
    const donor = await createDonor();

    const res = await request.delete(`/api/donor/${donor.id}`);

    expect(res.status).toBe(204);
    expect(await prisma.donor.count()).toBe(0);
  });

  it('keeps a donor who has donation receipts', async () => {
    const donor = await createDonor();
    await createReceiptFor(donor.id);

    const res = await request.delete(`/api/donor/${donor.id}`);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: 'This donor has donation receipts and cannot be deleted',
    });
    expect(await prisma.donor.count()).toBe(1);
  });

  it('answers an unknown donor with 404 and a malformed id with 400', async () => {
    expect((await request.delete('/api/donor/999999')).status).toBe(404);
    expect((await request.delete('/api/donor/abc')).status).toBe(400);
  });
});

describe('DELETE /api/invoice-recipient/:id', () => {
  it('deletes a recipient that is not used anywhere', async () => {
    const recipient = await createRecipient();

    const res = await request.delete(`/api/invoice-recipient/${recipient.id}`);

    expect(res.status).toBe(204);
    expect(await prisma.invoiceRecipient.count()).toBe(0);
  });

  it.each([
    [
      'an invoice',
      (recipientId: number) =>
        prisma.invoice.create({
          data: {
            number: '1 / 2026',
            year: 2026,
            runningNumber: 1,
            recipientId,
            invoiceDate: new Date('2026-06-01'),
          },
        }),
      'This recipient has invoices and cannot be deleted',
    ],
    [
      'a draft',
      (recipientId: number) =>
        prisma.invoiceDraft.create({
          data: {
            recipientId,
            salutation: '',
            name: 'Firma',
            street: '',
            city: '',
            title: '',
            positions: '[]',
            vat: 19,
            directDebit: false,
            email: '',
            emailSalutation: '',
          },
        }),
      'This recipient has invoice drafts and cannot be deleted',
    ],
    [
      'an instructor',
      (recipientId: number) =>
        prisma.instructor.create({
          data: { recipientId, hourlyRateCents: 1200, months: 6, timeBlocks: '[]' },
        }),
      'This recipient belongs to an instructor and cannot be deleted',
    ],
  ])('keeps a recipient used by %s', async (_label, use, error) => {
    const recipient = await createRecipient();
    await use(recipient.id);

    const res = await request.delete(`/api/invoice-recipient/${recipient.id}`);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error });
    expect(await prisma.invoiceRecipient.count()).toBe(1);
  });

  it('answers an unknown recipient with 404 and a malformed id with 400', async () => {
    expect((await request.delete('/api/invoice-recipient/999999')).status).toBe(404);
    expect((await request.delete('/api/invoice-recipient/abc')).status).toBe(400);
  });
});

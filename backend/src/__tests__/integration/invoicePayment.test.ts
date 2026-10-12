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

let nextRunningNumber = 1;

async function seedInvoice(
  options: { name?: string; netCents?: number; status?: string; paid?: boolean } = {},
) {
  const template =
    (await prisma.template.findFirst()) ??
    (await prisma.template.create({
      data: {
        type: 'RECHNUNG',
        version: 1,
        fileName: 'template.docx',
        filePath: 'templates/template.docx',
        active: true,
      },
    }));
  const runningNumber = nextRunningNumber++;
  const name = options.name ?? 'Musikschule Klangwelt';
  const invoiceDate = new Date('2026-03-01T00:00:00.000Z');
  const recipient = await prisma.invoiceRecipient.create({
    data: { name, street: 'Weg 1', city: 'Stadt' },
  });
  const invoice = await prisma.invoice.create({
    data: {
      number: `${runningNumber} / 2026`,
      year: 2026,
      runningNumber,
      recipientId: recipient.id,
      invoiceDate,
      status: options.status ?? 'AKTIV',
      paid: options.paid ?? false,
    },
  });
  await prisma.invoiceRevision.create({
    data: {
      invoiceId: invoice.id,
      revisionNumber: 1,
      salutation: '',
      name,
      street: 'Weg 1',
      city: 'Stadt',
      invoiceDate,
      title: 'Miete',
      positions: JSON.stringify([{ text: 'Miete', priceInCents: options.netCents ?? 5000 }]),
      vat: 19,
      directDebit: false,
      email: '',
      emailSalutation: '',
      templateId: template.id,
      pdfStatus: 'OK',
    },
  });
  return invoice;
}

function booking(overrides: Record<string, unknown> = {}) {
  return {
    row: 1,
    date: '2026-03-10',
    payer: 'Musikschule Klangwelt',
    purpose: 'Miete',
    amountCents: 5950,
    ...overrides,
  };
}

async function isPaid(id: number) {
  return (await prisma.invoice.findUnique({ where: { id } }))?.paid;
}

describe('POST /api/invoice-payment/match', () => {
  it('proposes an open invoice by its gross amount and name, without changing it', async () => {
    const invoice = await seedInvoice();
    const res = await request.post('/api/invoice-payment/match').send({ bookings: [booking()] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      matches: [
        {
          booking: booking(),
          level: 'CONFIDENT',
          candidates: [
            {
              invoiceId: invoice.id,
              invoiceNumber: invoice.number,
              recipientName: 'Musikschule Klangwelt',
              invoiceDate: '2026-03-01',
              amountCents: 5950,
              reasons: ['AMOUNT', 'NAME'],
              differenceCents: 0,
            },
          ],
        },
      ],
      unmatched: [],
    });
    expect(await isPaid(invoice.id)).toBe(false);
  });

  it('ignores cancelled and paid invoices', async () => {
    await seedInvoice({ status: 'STORNIERT' });
    await seedInvoice({ paid: true });
    const res = await request.post('/api/invoice-payment/match').send({ bookings: [booking()] });
    expect(res.body).toEqual({ matches: [], unmatched: [booking()] });
  });

  it.each([
    {},
    { bookings: 'x' },
    { bookings: [booking({ date: '10.03.2026' })] },
    { bookings: [booking({ date: '2026-02-30' })] },
    { bookings: [booking({ amountCents: -5 })] },
    { bookings: [booking({ amountCents: 12.5 })] },
    { bookings: [booking({ row: 0 })] },
    { bookings: [booking({ payer: null })] },
  ])('rejects %j', async (body) => {
    const res = await request.post('/api/invoice-payment/match').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid request body');
  });

  it('rejects more than 10000 bookings', async () => {
    const bookings = Array.from({ length: 10_001 }, (_, i) => booking({ row: i + 1 }));
    const res = await request.post('/api/invoice-payment/match').send({ bookings });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('At most 10000 bookings per match');
  });

  it('accepts a year of bookings above the general 100 kB body limit', async () => {
    const bookings = Array.from({ length: 3000 }, (_, i) =>
      booking({ row: i + 1, purpose: 'x'.repeat(60) }),
    );
    const res = await request.post('/api/invoice-payment/match').send({ bookings });
    expect(res.status).toBe(200);
    expect(res.body.unmatched).toHaveLength(3000);
  });

  it('answers 413 for a body above 2 MB', async () => {
    const bookings = Array.from({ length: 2500 }, (_, i) =>
      booking({ row: i + 1, purpose: 'x'.repeat(1000) }),
    );
    const res = await request.post('/api/invoice-payment/match').send({ bookings });
    expect(res.status).toBe(413);
  });
});

describe('POST /api/invoice-payment/confirm', () => {
  it('marks every given invoice as paid', async () => {
    const a = await seedInvoice();
    const b = await seedInvoice();
    const res = await request
      .post('/api/invoice-payment/confirm')
      .send({ invoiceIds: [a.id, b.id] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ marked: 2 });
    expect(await isPaid(a.id)).toBe(true);
    expect(await isPaid(b.id)).toBe(true);
  });

  it('accepts an invoice that is already paid', async () => {
    const paid = await seedInvoice({ paid: true });
    const res = await request.post('/api/invoice-payment/confirm').send({ invoiceIds: [paid.id] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ marked: 1 });
  });

  it('changes nothing when an invoice is unknown', async () => {
    const open = await seedInvoice();
    const res = await request
      .post('/api/invoice-payment/confirm')
      .send({ invoiceIds: [open.id, 99999] });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'NOT_FOUND', ids: [99999] });
    expect(await isPaid(open.id)).toBe(false);
  });

  it('changes nothing when an invoice is cancelled', async () => {
    const open = await seedInvoice();
    const cancelled = await seedInvoice({ status: 'STORNIERT' });
    const res = await request
      .post('/api/invoice-payment/confirm')
      .send({ invoiceIds: [open.id, cancelled.id] });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'CANCELLED', ids: [cancelled.id] });
    expect(await isPaid(open.id)).toBe(false);
  });

  it('rejects an invoice given twice', async () => {
    const open = await seedInvoice();
    const res = await request
      .post('/api/invoice-payment/confirm')
      .send({ invoiceIds: [open.id, open.id] });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'DUPLICATE_IDS', ids: [] });
  });

  it.each([{}, { invoiceIds: [] }, { invoiceIds: ['1'] }, { invoiceIds: [1.5] }])(
    'rejects %j',
    async (body) => {
      const res = await request.post('/api/invoice-payment/confirm').send(body);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'MISSING_IDS', ids: [] });
    },
  );
});

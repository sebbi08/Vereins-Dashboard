import { Router } from 'express';
import { prisma } from '../prismaClient.js';
import { calculateGross } from '../services/invoiceCreation.js';
import { bookingFingerprint, splitUsedBookings } from '../services/paidBookings.js';
import { matchBookings, type OpenInvoice } from '../services/paymentMatching.js';
import { parseConfirmBody, parseMatchBody } from '../services/requestParsing.js';

export const invoicePaymentRouter = Router();

/** Active, unpaid invoices with the amount and name of their active revision. */
async function loadOpenInvoices(): Promise<OpenInvoice[]> {
  const invoices = await prisma.invoice.findMany({
    where: { status: 'AKTIV', paid: false },
    include: { revisions: { where: { status: 'AKTIV' }, take: 1 } },
  });
  return invoices.flatMap((invoice) => {
    const revision = invoice.revisions[0];
    if (!revision) return [];
    return [
      {
        id: invoice.id,
        number: invoice.number,
        year: invoice.year,
        runningNumber: invoice.runningNumber,
        invoiceDate: invoice.invoiceDate.toISOString().slice(0, 10),
        name: revision.name,
        amountCents: calculateGross(revision.positions, revision.vat),
      },
    ];
  });
}

// POST /api/invoice-payment/match — proposals only, nothing is stored
invoicePaymentRouter.post('/match', async (req, res) => {
  const parsed = parseMatchBody(req.body);
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  // A booking that paid an invoice before must not be proposed for another one
  const stored = await prisma.paidBooking.findMany({ select: { fingerprint: true } });
  const { open, used } = splitUsedBookings(
    parsed.value,
    stored.map((row) => row.fingerprint),
  );
  res.json({ ...matchBookings(open, await loadOpenInvoices()), used });
});

// POST /api/invoice-payment/confirm — all or nothing
invoicePaymentRouter.post('/confirm', async (req, res) => {
  const parsed = parseConfirmBody(req.body);
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error, ids: [] });
    return;
  }
  const payments = parsed.value;
  const ids = payments.map((payment) => payment.invoiceId);

  const result = await prisma.$transaction(async (tx) => {
    const found = await tx.invoice.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true },
    });
    const statusById = new Map(found.map((invoice) => [invoice.id, invoice.status]));
    const notFound = ids.filter((id) => !statusById.has(id));
    if (notFound.length > 0) return { error: 'NOT_FOUND', ids: notFound };
    const cancelled = ids.filter((id) => statusById.get(id) !== 'AKTIV');
    if (cancelled.length > 0) return { error: 'CANCELLED', ids: cancelled };
    await tx.invoice.updateMany({ where: { id: { in: ids } }, data: { paid: true } });
    await tx.paidBooking.createMany({
      data: payments.map((payment) => ({
        invoiceId: payment.invoiceId,
        fingerprint: bookingFingerprint(payment.booking),
      })),
    });
    return { marked: ids.length };
  });

  if ('error' in result) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

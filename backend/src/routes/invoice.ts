import { Router } from 'express';
import type { InvoiceInputs, InvoiceLineItem, InvoiceListItem, PdfStatus } from 'shared';
import type { Prisma } from '../../prisma/generated/client.js';
import { prisma } from '../prismaClient.js';
import { fileStem, sendDocumentBatch, sendPdf } from '../services/documentDownloads.js';
import { createRetryPdfHandler } from '../services/documentPdf.js';
import { sendInvoiceEmail } from '../services/emailService.js';
import { storedOrBuiltEmailText } from '../services/invoiceEmailText.js';
import { createRevisionLock } from '../services/revisionLock.js';
import {
  calculateGross,
  createInvoiceWithFirstRevision,
  RecipientError,
  saveRecipient,
  validateRequiredFields,
} from '../services/invoiceCreation.js';
import { attemptInvoicePdfGeneration } from '../services/invoicePdf.js';
import {
  parseEmailText,
  parseInvoiceCreateBody,
  parseInvoiceRevisionBody,
  parsePaidBody,
  todayAsCalendarDay,
} from '../services/requestParsing.js';

export const invoiceRouter = Router();

const sendLock = createRevisionLock();

function revisionToDto(rev: {
  id: number;
  revisionNumber: number;
  status: string;
  pdfStatus: string;
  pdfError: string | null;
  pdfTechError: string | null;
  salutation: string;
  name: string;
  street: string;
  city: string;
  invoiceDate: Date;
  title: string;
  positions: string;
  vat: number;
  directDebit: boolean;
  email: string;
  emailSalutation: string;
  filePath: string | null;
  emailStatus: string;
  emailError: string | null;
  createdAt: Date;
}) {
  return {
    id: rev.id,
    revisionNumber: rev.revisionNumber,
    status: rev.status as 'AKTIV' | 'ERSETZT',
    pdfStatus: rev.pdfStatus as PdfStatus,
    pdfError: rev.pdfError,
    pdfTechError: rev.pdfTechError,
    inputs: {
      salutation: rev.salutation,
      name: rev.name,
      street: rev.street,
      city: rev.city,
      invoiceDate: rev.invoiceDate.toISOString(),
      title: rev.title,
      lineItems: JSON.parse(rev.positions) as InvoiceLineItem[],
      vat: rev.vat,
      directDebit: rev.directDebit,
      email: rev.email,
      emailSalutation: rev.emailSalutation,
    } satisfies InvoiceInputs,
    filePath: rev.filePath,
    emailStatus: rev.emailStatus as 'NOT_SENT' | 'SENT' | 'FAILED',
    emailError: rev.emailError,
    createdAt: rev.createdAt.toISOString(),
  };
}

// GET /api/invoice
invoiceRouter.get('/', async (req, res) => {
  const search = String(req.query.search ?? '');
  const fromDate = req.query.fromDate ? new Date(String(req.query.fromDate)) : undefined;
  const toDate = req.query.toDate ? new Date(String(req.query.toDate)) : undefined;
  const withCancelled = req.query.withCancelled === 'true';

  const invoices = await prisma.invoice.findMany({
    where: {
      ...(withCancelled ? {} : { status: 'AKTIV' }),
      ...(fromDate || toDate ? { invoiceDate: { gte: fromDate, lte: toDate } } : {}),
      ...(search
        ? {
            OR: [{ number: { contains: search } }, { recipient: { name: { contains: search } } }],
          }
        : {}),
    },
    include: {
      recipient: true,
      revisions: {
        where: { status: 'AKTIV' },
        orderBy: { revisionNumber: 'desc' },
        take: 1,
      },
    },
    // number is text ("9 / 2026"); sort by its parts so 10 comes before 9
    orderBy: [{ year: 'desc' }, { runningNumber: 'desc' }],
  });

  const list: InvoiceListItem[] = invoices.map((r) => ({
    id: r.id,
    number: r.number,
    status: r.status as 'AKTIV' | 'STORNIERT',
    paid: r.paid,
    recipientName: r.recipient.name,
    amountCents: r.revisions[0] ? calculateGross(r.revisions[0].positions, r.revisions[0].vat) : 0,
    invoiceDate: r.invoiceDate.toISOString(),
    createdAt: r.createdAt.toISOString(),
    activeRevisionNumber: r.revisions[0]?.revisionNumber ?? null,
    emailStatus: (r.revisions[0]?.emailStatus as 'NOT_SENT' | 'SENT' | 'FAILED') ?? 'NOT_SENT',
  }));

  res.json(list);
});

// POST /api/invoice/download-batch
// NOTE: This route MUST come before /:id to avoid matching "download-batch" as an id
invoiceRouter.post('/download-batch', async (req, res) => {
  await sendDocumentBatch(res, req.body?.ids, {
    zipName: 'rechnungen',
    load: async (id) => {
      const invoice = await prisma.invoice.findUnique({
        where: { id },
        include: {
          revisions: { where: { status: 'AKTIV' }, orderBy: { revisionNumber: 'desc' }, take: 1 },
        },
      });
      return invoice && { ...invoice, revision: invoice.revisions[0] ?? null };
    },
  });
});

// GET /api/invoice/revision/:revisionId/download
// NOTE: This route MUST come before /:id to avoid matching "download" as an id
invoiceRouter.get('/revision/:revisionId/download', async (req, res) => {
  const id = parseInt(req.params.revisionId);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid revision ID' });
    return;
  }

  const revision = await prisma.invoiceRevision.findUnique({
    where: { id },
    include: { invoice: true },
  });

  if (!revision) {
    res.status(404).json({ error: 'Revision not found' });
    return;
  }

  if (!revision.filePath || revision.pdfStatus !== 'OK') {
    res.status(404).json({ error: 'File not available' });
    return;
  }

  sendPdf(
    res,
    revision.filePath,
    `${fileStem(revision.invoice.number)}-R${revision.revisionNumber}.pdf`,
  );
});

// POST /api/invoice/revision/:revisionId/retry-pdf
invoiceRouter.post(
  '/revision/:revisionId/retry-pdf',
  createRetryPdfHandler({
    findRevision: (id) => prisma.invoiceRevision.findUnique({ where: { id } }),
    attempt: attemptInvoicePdfGeneration,
  }),
);

// POST /api/invoice/revision/:revisionId/send-email
// NOTE: This route MUST come before /:id to avoid matching "send-email" as an id
invoiceRouter.post('/revision/:revisionId/send-email', async (req, res) => {
  const id = parseInt(req.params.revisionId);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid revision ID' });
    return;
  }

  const revision = await prisma.invoiceRevision.findUnique({
    where: { id },
    select: { id: true, invoiceId: true },
  });
  if (!revision) {
    res.status(404).json({ error: 'Revision not found' });
    return;
  }

  const latestRevision = await prisma.invoiceRevision.findFirst({
    where: { invoiceId: revision.invoiceId },
    orderBy: { revisionNumber: 'desc' },
    select: { id: true },
  });

  if (!latestRevision || latestRevision.id !== id) {
    res.status(400).json({ error: 'Email can only be sent for the latest revision' });
    return;
  }

  const locked = await sendLock(id, () => sendInvoiceEmail(prisma, id));
  if (locked.busy) {
    res.status(409).json({ error: 'This invoice is already being sent' });
    return;
  }
  const result = locked.value;
  if (result.success) {
    res.json({ emailStatus: 'SENT' as const, emailError: null });
  } else {
    res.status(400).json({ emailStatus: 'FAILED' as const, emailError: result.error });
  }
});

// POST /api/invoice/revision/:revisionId/send-test-email
// NOTE: This route MUST come before /:id to avoid matching "send-test-email" as an id
invoiceRouter.post('/revision/:revisionId/send-test-email', async (req, res) => {
  const id = parseInt(req.params.revisionId);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid revision ID' });
    return;
  }

  const revision = await prisma.invoiceRevision.findUnique({
    where: { id },
    select: { id: true, invoiceId: true },
  });
  if (!revision) {
    res.status(404).json({ error: 'Revision not found' });
    return;
  }

  const latestRevision = await prisma.invoiceRevision.findFirst({
    where: { invoiceId: revision.invoiceId },
    orderBy: { revisionNumber: 'desc' },
    select: { id: true },
  });

  if (!latestRevision || latestRevision.id !== id) {
    res.status(400).json({ error: 'Email can only be sent for the latest revision' });
    return;
  }

  const result = await sendInvoiceEmail(prisma, id, { forceTestAddress: true });
  if (result.success) {
    res.json({ emailStatus: 'SENT' as const, emailError: null });
  } else {
    res.status(400).json({ emailStatus: 'FAILED' as const, emailError: result.error });
  }
});

// GET /api/invoice/:id
invoiceRouter.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid ID' });
    return;
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      recipient: true,
      revisions: { orderBy: { revisionNumber: 'desc' } },
    },
  });

  if (!invoice) {
    res.status(404).json({ error: 'Invoice not found' });
    return;
  }

  const activeRevision = invoice.revisions.find((r) => r.status === 'AKTIV');

  res.json({
    id: invoice.id,
    number: invoice.number,
    status: invoice.status,
    paid: invoice.paid,
    recipient: invoice.recipient,
    invoiceDate: invoice.invoiceDate.toISOString(),
    // Invoices from before texts were stored show what the template gives for the current revision
    ...storedOrBuiltEmailText(
      invoice,
      await prisma.systemSetting.findMany(),
      activeRevision ??
        invoice.revisions[0] ?? { emailSalutation: '', name: '', title: '', email: '' },
    ),
    createdAt: invoice.createdAt.toISOString(),
    activeRevision: activeRevision ? revisionToDto(activeRevision) : null,
    revisions: invoice.revisions.map(revisionToDto),
  });
});

// POST /api/invoice
invoiceRouter.post('/', async (req, res) => {
  const parsed = parseInvoiceCreateBody(req.body, todayAsCalendarDay());
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const body = parsed.value;

  const validationError = validateRequiredFields(body.inputs);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const invoiceTemplate = await prisma.template.findFirst({
    where: { type: 'RECHNUNG', active: true },
  });
  if (!invoiceTemplate) {
    res.status(400).json({ error: 'No active invoice template found' });
    return;
  }

  const { invoiceDate } = body;

  const result = await prisma
    .$transaction(async (tx: Prisma.TransactionClient) => {
      const recipientId = await saveRecipient(tx, body, body.inputs);
      const { invoice, revision } = await createInvoiceWithFirstRevision(tx, {
        recipientId,
        inputs: body.inputs,
        invoiceDate,
        templateId: invoiceTemplate.id,
      });
      const recipient = await tx.invoiceRecipient.findUniqueOrThrow({
        where: { id: recipientId },
      });
      return { invoice, revision, recipient };
    })
    .catch((err: unknown) => {
      if (err instanceof RecipientError) return err;
      throw err;
    });
  if (result instanceof RecipientError) {
    res.status(400).json({ error: result.message });
    return;
  }

  // Start PDF generation in background – do NOT await, as libreoffice can be slow
  attemptInvoicePdfGeneration(result.revision.id).catch(() => {
    // PDF generation errors are already persisted to the DB inside attemptInvoicePdfGeneration
  });

  res.status(201).json({
    invoiceId: result.invoice.id,
    revisionId: result.revision.id,
    recipient: result.recipient,
    recipientUpdated: true,
    pdfStatus: 'PENDING' as const,
    pdfError: null,
    pdfTechError: null,
    filePath: null,
  });
});

// POST /api/invoice/:id/revision
invoiceRouter.post('/:id/revision', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid ID' });
    return;
  }
  const parsed = parseInvoiceRevisionBody(req.body, todayAsCalendarDay());
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const body = parsed.value;

  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) {
    res.status(404).json({ error: 'Invoice not found' });
    return;
  }
  if (invoice.status === 'STORNIERT') {
    res.status(400).json({ error: 'Cancelled invoices cannot be revised' });
    return;
  }

  const validationError = validateRequiredFields(body.inputs);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const invoiceTemplate = await prisma.template.findFirst({
    where: { type: 'RECHNUNG', active: true },
  });
  if (!invoiceTemplate) {
    res.status(400).json({ error: 'No active invoice template found' });
    return;
  }

  const { invoiceDate } = body;

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const lastRevision = await tx.invoiceRevision.findFirst({
      where: { invoiceId: id },
      orderBy: { revisionNumber: 'desc' },
    });
    const newRevisionNumber = (lastRevision?.revisionNumber ?? 0) + 1;
    await tx.invoiceRevision.updateMany({
      where: { invoiceId: id, status: 'AKTIV' },
      data: { status: 'ERSETZT' },
    });
    await tx.invoice.update({ where: { id }, data: { invoiceDate } });

    await tx.invoiceRecipient.update({
      where: { id: invoice.recipientId },
      data: {
        name: body.inputs.name,
        street: body.inputs.street,
        city: body.inputs.city,
        email: body.inputs.email || null,
        salutation: body.inputs.salutation || null,
      },
    });

    const newRevision = await tx.invoiceRevision.create({
      data: {
        invoiceId: id,
        revisionNumber: newRevisionNumber,
        salutation: body.inputs.salutation,
        name: body.inputs.name,
        street: body.inputs.street,
        city: body.inputs.city,
        invoiceDate,
        title: body.inputs.title,
        positions: JSON.stringify(body.inputs.lineItems),
        vat: body.inputs.vat,
        directDebit: body.inputs.directDebit,
        email: body.inputs.email,
        emailSalutation: body.inputs.emailSalutation,
        templateId: invoiceTemplate.id,
        pdfStatus: 'PENDING',
      },
    });

    const recipient = await tx.invoiceRecipient.findUniqueOrThrow({
      where: { id: invoice.recipientId },
    });

    return { newRevision, recipient, recipientUpdated: true };
  });

  // Start PDF generation in background
  attemptInvoicePdfGeneration(result.newRevision.id).catch(() => {});

  res.status(201).json({
    invoiceId: id,
    revisionId: result.newRevision.id,
    recipient: result.recipient,
    recipientUpdated: result.recipientUpdated,
    pdfStatus: 'PENDING' as const,
    pdfError: null,
    pdfTechError: null,
    filePath: null,
  });
});

// PATCH /api/invoice/:id/cancel
invoiceRouter.patch('/:id/cancel', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid ID' });
    return;
  }

  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) {
    res.status(404).json({ error: 'Invoice not found' });
    return;
  }

  await prisma.invoice.update({
    where: { id },
    data: { status: 'STORNIERT' },
  });

  res.json({ message: 'Invoice cancelled' });
});

// PATCH /api/invoice/:id/paid
invoiceRouter.patch('/:id/paid', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid ID' });
    return;
  }
  const parsed = parsePaidBody(req.body);
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) {
    res.status(404).json({ error: 'Invoice not found' });
    return;
  }
  // Unmarking is always allowed: a cancelled invoice may still have been paid
  if (parsed.value && invoice.status !== 'AKTIV') {
    res.status(400).json({ error: 'Cancelled invoices cannot be marked as paid' });
    return;
  }

  const paid = parsed.value;
  const updated = await prisma.$transaction(async (tx) => {
    // An unpaid invoice no longer uses up a bank booking: it may be proposed again
    if (!paid) await tx.paidBooking.deleteMany({ where: { invoiceId: id } });
    return tx.invoice.update({ where: { id }, data: { paid } });
  });
  res.json({ id: updated.id, paid: updated.paid });
});

// PATCH /api/invoice/:id/email-text
invoiceRouter.patch('/:id/email-text', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid ID' });
    return;
  }
  const parsed = parseEmailText(req.body);
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) {
    res.status(404).json({ error: 'Invoice not found' });
    return;
  }
  if (invoice.status !== 'AKTIV') {
    res.status(400).json({ error: 'Cancelled invoices cannot be changed' });
    return;
  }

  await prisma.invoice.update({ where: { id }, data: parsed.value });
  res.json(parsed.value);
});

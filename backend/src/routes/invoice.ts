import { Router } from 'express';
import fs from 'fs';
import type { InvoiceInputs, InvoiceLineItem, InvoiceListItem, PdfStatus } from 'shared';
import type { Prisma } from '../../prisma/generated/client.js';
import { toAbsolutePath } from '../config.js';
import { prisma } from '../prismaClient.js';
import { sendInvoiceEmail } from '../services/emailService.js';
import { generateInvoiceNumber } from '../services/invoiceNumber.js';
import { generateInvoicePdf } from '../services/pdfGeneration.js';

export const invoiceRouter = Router();

const PDF_ERROR_MESSAGE = 'PDF could not be generated. Please try retry.';
const runningRetries = new Set<number>();

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

function validateRequiredFields(inputs: InvoiceInputs): string | null {
  if (!inputs.name.trim()) return 'Name is required';
  if (!inputs.street.trim()) return 'Street is required';
  if (!inputs.city.trim()) return 'City is required';
  if (!inputs.title.trim()) return 'Title is required';
  if (!inputs.lineItems || inputs.lineItems.length === 0) {
    return 'At least one line item is required';
  }
  for (let i = 0; i < inputs.lineItems.length; i++) {
    if (!inputs.lineItems[i].text.trim()) {
      return `Line item ${i + 1}: Text is required`;
    }
    if (inputs.lineItems[i].priceInCents <= 0) {
      return `Line item ${i + 1}: Price must be greater than 0`;
    }
  }
  if (inputs.vat !== 7 && inputs.vat !== 19) {
    return 'VAT must be 7% or 19%';
  }
  return null;
}

function calculateGross(positionsJson: string, vat: number): number {
  const lineItems: InvoiceLineItem[] = JSON.parse(positionsJson);
  const net = lineItems.reduce((sum, p) => sum + p.priceInCents, 0);
  const tax = Math.round(net * (vat / 100));
  return net + tax;
}

async function updateRevisionPdfStatus(
  revisionId: number,
  update: {
    pdfStatus: PdfStatus;
    filePath?: string | null;
    pdfError?: string | null;
    pdfTechError?: string | null;
  },
) {
  await prisma.invoiceRevision.update({
    where: { id: revisionId },
    data: {
      pdfStatus: update.pdfStatus,
      ...(update.filePath !== undefined && { filePath: update.filePath }),
      ...(update.pdfError !== undefined && { pdfError: update.pdfError }),
      ...(update.pdfTechError !== undefined && { pdfTechError: update.pdfTechError }),
    },
  });
}

function serializeTechnicalError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || `${error.name}: ${error.message}`;
  }
  return String(error);
}

async function attemptPdfGeneration(revisionId: number) {
  try {
    const filePath = await generateInvoicePdf(prisma, revisionId);
    await updateRevisionPdfStatus(revisionId, {
      pdfStatus: 'OK',
      filePath,
      pdfError: null,
      pdfTechError: null,
    });
    return {
      pdfStatus: 'OK' as const,
      pdfError: null,
      pdfTechError: null,
      filePath,
    };
  } catch (error) {
    await updateRevisionPdfStatus(revisionId, {
      pdfStatus: 'FAILED',
      filePath: null,
      pdfError: PDF_ERROR_MESSAGE,
      pdfTechError: serializeTechnicalError(error),
    });

    const failed = await prisma.invoiceRevision.findUniqueOrThrow({
      where: { id: revisionId },
      select: { pdfError: true, pdfTechError: true },
    });

    return {
      pdfStatus: 'FAILED' as const,
      pdfError: failed.pdfError,
      pdfTechError: failed.pdfTechError,
      filePath: null,
    };
  }
}

// GET /api/invoice/recipient
invoiceRouter.get('/recipient', async (req, res) => {
  const search = String(req.query.search ?? '');
  const recipients = await prisma.invoiceRecipient.findMany({
    where: search ? { name: { contains: search } } : {},
    orderBy: { name: 'asc' },
    take: 20,
  });
  res.json(recipients);
});

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
    orderBy: { invoiceDate: 'desc' },
  });

  const list: InvoiceListItem[] = invoices.map((r) => ({
    id: r.id,
    number: r.number,
    status: r.status as 'AKTIV' | 'STORNIERT',
    recipientName: r.recipient.name,
    amountCents: r.revisions[0] ? calculateGross(r.revisions[0].positions, r.revisions[0].vat) : 0,
    invoiceDate: r.invoiceDate.toISOString(),
    createdAt: r.createdAt.toISOString(),
    activeRevisionNumber: r.revisions[0]?.revisionNumber ?? null,
  }));

  res.json(list);
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

  const safeNum = revision.invoice.number.replace(/\s*\/\s*/g, '-');
  const fileName = `${safeNum}-R${revision.revisionNumber}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
  fs.createReadStream(toAbsolutePath(revision.filePath)).pipe(res);
});

// POST /api/invoice/revision/:revisionId/retry-pdf
invoiceRouter.post('/revision/:revisionId/retry-pdf', async (req, res) => {
  const id = parseInt(req.params.revisionId);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid revision ID' });
    return;
  }

  const revision = await prisma.invoiceRevision.findUnique({ where: { id } });
  if (!revision) {
    res.status(404).json({ error: 'Revision not found' });
    return;
  }

  if (revision.status !== 'AKTIV') {
    res.status(400).json({ error: 'Retry is only allowed for active revisions' });
    return;
  }

  if (revision.pdfStatus !== 'FAILED') {
    res.status(400).json({ error: 'Retry is only possible for failed PDFs' });
    return;
  }

  if (runningRetries.has(id)) {
    res.status(409).json({ error: 'A retry is already running for this revision' });
    return;
  }

  runningRetries.add(id);
  try {
    const pdf = await attemptPdfGeneration(id);
    res.json({
      revisionId: id,
      pdfStatus: pdf.pdfStatus,
      pdfError: pdf.pdfError,
      pdfTechError: pdf.pdfTechError,
      filePath: pdf.filePath,
    });
  } finally {
    runningRetries.delete(id);
  }
});

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

  const result = await sendInvoiceEmail(prisma, id);
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
    recipient: invoice.recipient,
    invoiceDate: invoice.invoiceDate.toISOString(),
    createdAt: invoice.createdAt.toISOString(),
    activeRevision: activeRevision ? revisionToDto(activeRevision) : null,
    revisions: invoice.revisions.map(revisionToDto),
  });
});

// POST /api/invoice
invoiceRouter.post('/', async (req, res) => {
  const body = req.body as {
    recipientId?: number;
    recipientData?: {
      name: string;
      street: string;
      city: string;
      email?: string;
      salutation?: string;
    };
    inputs: InvoiceInputs;
  };

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

  const { number, year, runningNumber } = await generateInvoiceNumber(prisma);
  const invoiceDate = body.inputs.invoiceDate ? new Date(body.inputs.invoiceDate) : new Date();

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    let recipientUpdated = false;
    let recipientId = body.recipientId;

    if (recipientId) {
      const existing = await tx.invoiceRecipient.findUnique({ where: { id: recipientId } });
      if (!existing) {
        throw new Error('Recipient not found');
      }

      await tx.invoiceRecipient.update({
        where: { id: recipientId },
        data: {
          name: body.inputs.name,
          street: body.inputs.street,
          city: body.inputs.city,
          email: body.inputs.email || null,
          salutation: body.inputs.salutation || null,
        },
      });
      recipientUpdated = true;
    } else {
      if (!body.recipientData) {
        throw new Error('No recipient specified');
      }

      const newRecipient = await tx.invoiceRecipient.create({
        data: {
          name: body.recipientData.name,
          street: body.recipientData.street,
          city: body.recipientData.city,
          email: body.recipientData.email || null,
          salutation: body.recipientData.salutation || null,
        },
      });
      recipientId = newRecipient.id;
      recipientUpdated = true;
    }

    const invoice = await tx.invoice.create({
      data: {
        number,
        year,
        runningNumber,
        recipientId: recipientId!,
        invoiceDate,
      },
    });

    const revision = await tx.invoiceRevision.create({
      data: {
        invoiceId: invoice.id,
        revisionNumber: 1,
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
      where: { id: recipientId! },
    });

    return { invoice, revision, recipient, recipientUpdated };
  });

  // Start PDF generation in background – do NOT await, as libreoffice can be slow
  attemptPdfGeneration(result.revision.id).catch(() => {
    // PDF generation errors are already persisted to the DB inside attemptPdfGeneration
  });

  res.status(201).json({
    invoiceId: result.invoice.id,
    revisionId: result.revision.id,
    recipient: result.recipient,
    recipientUpdated: result.recipientUpdated,
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

  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) {
    res.status(404).json({ error: 'Invoice not found' });
    return;
  }
  if (invoice.status === 'STORNIERT') {
    res.status(400).json({ error: 'Cancelled invoices cannot be revised' });
    return;
  }

  const body = req.body as { inputs: InvoiceInputs };

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

  const lastRevision = await prisma.invoiceRevision.findFirst({
    where: { invoiceId: id },
    orderBy: { revisionNumber: 'desc' },
  });
  const newRevisionNumber = (lastRevision?.revisionNumber ?? 0) + 1;
  const invoiceDate = body.inputs.invoiceDate ? new Date(body.inputs.invoiceDate) : new Date();

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
  attemptPdfGeneration(result.newRevision.id).catch(() => {});

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

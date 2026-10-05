import { Router } from 'express';
import type {
  InvoiceContent,
  InvoiceDraftDto,
  InvoiceDraftListItem,
  InvoiceLineItem,
} from 'shared';
import type { InvoiceDraft, Prisma } from '../../prisma/generated/client.js';
import { prisma } from '../prismaClient.js';
import {
  calculateGross,
  createInvoiceWithFirstRevision,
  RecipientError,
  saveRecipient,
  validateRequiredFields,
  type RecipientSelection,
} from '../services/invoiceCreation.js';
import { attemptInvoicePdfGeneration } from '../services/invoicePdf.js';

export const invoiceDraftRouter = Router();

type DraftBody = RecipientSelection & { inputs: InvoiceContent };

function parseId(raw: string): number | null {
  const id = parseInt(raw);
  return isNaN(id) ? null : id;
}

function isRecordNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2025';
}

function hasValidName(body: DraftBody): boolean {
  const name: unknown = body.inputs?.name;
  return typeof name === 'string' && name.trim() !== '';
}

// Invoices store UTC midnight of a calendar day; use the server's local calendar day.
function todayAsInvoiceDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function draftToContent(draft: InvoiceDraft): InvoiceContent {
  return {
    salutation: draft.salutation,
    name: draft.name,
    street: draft.street,
    city: draft.city,
    title: draft.title,
    lineItems: JSON.parse(draft.positions) as InvoiceLineItem[],
    vat: draft.vat,
    directDebit: draft.directDebit,
    email: draft.email,
    emailSalutation: draft.emailSalutation,
  };
}

function contentToDraftData(inputs: InvoiceContent) {
  return {
    salutation: inputs.salutation,
    name: inputs.name,
    street: inputs.street,
    city: inputs.city,
    title: inputs.title,
    positions: JSON.stringify(inputs.lineItems),
    vat: inputs.vat,
    directDebit: inputs.directDebit,
    email: inputs.email,
    emailSalutation: inputs.emailSalutation,
  };
}

// GET /api/invoice-draft
invoiceDraftRouter.get('/', async (_req, res) => {
  const drafts = await prisma.invoiceDraft.findMany({ orderBy: { updatedAt: 'desc' } });
  const items: InvoiceDraftListItem[] = drafts.map((d) => ({
    id: d.id,
    recipientName: d.name,
    title: d.title,
    amountCents: calculateGross(d.positions, d.vat),
    updatedAt: d.updatedAt.toISOString(),
  }));
  res.json(items);
});

// GET /api/invoice-draft/:id
invoiceDraftRouter.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Invalid ID' });
    return;
  }

  const draft = await prisma.invoiceDraft.findUnique({
    where: { id },
    include: { recipient: true },
  });
  if (!draft) {
    res.status(404).json({ error: 'Draft not found' });
    return;
  }

  const dto: InvoiceDraftDto = {
    id: draft.id,
    recipient: {
      id: draft.recipient.id,
      name: draft.recipient.name,
      street: draft.recipient.street,
      city: draft.recipient.city,
      email: draft.recipient.email,
      salutation: draft.recipient.salutation,
    },
    inputs: draftToContent(draft),
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt.toISOString(),
  };
  res.json(dto);
});

// POST /api/invoice-draft
invoiceDraftRouter.post('/', async (req, res) => {
  const body = req.body as DraftBody;
  if (!hasValidName(body)) {
    res.status(400).json({ error: 'Name is required' });
    return;
  }

  const result = await prisma
    .$transaction(async (tx: Prisma.TransactionClient) => {
      const recipientId = await saveRecipient(tx, body, body.inputs);
      return tx.invoiceDraft.create({
        data: { recipientId, ...contentToDraftData(body.inputs) },
      });
    })
    .catch((err: unknown) => {
      if (err instanceof RecipientError) return err;
      throw err;
    });
  if (result instanceof RecipientError) {
    res.status(400).json({ error: result.message });
    return;
  }
  res.status(201).json({ draftId: result.id });
});

// PUT /api/invoice-draft/:id
invoiceDraftRouter.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Invalid ID' });
    return;
  }

  const body = req.body as DraftBody;
  if (!hasValidName(body)) {
    res.status(400).json({ error: 'Name is required' });
    return;
  }

  const existing = await prisma.invoiceDraft.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: 'Draft not found' });
    return;
  }

  const result = await prisma
    .$transaction(async (tx: Prisma.TransactionClient) => {
      const recipientId = await saveRecipient(tx, body, body.inputs);
      return tx.invoiceDraft.update({
        where: { id },
        data: { recipientId, ...contentToDraftData(body.inputs) },
      });
    })
    .catch((err: unknown) => {
      if (err instanceof RecipientError) return err;
      if (isRecordNotFound(err)) return null;
      throw err;
    });
  if (result === null) {
    res.status(404).json({ error: 'Draft not found' });
    return;
  }
  if (result instanceof RecipientError) {
    res.status(400).json({ error: result.message });
    return;
  }
  res.json({ draftId: id });
});

// DELETE /api/invoice-draft/:id
invoiceDraftRouter.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Invalid ID' });
    return;
  }

  const existing = await prisma.invoiceDraft.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: 'Draft not found' });
    return;
  }

  try {
    await prisma.invoiceDraft.delete({ where: { id } });
  } catch (err) {
    if (isRecordNotFound(err)) {
      res.status(404).json({ error: 'Draft not found' });
      return;
    }
    throw err;
  }
  res.status(204).end();
});

// POST /api/invoice-draft/:id/activate
invoiceDraftRouter.post('/:id/activate', async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Invalid ID' });
    return;
  }

  const draft = await prisma.invoiceDraft.findUnique({ where: { id } });
  if (!draft) {
    res.status(404).json({ error: 'Draft not found' });
    return;
  }

  const inputs = draftToContent(draft);
  const validationError = validateRequiredFields(inputs);
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

  const result = await prisma
    .$transaction(async (tx: Prisma.TransactionClient) => {
      const { invoice, revision } = await createInvoiceWithFirstRevision(tx, {
        recipientId: draft.recipientId,
        inputs,
        invoiceDate: todayAsInvoiceDate(),
        templateId: invoiceTemplate.id,
      });
      // Throws P2025 if a concurrent activation already deleted the draft,
      // which rolls back the invoice created above.
      await tx.invoiceDraft.delete({ where: { id } });
      const recipient = await tx.invoiceRecipient.findUniqueOrThrow({
        where: { id: draft.recipientId },
      });
      return { invoice, revision, recipient };
    })
    .catch((err: unknown) => {
      if (isRecordNotFound(err)) return null;
      throw err;
    });
  if (result === null) {
    res.status(404).json({ error: 'Draft not found' });
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
    recipientUpdated: false,
    pdfStatus: 'PENDING' as const,
    pdfError: null,
    pdfTechError: null,
    filePath: null,
  });
});

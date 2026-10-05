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
  RecipientError,
  saveRecipient,
  type RecipientSelection,
} from '../services/invoiceCreation.js';

export const invoiceDraftRouter = Router();

type DraftBody = RecipientSelection & { inputs: InvoiceContent };

function parseId(raw: string): number | null {
  const id = parseInt(raw);
  return isNaN(id) ? null : id;
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
  if (!body.inputs?.name?.trim()) {
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
  if (!body.inputs?.name?.trim()) {
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
      throw err;
    });
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

  await prisma.invoiceDraft.delete({ where: { id } });
  res.status(204).end();
});

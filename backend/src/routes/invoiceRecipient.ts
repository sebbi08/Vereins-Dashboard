import { Router } from 'express';
import { prisma } from '../prismaClient.js';
import { parseMasterDataPatch } from '../services/requestParsing.js';

export const invoiceRecipientRouter = Router();

// GET /api/invoice-recipient — search or list all
invoiceRecipientRouter.get('/', async (req, res) => {
  const search = String(req.query.search ?? '');
  const all = req.query.all === 'true';
  const recipients = await prisma.invoiceRecipient.findMany({
    where: search ? { name: { contains: search } } : {},
    orderBy: { name: 'asc' },
    take: all ? undefined : 20,
  });
  res.json(recipients);
});

// PATCH /api/invoice-recipient/:id
invoiceRecipientRouter.patch('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid ID' });
    return;
  }

  const parsed = parseMasterDataPatch(
    req.body,
    ['name', 'street', 'city'] as const,
    ['email', 'salutation'] as const,
  );
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const { name, street, city, email, salutation } = parsed.value;

  const recipient = await prisma.invoiceRecipient.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(street !== undefined && { street }),
      ...(city !== undefined && { city }),
      ...(email !== undefined && { email }),
      ...(salutation !== undefined && { salutation }),
    },
  });
  res.json(recipient);
});

// DELETE /api/invoice-recipient/:id — only recipients not used by invoices, drafts or instructors
invoiceRecipientRouter.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid ID' });
    return;
  }

  const outcome = await prisma.$transaction(async (tx) => {
    const recipient = await tx.invoiceRecipient.findUnique({
      where: { id },
      select: { id: true, instructor: { select: { id: true } } },
    });
    if (!recipient) return { status: 404, error: 'Recipient not found' };
    if ((await tx.invoice.count({ where: { recipientId: id } })) > 0) {
      return { status: 409, error: 'This recipient has invoices and cannot be deleted' };
    }
    if ((await tx.invoiceDraft.count({ where: { recipientId: id } })) > 0) {
      return { status: 409, error: 'This recipient has invoice drafts and cannot be deleted' };
    }
    if (recipient.instructor) {
      return {
        status: 409,
        error: 'This recipient belongs to an instructor and cannot be deleted',
      };
    }
    await tx.invoiceRecipient.delete({ where: { id } });
    return null;
  });

  if (outcome) {
    res.status(outcome.status).json({ error: outcome.error });
  } else {
    res.status(204).end();
  }
});

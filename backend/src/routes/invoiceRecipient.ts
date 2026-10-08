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

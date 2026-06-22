import { Router } from 'express';
import { prisma } from '../prismaClient.js';

export const donorRouter = Router();

donorRouter.get('/', async (req, res) => {
  const q = String(req.query.q ?? '');
  const donors = await prisma.donor.findMany({
    where: q ? { name: { contains: q } } : undefined,
    orderBy: { name: 'asc' },
    take: 20,
  });
  res.json(donors);
});

donorRouter.patch('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid ID' });
    return;
  }

  const { name, street, city, letterSalutation, addressSalutation } = req.body as {
    name?: string;
    street?: string;
    city?: string;
    letterSalutation?: string;
    addressSalutation?: string | null;
  };

  const donor = await prisma.donor.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(street !== undefined && { street }),
      ...(city !== undefined && { city }),
      ...(letterSalutation !== undefined && { letterSalutation }),
      ...(addressSalutation !== undefined && { addressSalutation }),
    },
  });
  res.json(donor);
});

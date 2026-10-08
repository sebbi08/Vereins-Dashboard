import { Router } from 'express';
import { prisma } from '../prismaClient.js';
import { parseMasterDataPatch } from '../services/requestParsing.js';

export const donorRouter = Router();

donorRouter.get('/', async (req, res) => {
  const q = String(req.query.q ?? '');
  const all = req.query.all === 'true';
  const donors = await prisma.donor.findMany({
    where: q ? { name: { contains: q } } : undefined,
    orderBy: { name: 'asc' },
    take: all ? undefined : 20,
  });
  res.json(donors);
});

donorRouter.patch('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid ID' });
    return;
  }

  const parsed = parseMasterDataPatch(
    req.body,
    ['name', 'street', 'city', 'letterSalutation'] as const,
    ['addressSalutation'] as const,
  );
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const { name, street, city, letterSalutation, addressSalutation } = parsed.value;

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

// DELETE /api/donor/:id — only donors without donation receipts (issued receipts must be kept)
donorRouter.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid ID' });
    return;
  }

  const outcome = await prisma.$transaction(async (tx) => {
    const donor = await tx.donor.findUnique({ where: { id }, select: { id: true } });
    if (!donor) return 'not-found' as const;
    if ((await tx.donationReceipt.count({ where: { donorId: id } })) > 0) return 'in-use' as const;
    await tx.donor.delete({ where: { id } });
    return 'deleted' as const;
  });

  if (outcome === 'not-found') {
    res.status(404).json({ error: 'Donor not found' });
  } else if (outcome === 'in-use') {
    res.status(409).json({ error: 'This donor has donation receipts and cannot be deleted' });
  } else {
    res.status(204).end();
  }
});

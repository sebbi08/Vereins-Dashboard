import { Router } from 'express';
import { prisma } from '../prismaClient';

export const spenderRouter = Router();

spenderRouter.get('/', async (req, res) => {
  const q = String(req.query.q ?? '');
  const spender = await prisma.spender.findMany({
    where: q ? { name: { contains: q } } : undefined,
    orderBy: { name: 'asc' },
    take: 20,
  });
  res.json(spender);
});

spenderRouter.patch('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Ungültige ID' });
    return;
  }

  const { name, strasse, ort, briefAnrede, adressAnrede } = req.body as {
    name?: string;
    strasse?: string;
    ort?: string;
    briefAnrede?: string;
    adressAnrede?: string | null;
  };

  const spender = await prisma.spender.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(strasse !== undefined && { strasse }),
      ...(ort !== undefined && { ort }),
      ...(briefAnrede !== undefined && { briefAnrede }),
      ...(adressAnrede !== undefined && { adressAnrede }),
    },
  });
  res.json(spender);
});

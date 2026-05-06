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

  const { anrede, name, strasse, ort } = req.body as {
    anrede?: string;
    name?: string;
    strasse?: string;
    ort?: string;
  };

  const spender = await prisma.spender.update({
    where: { id },
    data: {
      ...(anrede !== undefined && { anrede }),
      ...(name !== undefined && { name }),
      ...(strasse !== undefined && { strasse }),
      ...(ort !== undefined && { ort }),
    },
  });
  res.json(spender);
});

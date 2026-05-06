import { Router } from 'express';
import type { SystemEinstellungen } from 'shared';
import { prisma } from '../prismaClient';

export const einstellungenRouter = Router();

const EINSTELLUNGS_KEYS: (keyof SystemEinstellungen)[] = [
  'kassenwart',
  'gemeinnuetzigerZweck',
  'finanzamtName',
  'steuernummer',
  'freistellungsdatum',
  'veranlagungszeitraum',
];

einstellungenRouter.get('/', async (_req, res) => {
  const rows = await prisma.systemEinstellung.findMany();
  const result: Partial<SystemEinstellungen> = {};
  for (const row of rows) {
    if (EINSTELLUNGS_KEYS.includes(row.key as keyof SystemEinstellungen)) {
      (result as Record<string, string>)[row.key] = row.value;
    }
  }
  res.json(result);
});

einstellungenRouter.put('/', async (req, res) => {
  const body = req.body as Partial<SystemEinstellungen>;

  const updates = EINSTELLUNGS_KEYS.filter((k) => body[k] !== undefined).map((key) =>
    prisma.systemEinstellung.upsert({
      where: { key },
      update: { value: body[key] as string },
      create: { key, value: body[key] as string },
    }),
  );

  await Promise.all(updates);
  res.json({ message: 'Einstellungen gespeichert' });
});

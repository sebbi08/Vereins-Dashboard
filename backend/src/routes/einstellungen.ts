import { Router } from 'express';
import type { SystemSettings } from 'shared';
import { prisma } from '../prismaClient.js';

export const settingsRouter = Router();

const SETTINGS_KEYS: (keyof SystemSettings)[] = [
  'treasurer',
  'charitablePurpose',
  'taxOfficeName',
  'taxNumber',
  'exemptionDate',
  'assessmentPeriod',
];

settingsRouter.get('/', async (_req, res) => {
  const rows = await prisma.systemSetting.findMany();
  const result: Partial<SystemSettings> = {};
  for (const row of rows) {
    if (SETTINGS_KEYS.includes(row.key as keyof SystemSettings)) {
      (result as Record<string, string>)[row.key] = row.value;
    }
  }
  res.json(result);
});

settingsRouter.put('/', async (req, res) => {
  const body = req.body as Partial<SystemSettings>;

  const updates = SETTINGS_KEYS.filter((k) => body[k] !== undefined).map((key) =>
    prisma.systemSetting.upsert({
      where: { key },
      update: { value: body[key] as string },
      create: { key, value: body[key] as string },
    }),
  );

  await Promise.all(updates);
  res.json({ message: 'Settings saved' });
});

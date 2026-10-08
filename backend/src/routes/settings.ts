import { Router } from 'express';
import type { SystemSettings } from 'shared';
import { prisma } from '../prismaClient.js';
import { parseTextSettings } from '../services/requestParsing.js';

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
  const parsed = parseTextSettings(req.body, SETTINGS_KEYS);
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const body = parsed.value;

  const updates = SETTINGS_KEYS.filter((k) => body[k] !== undefined).map((key) =>
    prisma.systemSetting.upsert({
      where: { key },
      update: { value: body[key]! },
      create: { key, value: body[key]! },
    }),
  );

  // All or nothing: a failure must not leave the settings half saved
  await prisma.$transaction(updates);
  res.json({ message: 'Settings saved' });
});

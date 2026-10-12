import { Router } from 'express';
import type { BookingImportSettings, SystemSettings } from 'shared';
import { DEFAULT_BOOKING_IMPORT_SETTINGS } from '../../../shared/src/invoicePayments.js';
import { prisma } from '../prismaClient.js';
import { parseBookingImportSettings, parseTextSettings } from '../services/requestParsing.js';

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

const BOOKING_IMPORT_KEY = 'bookingImport';

/** The stored import settings; the defaults when none are stored or they cannot be read. */
function storedBookingImportSettings(value: string | undefined): BookingImportSettings {
  if (value) {
    try {
      const parsed = parseBookingImportSettings(JSON.parse(value));
      if ('value' in parsed) return parsed.value;
    } catch {
      // unreadable JSON: fall back to the defaults
    }
  }
  return DEFAULT_BOOKING_IMPORT_SETTINGS;
}

settingsRouter.get('/booking-import', async (_req, res) => {
  const row = await prisma.systemSetting.findUnique({ where: { key: BOOKING_IMPORT_KEY } });
  res.json(storedBookingImportSettings(row?.value));
});

settingsRouter.put('/booking-import', async (req, res) => {
  const parsed = parseBookingImportSettings(req.body);
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const value = JSON.stringify(parsed.value);
  await prisma.systemSetting.upsert({
    where: { key: BOOKING_IMPORT_KEY },
    update: { value },
    create: { key: BOOKING_IMPORT_KEY, value },
  });
  res.json(parsed.value);
});

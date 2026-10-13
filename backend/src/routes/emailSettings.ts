import { Router } from 'express';
import type { EmailSettings } from 'shared';
import { prisma } from '../prismaClient.js';
import { buildInvoiceEmailText } from '../services/invoiceEmailText.js';
import { parseEmailTextValues, parseTextSettings } from '../services/requestParsing.js';
import { sendTestEmail } from '../services/emailService.js';

export const emailSettingsRouter = Router();

const SETTINGS_KEYS: (keyof EmailSettings)[] = [
  'smtpHost',
  'smtpPort',
  'smtpUser',
  'smtpPassword',
  'smtpSecure',
  'emailSubject',
  'emailBody',
  'emailTestAddress',
];

emailSettingsRouter.get('/', async (_req, res) => {
  const rows = await prisma.systemSetting.findMany();
  const result: Partial<EmailSettings> = {};
  for (const row of rows) {
    if (SETTINGS_KEYS.includes(row.key as keyof EmailSettings)) {
      (result as Record<string, string>)[row.key] = row.value;
    }
  }
  res.json(result);
});

emailSettingsRouter.put('/', async (req, res) => {
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
  res.json({ message: 'Email settings saved' });
});

emailSettingsRouter.get('/mode', (_req, res) => {
  res.json({ mode: process.env.NODE_ENV === 'production' ? 'production' : 'development' });
});

emailSettingsRouter.post('/test', async (_req, res) => {
  const result = await sendTestEmail(prisma);
  if (result.success) {
    res.json({ message: 'Test email sent successfully' });
  } else {
    res.status(400).json({ error: result.error });
  }
});

// POST /api/email-settings/invoice-text — the text the template gives for these values; stores nothing
emailSettingsRouter.post('/invoice-text', async (req, res) => {
  const parsed = parseEmailTextValues(req.body);
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  res.json(buildInvoiceEmailText(await prisma.systemSetting.findMany(), parsed.value));
});

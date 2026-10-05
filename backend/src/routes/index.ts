import { Router } from 'express';
import fs from 'fs';
import { INVOICES_DIR, RECEIPTS_DIR, TEMPLATES_DIR } from '../config.js';
import { initializeApp } from '../init.js';
import { prisma } from '../prismaClient.js';
import { donationReceiptRouter } from './donationReceipt.js';
import { donorRouter } from './donor.js';
import { emailSettingsRouter } from './emailSettings.js';
import { instructorRouter } from './instructor.js';
import { invoiceRouter } from './invoice.js';
import { invoiceRecipientRouter } from './invoiceRecipient.js';
import { settingsRouter } from './settings.js';
import { templatesRouter } from './templates.js';

export const router = Router();

router.use('/donation-receipt', donationReceiptRouter);
router.use('/invoice', invoiceRouter);
router.use('/invoice-recipient', invoiceRecipientRouter);
router.use('/instructor', instructorRouter);
router.use('/donor', donorRouter);
router.use('/settings', settingsRouter);
router.use('/email-settings', emailSettingsRouter);
router.use('/templates', templatesRouter);

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// E2E-only: reset all data to a clean state
router.post('/e2e/reset', async (_req, res) => {
  try {
    await prisma.instructor.deleteMany();
    await prisma.donationReceiptRevision.deleteMany();
    await prisma.donationReceipt.deleteMany();
    await prisma.invoiceRevision.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.invoiceRecipient.deleteMany();
    await prisma.donor.deleteMany();
    await prisma.template.deleteMany();
    await prisma.systemSetting.deleteMany();

    // Clear generated files
    for (const dir of [TEMPLATES_DIR, RECEIPTS_DIR, INVOICES_DIR]) {
      try {
        const files = await fs.promises.readdir(dir);
        await Promise.all(
          files.map((f) => fs.promises.rm(`${dir}/${f}`, { recursive: true, force: true })),
        );
      } catch {
        // dir may not exist yet
      }
    }

    // Re-initialize default settings
    await initializeApp();

    res.json({ status: 'ok', message: 'E2E data reset complete' });
  } catch (err) {
    res.status(500).json({ error: 'Reset failed', details: String(err) });
  }
});

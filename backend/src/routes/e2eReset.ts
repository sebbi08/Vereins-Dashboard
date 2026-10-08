import { Router } from 'express';
import fs from 'fs';
import { INVOICES_DIR, RECEIPTS_DIR, TEMPLATES_DIR } from '../config.js';
import { initializeApp } from '../init.js';
import { prisma } from '../prismaClient.js';

/**
 * The reset endpoint wipes every table and every generated file. It exists for
 * the e2e suite only: it is mounted solely when E2E_RESET_ENABLED=true, and a
 * production server ignores the flag.
 */
export function e2eResetEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.E2E_RESET_ENABLED !== 'true') return false;
  if (env.NODE_ENV === 'production') {
    console.warn('E2E_RESET_ENABLED is ignored in production; the reset endpoint stays disabled');
    return false;
  }
  return true;
}

export const e2eResetRouter = Router();

// POST /api/e2e/reset
e2eResetRouter.post('/reset', async (_req, res) => {
  try {
    await prisma.instructorInvoiceRequest.deleteMany();
    await prisma.instructor.deleteMany();
    await prisma.donationReceiptRevision.deleteMany();
    await prisma.donationReceipt.deleteMany();
    await prisma.invoiceRevision.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.invoiceDraft.deleteMany();
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

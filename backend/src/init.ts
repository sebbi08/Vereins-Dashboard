import fs from 'fs';
import { INVOICES_DIR, RECEIPTS_DIR, TEMPLATES_DIR } from './config.js';
import { prisma } from './prismaClient.js';

const DEFAULT_SETTINGS: Record<string, string> = {
  treasurer: '',
  charitablePurpose: '',
  taxOfficeName: '',
  taxNumber: '',
  exemptionDate: '',
  assessmentPeriod: '',
};

export async function initializeApp() {
  await fs.promises.mkdir(TEMPLATES_DIR, { recursive: true });
  await fs.promises.mkdir(RECEIPTS_DIR, { recursive: true });
  await fs.promises.mkdir(INVOICES_DIR, { recursive: true });

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.systemSetting.upsert({
      where: { key },
      update: {},
      create: { key, value },
    });
  }
}

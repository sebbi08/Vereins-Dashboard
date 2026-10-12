import { afterEach } from 'vitest';
import { prisma } from '../../prismaClient';

/**
 * Cleans all database tables between integration tests, preserving default
 * system settings that are seeded by initializeApp().
 */
export async function cleanDatabase() {
  await prisma.instructorInvoiceRequest.deleteMany();
  await prisma.instructor.deleteMany();
  await prisma.invoiceDraft.deleteMany();
  await prisma.paidBooking.deleteMany();
  await prisma.invoiceRevision.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.invoiceRecipient.deleteMany();
  await prisma.donationReceiptRevision.deleteMany();
  await prisma.donationReceipt.deleteMany();
  await prisma.template.deleteMany();
  await prisma.donor.deleteMany();
  await prisma.systemSetting.deleteMany();
}

export function useCleanDatabase() {
  afterEach(async () => {
    await cleanDatabase();
  });
}

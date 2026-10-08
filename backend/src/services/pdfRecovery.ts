import { prisma } from '../prismaClient.js';

const INTERRUPTED_MESSAGE = 'PDF generation was interrupted. Please retry.';

/**
 * PDF generation runs inside this process, so at startup nothing can still be generating:
 * a revision left PENDING was interrupted by a crash or restart. Marking it FAILED makes the
 * existing retry action available instead of leaving the document stuck for good.
 * Returns the number of revisions recovered.
 */
export async function recoverInterruptedPdfs(): Promise<number> {
  const data = { pdfStatus: 'FAILED', pdfError: INTERRUPTED_MESSAGE, pdfTechError: null };
  const [invoices, receipts] = await prisma.$transaction([
    prisma.invoiceRevision.updateMany({ where: { pdfStatus: 'PENDING' }, data }),
    prisma.donationReceiptRevision.updateMany({ where: { pdfStatus: 'PENDING' }, data }),
  ]);
  return invoices.count + receipts.count;
}

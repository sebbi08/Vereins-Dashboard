import { prisma } from '../prismaClient.js';
import { createPdfAttempt } from './documentPdf.js';
import { generateInvoicePdf } from './pdfGeneration.js';

/** Generates the PDF of an invoice revision and stores the outcome on the revision. */
export const attemptInvoicePdfGeneration = createPdfAttempt({
  generate: (revisionId) => generateInvoicePdf(prisma, revisionId),
  saveStatus: (revisionId, update) =>
    prisma.invoiceRevision.update({ where: { id: revisionId }, data: update }),
});

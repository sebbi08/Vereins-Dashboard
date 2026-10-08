import { prisma } from '../prismaClient.js';
import { createPdfAttempt } from './documentPdf.js';
import { generateReceiptPdf } from './pdfGeneration.js';

/** Generates the PDF of a donation receipt revision and stores the outcome on the revision. */
export const attemptReceiptPdfGeneration = createPdfAttempt({
  generate: (revisionId) => generateReceiptPdf(prisma, revisionId),
  saveStatus: (revisionId, update) =>
    prisma.donationReceiptRevision.update({ where: { id: revisionId }, data: update }),
});

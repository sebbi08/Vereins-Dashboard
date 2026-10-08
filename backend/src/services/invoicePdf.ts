import type { PdfStatus } from 'shared';
import { prisma } from '../prismaClient.js';
import { generateInvoicePdf } from './pdfGeneration.js';

const PDF_ERROR_MESSAGE = 'PDF could not be generated. Please try again.';

async function updateRevisionPdfStatus(
  revisionId: number,
  update: {
    pdfStatus: PdfStatus;
    filePath?: string | null;
    pdfError?: string | null;
    pdfTechError?: string | null;
  },
) {
  await prisma.invoiceRevision.update({
    where: { id: revisionId },
    data: {
      pdfStatus: update.pdfStatus,
      ...(update.filePath !== undefined && { filePath: update.filePath }),
      ...(update.pdfError !== undefined && { pdfError: update.pdfError }),
      ...(update.pdfTechError !== undefined && { pdfTechError: update.pdfTechError }),
    },
  });
}

function serializeTechnicalError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || `${error.name}: ${error.message}`;
  }
  return String(error);
}

export async function attemptInvoicePdfGeneration(revisionId: number) {
  try {
    const filePath = await generateInvoicePdf(prisma, revisionId);
    await updateRevisionPdfStatus(revisionId, {
      pdfStatus: 'OK',
      filePath,
      pdfError: null,
      pdfTechError: null,
    });
    return {
      pdfStatus: 'OK' as const,
      pdfError: null,
      pdfTechError: null,
      filePath,
    };
  } catch (error) {
    await updateRevisionPdfStatus(revisionId, {
      pdfStatus: 'FAILED',
      filePath: null,
      pdfError: PDF_ERROR_MESSAGE,
      pdfTechError: serializeTechnicalError(error),
    });

    const failed = await prisma.invoiceRevision.findUniqueOrThrow({
      where: { id: revisionId },
      select: { pdfError: true, pdfTechError: true },
    });

    return {
      pdfStatus: 'FAILED' as const,
      pdfError: failed.pdfError,
      pdfTechError: failed.pdfTechError,
      filePath: null,
    };
  }
}

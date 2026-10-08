import type { PdfStatus } from 'shared';

const PDF_ERROR_MESSAGE = 'PDF could not be generated. Please try again.';

export interface PdfStatusUpdate {
  pdfStatus: PdfStatus;
  filePath: string | null;
  pdfError: string | null;
  pdfTechError: string | null;
}

export interface PdfAttemptResult extends PdfStatusUpdate {
  pdfStatus: 'OK' | 'FAILED';
}

function serializeTechnicalError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || `${error.name}: ${error.message}`;
  }
  return String(error);
}

/**
 * Builds "generate the PDF of a revision and record the outcome" for one document type
 * (invoices, donation receipts). A failure is stored on the revision with a short message for
 * the user and the technical error for support; it never throws.
 */
export function createPdfAttempt(store: {
  generate: (revisionId: number) => Promise<string>;
  saveStatus: (revisionId: number, update: PdfStatusUpdate) => Promise<unknown>;
}): (revisionId: number) => Promise<PdfAttemptResult> {
  return async (revisionId) => {
    let result: PdfAttemptResult;
    try {
      const filePath = await store.generate(revisionId);
      result = { pdfStatus: 'OK', filePath, pdfError: null, pdfTechError: null };
    } catch (error) {
      result = {
        pdfStatus: 'FAILED',
        filePath: null,
        pdfError: PDF_ERROR_MESSAGE,
        pdfTechError: serializeTechnicalError(error),
      };
    }
    await store.saveStatus(revisionId, result);
    return result;
  };
}

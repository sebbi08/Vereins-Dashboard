import type { RequestHandler } from 'express';
import type { PdfStatus } from 'shared';
import { createRevisionLock } from './revisionLock.js';

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

/**
 * POST …/revision/:revisionId/retry-pdf for one document type: only the active revision with a
 * failed PDF can be retried, and only one retry per revision runs at a time.
 */
export function createRetryPdfHandler(options: {
  findRevision: (id: number) => Promise<{ status: string; pdfStatus: string } | null>;
  attempt: (revisionId: number) => Promise<PdfAttemptResult>;
}): RequestHandler {
  const lock = createRevisionLock();
  return async (req, res) => {
    const id = parseInt(String(req.params.revisionId));
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid revision ID' });
      return;
    }

    const revision = await options.findRevision(id);
    if (!revision) {
      res.status(404).json({ error: 'Revision not found' });
      return;
    }
    if (revision.status !== 'AKTIV') {
      res.status(400).json({ error: 'Retry is only allowed for active revisions' });
      return;
    }
    if (revision.pdfStatus !== 'FAILED') {
      res.status(400).json({ error: 'Retry is only possible for failed PDFs' });
      return;
    }

    const locked = await lock(id, () => options.attempt(id));
    if (locked.busy) {
      res.status(409).json({ error: 'A retry is already running for this revision' });
      return;
    }
    const pdf = locked.value;
    res.json({
      revisionId: id,
      pdfStatus: pdf.pdfStatus,
      pdfError: pdf.pdfError,
      pdfTechError: pdf.pdfTechError,
      filePath: pdf.filePath,
    });
  };
}

import { ZipArchive } from 'archiver';
import type { Response } from 'express';
import fs from 'fs';
import { toAbsolutePath } from '../config.js';

/** True when a stored data-dir path points to an existing file. */
export async function fileExists(storedPath: string): Promise<boolean> {
  try {
    await fs.promises.access(toAbsolutePath(storedPath));
    return true;
  } catch {
    return false;
  }
}

/** "1 / 2026" → "1-2026": document numbers as they appear in file names. */
export function fileStem(documentNumber: string): string {
  return documentNumber.replace(/\s*\/\s*/g, '-');
}

/** Sends a stored PDF inline; a file missing on disk answers 404 instead of crashing. */
export function sendPdf(res: Response, storedPath: string, fileName: string): void {
  res.sendFile(
    toAbsolutePath(storedPath),
    { headers: { 'Content-Disposition': `inline; filename="${fileName}"` } },
    (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'File not available' });
    },
  );
}

/** What a batch download needs to know about one selected document. */
export interface BatchDocument {
  number: string;
  status: string;
  /** The active revision, if any. */
  revision: { revisionNumber: number; filePath: string | null; pdfStatus: string } | null;
}

/**
 * Answers a batch download: every id must name an active document whose current PDF exists,
 * otherwise 400 with the error kind and all problem ids; then the PDFs as one ZIP.
 */
export async function sendDocumentBatch(
  res: Response,
  ids: unknown,
  options: { load: (id: number) => Promise<BatchDocument | null>; zipName: string },
): Promise<void> {
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    !ids.every((id: unknown) => typeof id === 'number' && Number.isFinite(id))
  ) {
    res.status(400).json({ error: 'MISSING_IDS', ids: [] });
    return;
  }

  const notFound: number[] = [];
  const cancelled: number[] = [];
  const notReady: number[] = [];
  const entries: { name: string; filePath: string }[] = [];

  for (const id of ids as number[]) {
    const doc = await options.load(id);
    if (!doc) {
      notFound.push(id);
      continue;
    }
    if (doc.status === 'STORNIERT') {
      cancelled.push(id);
      continue;
    }
    const rev = doc.revision;
    // A PDF missing on disk would otherwise be left out of the ZIP without a word
    if (!rev || !rev.filePath || rev.pdfStatus !== 'OK' || !(await fileExists(rev.filePath))) {
      notReady.push(id);
      continue;
    }
    entries.push({
      name: `${fileStem(doc.number)}-R${rev.revisionNumber}.pdf`,
      filePath: rev.filePath,
    });
  }

  if (notFound.length > 0 || cancelled.length > 0 || notReady.length > 0) {
    const problemIds = [...notFound, ...cancelled, ...notReady];
    const error =
      notFound.length > 0 ? 'NOT_FOUND' : cancelled.length > 0 ? 'CANCELLED' : 'PDF_NOT_READY';
    res.status(400).json({ error, ids: problemIds });
    return;
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${options.zipName}-${dateStr}.zip"`);

  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.on('error', () => {
    // If headers are not sent yet, report; otherwise the stream is already broken
    if (!res.headersSent) res.status(500).json({ error: 'Server error during ZIP creation' });
  });
  archive.pipe(res);
  for (const entry of entries) {
    archive.file(toAbsolutePath(entry.filePath), { name: entry.name });
  }
  await archive.finalize();
}

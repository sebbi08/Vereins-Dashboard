import { ZipArchive } from 'archiver';
import { Router } from 'express';
import type { DonationReceiptListItem, PdfStatus, ReceiptInputs } from 'shared';
import type { Prisma } from '../../prisma/generated/client.js';
import fs from 'fs';
import { toAbsolutePath } from '../config.js';
import { prisma } from '../prismaClient.js';
import { generateReceiptPdf } from '../services/pdfGeneration.js';
import { generateReceiptNumber } from '../services/receiptNumber.js';
import { parseReceiptCreateBody, parseReceiptRevisionBody } from '../services/requestParsing.js';

async function fileExists(storedPath: string): Promise<boolean> {
  try {
    await fs.promises.access(toAbsolutePath(storedPath));
    return true;
  } catch {
    return false;
  }
}

export const donationReceiptRouter = Router();

const DEFAULT_LETTER_SALUTATION = 'Sehr geehrte Damen und Herren';
const PDF_ERROR_MESSAGE = 'PDF could not be generated. Please try again.';
const runningRetries = new Set<number>();

/** A donor problem found inside the create transaction; answered with 400. */
class DonorError extends Error {}

function revisionToDto(rev: {
  id: number;
  revisionNumber: number;
  status: string;
  pdfStatus: string;
  pdfError: string | null;
  pdfTechError: string | null;
  name: string;
  street: string;
  city: string;
  letterSalutation: string;
  addressSalutation: string | null;
  donationAmountCents: number;
  donationDate: Date;
  withCoverLetter: boolean;
  treasurer: string;
  charitablePurpose: string;
  taxOfficeName: string;
  taxNumber: string;
  exemptionDate: string;
  assessmentPeriod: string;
  filePath: string | null;
  createdAt: Date;
}) {
  return {
    id: rev.id,
    revisionNumber: rev.revisionNumber,
    status: rev.status,
    pdfStatus: rev.pdfStatus as PdfStatus,
    pdfError: rev.pdfError,
    pdfTechError: rev.pdfTechError,
    inputs: {
      name: rev.name,
      street: rev.street,
      city: rev.city,
      letterSalutation: rev.letterSalutation,
      addressSalutation: rev.addressSalutation ?? '',
      donationAmountCents: rev.donationAmountCents,
      donationDate: rev.donationDate.toISOString(),
      withCoverLetter: rev.withCoverLetter,
      treasurer: rev.treasurer,
      charitablePurpose: rev.charitablePurpose,
      taxOfficeName: rev.taxOfficeName,
      taxNumber: rev.taxNumber,
      exemptionDate: rev.exemptionDate,
      assessmentPeriod: rev.assessmentPeriod,
    },
    filePath: rev.filePath,
    createdAt: rev.createdAt.toISOString(),
  };
}

function validateRequiredFields(inputs: ReceiptInputs): string | null {
  if (!inputs.name.trim()) return 'Name is required';
  if (!inputs.street.trim()) return 'Street is required';
  if (!inputs.city.trim()) return 'City is required';
  if (inputs.withCoverLetter && !inputs.letterSalutation.trim()) {
    return 'Letter salutation is required when generating a cover letter';
  }
  return null;
}

function normalizeAddressSalutation(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? '';
  return normalized ? normalized : null;
}

function normalizeLetterSalutation(inputs: ReceiptInputs): string {
  if (inputs.withCoverLetter) {
    return inputs.letterSalutation.trim();
  }
  return DEFAULT_LETTER_SALUTATION;
}

async function updateRevisionPdfStatus(
  revisionId: number,
  update: {
    pdfStatus: PdfStatus;
    filePath?: string | null;
    pdfError?: string | null;
    pdfTechError?: string | null;
  },
) {
  await prisma.donationReceiptRevision.update({
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

async function attemptPdfGeneration(revisionId: number) {
  try {
    const filePath = await generateReceiptPdf(prisma, revisionId);
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

    const failed = await prisma.donationReceiptRevision.findUniqueOrThrow({
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

// GET /api/donation-receipt
donationReceiptRouter.get('/', async (req, res) => {
  const search = String(req.query.search ?? '');
  const fromDate = req.query.fromDate ? new Date(String(req.query.fromDate)) : undefined;
  const toDate = req.query.toDate ? new Date(String(req.query.toDate)) : undefined;
  const withCancelled = req.query.withCancelled === 'true';

  const receipts = await prisma.donationReceipt.findMany({
    where: {
      ...(withCancelled ? {} : { status: 'AKTIV' }),
      ...(fromDate || toDate ? { donationDate: { gte: fromDate, lte: toDate } } : {}),
      ...(search
        ? {
            OR: [{ number: { contains: search } }, { donor: { name: { contains: search } } }],
          }
        : {}),
    },
    include: {
      donor: true,
      revisions: {
        where: { status: 'AKTIV' },
        orderBy: { revisionNumber: 'desc' },
        take: 1,
      },
    },
    orderBy: { number: 'desc' },
  });

  const list: DonationReceiptListItem[] = receipts.map((q) => ({
    id: q.id,
    number: q.number,
    status: q.status as 'AKTIV' | 'STORNIERT',
    donorName: q.donor.name,
    donationAmountCents: q.revisions[0]?.donationAmountCents ?? 0,
    donationDate: q.donationDate.toISOString(),
    createdAt: q.createdAt.toISOString(),
    activeRevisionNumber: q.revisions[0]?.revisionNumber ?? null,
  }));

  res.json(list);
});

// POST /api/donation-receipt/download-batch
// NOTE: This route MUST come before /:id to avoid matching "download-batch" as an id
donationReceiptRouter.post('/download-batch', async (req, res) => {
  const ids: unknown = req.body?.ids;
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    !ids.every((id: unknown) => typeof id === 'number' && Number.isFinite(id))
  ) {
    res.status(400).json({ error: 'MISSING_IDS', ids: [] });
    return;
  }

  // Validate all IDs first — collect problems
  const notFound: number[] = [];
  const cancelled: number[] = [];
  const notReady: number[] = [];
  const validEntries: { number: string; revisionNumber: number; filePath: string }[] = [];

  for (const id of ids) {
    const receipt = await prisma.donationReceipt.findUnique({
      where: { id },
      include: {
        revisions: {
          where: { status: 'AKTIV' },
          orderBy: { revisionNumber: 'desc' },
          take: 1,
        },
      },
    });

    if (!receipt) {
      notFound.push(id);
      continue;
    }

    if (receipt.status === 'STORNIERT') {
      cancelled.push(id);
      continue;
    }

    const rev = receipt.revisions[0];
    // A PDF missing on disk would otherwise be left out of the ZIP without a word
    if (!rev || !rev.filePath || rev.pdfStatus !== 'OK' || !(await fileExists(rev.filePath))) {
      notReady.push(id);
      continue;
    }

    validEntries.push({
      number: receipt.number,
      revisionNumber: rev.revisionNumber,
      filePath: rev.filePath,
    });
  }

  if (notFound.length > 0 || cancelled.length > 0 || notReady.length > 0) {
    const allProblemIds = [...notFound, ...cancelled, ...notReady];
    if (notFound.length > 0) {
      res.status(400).json({ error: 'NOT_FOUND', ids: allProblemIds });
    } else if (cancelled.length > 0) {
      res.status(400).json({ error: 'CANCELLED', ids: allProblemIds });
    } else {
      res.status(400).json({ error: 'PDF_NOT_READY', ids: allProblemIds });
    }
    return;
  }

  // All valid — build ZIP
  const dateStr = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="quittungen-${dateStr}.zip"`);

  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.on('error', () => {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Server error during ZIP creation' });
    }
  });

  archive.pipe(res);

  for (const entry of validEntries) {
    const name = `${entry.number}-R${entry.revisionNumber}.pdf`;
    archive.file(toAbsolutePath(entry.filePath), { name });
  }

  await archive.finalize();
});

// GET /api/donation-receipt/revision/:revisionId/download
donationReceiptRouter.get('/revision/:revisionId/download', async (req, res) => {
  const id = parseInt(req.params.revisionId);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid revision ID' });
    return;
  }

  const revision = await prisma.donationReceiptRevision.findUnique({
    where: { id },
    include: { donationReceipt: true },
  });

  if (!revision) {
    res.status(404).json({ error: 'Revision not found' });
    return;
  }

  if (!revision.filePath || revision.pdfStatus !== 'OK') {
    res.status(404).json({ error: 'File not available' });
    return;
  }

  const fileName = `${revision.donationReceipt.number}-R${revision.revisionNumber}.pdf`;
  res.sendFile(
    toAbsolutePath(revision.filePath),
    { headers: { 'Content-Disposition': `inline; filename="${fileName}"` } },
    (err) => {
      // A file missing on disk must not take the process down with an unhandled stream error.
      if (err && !res.headersSent) res.status(404).json({ error: 'File not available' });
    },
  );
});

// POST /api/donation-receipt/revision/:revisionId/retry-pdf
donationReceiptRouter.post('/revision/:revisionId/retry-pdf', async (req, res) => {
  const id = parseInt(req.params.revisionId);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid revision ID' });
    return;
  }

  const revision = await prisma.donationReceiptRevision.findUnique({ where: { id } });
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

  if (runningRetries.has(id)) {
    res.status(409).json({ error: 'A retry is already running for this revision' });
    return;
  }

  runningRetries.add(id);
  try {
    const pdf = await attemptPdfGeneration(id);
    res.json({
      revisionId: id,
      pdfStatus: pdf.pdfStatus,
      pdfError: pdf.pdfError,
      pdfTechError: pdf.pdfTechError,
      filePath: pdf.filePath,
    });
  } finally {
    runningRetries.delete(id);
  }
});

// GET /api/donation-receipt/:id
donationReceiptRouter.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid ID' });
    return;
  }

  const receipt = await prisma.donationReceipt.findUnique({
    where: { id },
    include: {
      donor: true,
      revisions: { orderBy: { revisionNumber: 'desc' } },
    },
  });

  if (!receipt) {
    res.status(404).json({ error: 'Receipt not found' });
    return;
  }

  const activeRevision = receipt.revisions.find((r: { status: string }) => r.status === 'AKTIV');

  res.json({
    id: receipt.id,
    number: receipt.number,
    status: receipt.status,
    donor: receipt.donor,
    donationDate: receipt.donationDate.toISOString(),
    createdAt: receipt.createdAt.toISOString(),
    activeRevision: activeRevision ? revisionToDto(activeRevision) : null,
    revisions: receipt.revisions.map(revisionToDto),
  });
});

// POST /api/donation-receipt
donationReceiptRouter.post('/', async (req, res) => {
  const parsed = parseReceiptCreateBody(req.body);
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const body = parsed.value;

  const validationError = validateRequiredFields(body.inputs);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const receiptTemplate = await prisma.template.findFirst({
    where: { type: 'QUITTUNG', active: true },
  });
  if (!receiptTemplate) {
    res.status(400).json({ error: 'No active receipt template found' });
    return;
  }

  const coverLetterTemplate = body.inputs.withCoverLetter
    ? await prisma.template.findFirst({
        where: { type: 'ANSCHREIBEN', active: true },
      })
    : null;

  if (body.inputs.withCoverLetter && !coverLetterTemplate) {
    res.status(400).json({ error: 'No active cover letter template found' });
    return;
  }

  const { donationDate } = body;

  const result = await prisma
    .$transaction(async (tx: Prisma.TransactionClient) => {
      // Inside the transaction: transactions run one at a time, so two requests cannot pick the same number.
      const { number, year, runningNumber } = await generateReceiptNumber(tx);
      let donorUpdated = false;
      let donorId = body.donorId;

      if (donorId) {
        const existingDonor = await tx.donor.findUnique({ where: { id: donorId } });
        if (!existingDonor) {
          throw new DonorError('Donor not found');
        }

        const donorUpdateData: {
          name: string;
          street: string;
          city: string;
          letterSalutation?: string;
          addressSalutation?: string | null;
        } = {
          name: body.inputs.name,
          street: body.inputs.street,
          city: body.inputs.city,
        };

        if (body.inputs.withCoverLetter) {
          donorUpdateData.letterSalutation = body.inputs.letterSalutation.trim();
          donorUpdateData.addressSalutation = normalizeAddressSalutation(
            body.inputs.addressSalutation,
          );
        }

        await tx.donor.update({ where: { id: donorId }, data: donorUpdateData });
        donorUpdated = true;
      } else {
        if (!body.donorData) {
          throw new DonorError('No donor specified');
        }

        const newDonor = await tx.donor.create({
          data: {
            name: body.donorData.name,
            street: body.donorData.street,
            city: body.donorData.city,
            letterSalutation: body.inputs.withCoverLetter
              ? body.inputs.letterSalutation.trim()
              : DEFAULT_LETTER_SALUTATION,
            addressSalutation: body.inputs.withCoverLetter
              ? normalizeAddressSalutation(body.inputs.addressSalutation)
              : null,
          },
        });
        donorId = newDonor.id;
        donorUpdated = true;
      }

      const receipt = await tx.donationReceipt.create({
        data: {
          number,
          year,
          runningNumber,
          donorId: donorId!,
          donationDate,
        },
      });

      const revision = await tx.donationReceiptRevision.create({
        data: {
          donationReceiptId: receipt.id,
          revisionNumber: 1,
          name: body.inputs.name,
          street: body.inputs.street,
          city: body.inputs.city,
          letterSalutation: normalizeLetterSalutation(body.inputs),
          addressSalutation: body.inputs.withCoverLetter
            ? normalizeAddressSalutation(body.inputs.addressSalutation)
            : null,
          donationAmountCents: body.inputs.donationAmountCents,
          donationDate,
          withCoverLetter: body.inputs.withCoverLetter,
          treasurer: body.inputs.treasurer,
          charitablePurpose: body.inputs.charitablePurpose,
          taxOfficeName: body.inputs.taxOfficeName,
          taxNumber: body.inputs.taxNumber,
          exemptionDate: body.inputs.exemptionDate,
          assessmentPeriod: body.inputs.assessmentPeriod,
          coverLetterTemplateId: coverLetterTemplate?.id ?? null,
          receiptTemplateId: receiptTemplate.id,
          pdfStatus: 'PENDING',
        },
      });

      const donor = await tx.donor.findUniqueOrThrow({ where: { id: donorId! } });

      return { receipt, revision, donor, donorUpdated };
    })
    .catch((err: unknown) => {
      if (err instanceof DonorError) return err;
      throw err;
    });
  if (result instanceof DonorError) {
    res.status(400).json({ error: result.message });
    return;
  }

  const pdf = await attemptPdfGeneration(result.revision.id);

  res.status(201).json({
    receiptId: result.receipt.id,
    revisionId: result.revision.id,
    donor: result.donor,
    donorUpdated: result.donorUpdated,
    pdfStatus: pdf.pdfStatus,
    pdfError: pdf.pdfError,
    pdfTechError: pdf.pdfTechError,
    filePath: pdf.filePath,
  });
});

// POST /api/donation-receipt/:id/revision
donationReceiptRouter.post('/:id/revision', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid ID' });
    return;
  }
  const parsed = parseReceiptRevisionBody(req.body);
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const body = parsed.value;

  const receipt = await prisma.donationReceipt.findUnique({ where: { id } });
  if (!receipt) {
    res.status(404).json({ error: 'Receipt not found' });
    return;
  }
  if (receipt.status === 'STORNIERT') {
    res.status(400).json({ error: 'Cancelled receipts cannot be revised' });
    return;
  }

  const validationError = validateRequiredFields(body.inputs);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const receiptTemplate = await prisma.template.findFirst({
    where: { type: 'QUITTUNG', active: true },
  });
  if (!receiptTemplate) {
    res.status(400).json({ error: 'No active receipt template found' });
    return;
  }

  const coverLetterTemplate = body.inputs.withCoverLetter
    ? await prisma.template.findFirst({
        where: { type: 'ANSCHREIBEN', active: true },
      })
    : null;

  if (body.inputs.withCoverLetter && !coverLetterTemplate) {
    res.status(400).json({ error: 'No active cover letter template found' });
    return;
  }

  const { donationDate } = body;

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const lastRevision = await tx.donationReceiptRevision.findFirst({
      where: { donationReceiptId: id },
      orderBy: { revisionNumber: 'desc' },
    });
    const newRevisionNumber = (lastRevision?.revisionNumber ?? 0) + 1;
    await tx.donationReceiptRevision.updateMany({
      where: { donationReceiptId: id, status: 'AKTIV' },
      data: { status: 'ERSETZT' },
    });
    await tx.donationReceipt.update({ where: { id }, data: { donationDate } });

    const donorUpdateData: {
      name: string;
      street: string;
      city: string;
      letterSalutation?: string;
      addressSalutation?: string | null;
    } = {
      name: body.inputs.name,
      street: body.inputs.street,
      city: body.inputs.city,
    };

    if (body.inputs.withCoverLetter) {
      donorUpdateData.letterSalutation = body.inputs.letterSalutation.trim();
      donorUpdateData.addressSalutation = normalizeAddressSalutation(body.inputs.addressSalutation);
    }

    await tx.donor.update({
      where: { id: receipt.donorId },
      data: donorUpdateData,
    });

    const newRevision = await tx.donationReceiptRevision.create({
      data: {
        donationReceiptId: id,
        revisionNumber: newRevisionNumber,
        name: body.inputs.name,
        street: body.inputs.street,
        city: body.inputs.city,
        letterSalutation: normalizeLetterSalutation(body.inputs),
        addressSalutation: body.inputs.withCoverLetter
          ? normalizeAddressSalutation(body.inputs.addressSalutation)
          : null,
        donationAmountCents: body.inputs.donationAmountCents,
        donationDate,
        withCoverLetter: body.inputs.withCoverLetter,
        treasurer: body.inputs.treasurer,
        charitablePurpose: body.inputs.charitablePurpose,
        taxOfficeName: body.inputs.taxOfficeName,
        taxNumber: body.inputs.taxNumber,
        exemptionDate: body.inputs.exemptionDate,
        assessmentPeriod: body.inputs.assessmentPeriod,
        coverLetterTemplateId: coverLetterTemplate?.id ?? null,
        receiptTemplateId: receiptTemplate.id,
        pdfStatus: 'PENDING',
      },
    });

    const donor = await tx.donor.findUniqueOrThrow({ where: { id: receipt.donorId } });

    return { newRevision, donor, donorUpdated: true };
  });

  const pdf = await attemptPdfGeneration(result.newRevision.id);

  res.status(201).json({
    receiptId: id,
    revisionId: result.newRevision.id,
    donor: result.donor,
    donorUpdated: result.donorUpdated,
    pdfStatus: pdf.pdfStatus,
    pdfError: pdf.pdfError,
    pdfTechError: pdf.pdfTechError,
    filePath: pdf.filePath,
  });
});

// PATCH /api/donation-receipt/:id/cancel
donationReceiptRouter.patch('/:id/cancel', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid ID' });
    return;
  }

  const receipt = await prisma.donationReceipt.findUnique({ where: { id } });
  if (!receipt) {
    res.status(404).json({ error: 'Receipt not found' });
    return;
  }

  await prisma.donationReceipt.update({
    where: { id },
    data: { status: 'STORNIERT' },
  });

  res.json({ message: 'Receipt cancelled' });
});

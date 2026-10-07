import { Router, type Request, type Response } from 'express';
import type { InstructorSettingsDto } from 'shared';
import type { Prisma } from '../../prisma/generated/client.js';
import { validateInstructorRent } from '../../../shared/src/instructorRent.js';
import {
  isValidRequestMonth,
  isValidRequestYear,
} from '../../../shared/src/instructorInvoiceRequests.js';
import { prisma } from '../prismaClient.js';
import {
  buildInvoicePrefill,
  INVOICE_TEMPLATE_KEY,
  parseInstructorSaveBody,
  parseSettingsUpdate,
  parseWeeksPerMonth,
  type RecipientData,
  toInstructorDto,
  storedInvoiceTemplate,
  toListItem,
  WEEKS_PER_MONTH_KEY,
} from '../services/instructorRent.js';

export const instructorRouter = Router();

async function getWeeksPerMonth(): Promise<number> {
  const row = await prisma.systemSetting.findUnique({ where: { key: WEEKS_PER_MONTH_KEY } });
  return parseWeeksPerMonth(row?.value);
}

async function getInvoiceTemplate(): Promise<string | null> {
  const row = await prisma.systemSetting.findUnique({ where: { key: INVOICE_TEMPLATE_KEY } });
  return storedInvoiceTemplate(row?.value);
}

async function getSettings(): Promise<InstructorSettingsDto> {
  const [weeksPerMonth, invoiceTemplate] = await Promise.all([
    getWeeksPerMonth(),
    getInvoiceTemplate(),
  ]);
  return { weeksPerMonth, invoiceTemplate };
}

// GET /api/instructor/settings
instructorRouter.get('/settings', async (_req, res) => {
  res.json(await getSettings());
});

// PUT /api/instructor/settings
instructorRouter.put('/settings', async (req, res) => {
  const update = parseSettingsUpdate(req.body);
  if ('error' in update) {
    res.status(400).json({ error: update.error });
    return;
  }
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    if (update.weeksPerMonth !== undefined) {
      const value = String(update.weeksPerMonth);
      await tx.systemSetting.upsert({
        where: { key: WEEKS_PER_MONTH_KEY },
        update: { value },
        create: { key: WEEKS_PER_MONTH_KEY, value },
      });
    }
    if (update.invoiceTemplate === null) {
      await tx.systemSetting.deleteMany({ where: { key: INVOICE_TEMPLATE_KEY } });
    } else if (update.invoiceTemplate !== undefined) {
      await tx.systemSetting.upsert({
        where: { key: INVOICE_TEMPLATE_KEY },
        update: { value: update.invoiceTemplate },
        create: { key: INVOICE_TEMPLATE_KEY, value: update.invoiceTemplate },
      });
    }
  });
  res.json(await getSettings());
});

class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function recipientFields(data: RecipientData) {
  return {
    name: data.name,
    street: data.street,
    city: data.city,
    email: data.email,
    salutation: data.salutation,
  };
}

async function resolveRecipientId(
  tx: Prisma.TransactionClient,
  recipientId: number | undefined,
  recipientData: RecipientData | undefined,
): Promise<number> {
  if (recipientId !== undefined) {
    const existing = await tx.invoiceRecipient.findUnique({ where: { id: recipientId } });
    if (!existing) throw new HttpError(400, 'Recipient not found');
    if (recipientData) {
      await tx.invoiceRecipient.update({
        where: { id: recipientId },
        data: recipientFields(recipientData),
      });
    }
    return recipientId;
  }
  if (!recipientData) throw new HttpError(400, 'Recipient is required');
  const created = await tx.invoiceRecipient.create({ data: recipientFields(recipientData) });
  return created.id;
}

function sendError(res: Response, err: unknown) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}

// ── Invoice requests (manual "invoice requested" marks per month) ──

// GET /api/instructor/invoice-requests?year=2026
instructorRouter.get('/invoice-requests', async (req, res) => {
  const raw = req.query.year;
  const year = typeof raw === 'string' && /^\d{4}$/.test(raw) ? Number(raw) : Number.NaN;
  if (!isValidRequestYear(year)) {
    res.status(400).json({ error: 'Invalid year' });
    return;
  }
  try {
    const rows = await prisma.instructorInvoiceRequest.findMany({
      where: { month: { startsWith: `${year}-` } },
      select: { instructorId: true, month: true },
      orderBy: [{ instructorId: 'asc' }, { month: 'asc' }],
    });
    res.json(rows);
  } catch (err) {
    sendError(res, err);
  }
});

/** Validates `:id` and `:month`; on failure sends 400/404 and returns null. */
async function invoiceRequestTarget(
  req: Request,
  res: Response,
): Promise<{ instructorId: number; month: string } | null> {
  const instructorId = parseId(req.params.id as string);
  const month = req.params.month as string;
  if (instructorId === null || !isValidRequestMonth(month)) {
    res.status(400).json({ error: 'Invalid instructor id or month' });
    return null;
  }
  const instructor = await prisma.instructor.findUnique({
    where: { id: instructorId },
    select: { id: true },
  });
  if (!instructor) {
    res.status(404).json({ error: 'Instructor not found' });
    return null;
  }
  return { instructorId, month };
}

// PUT /api/instructor/:id/invoice-requests/:month
instructorRouter.put('/:id/invoice-requests/:month', async (req, res) => {
  try {
    const target = await invoiceRequestTarget(req, res);
    if (!target) return;
    await prisma.instructorInvoiceRequest.upsert({
      where: { instructorId_month: target },
      update: {},
      create: target,
    });
    res.status(204).end();
  } catch (err) {
    sendError(res, err);
  }
});

// DELETE /api/instructor/:id/invoice-requests/:month
instructorRouter.delete('/:id/invoice-requests/:month', async (req, res) => {
  try {
    const target = await invoiceRequestTarget(req, res);
    if (!target) return;
    await prisma.instructorInvoiceRequest.deleteMany({ where: target });
    res.status(204).end();
  } catch (err) {
    sendError(res, err);
  }
});

/** instructorId null = create. */
async function saveInstructor(res: Response, instructorId: number | null, body: unknown) {
  const parsed = parseInstructorSaveBody(body);
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const issues = validateInstructorRent(parsed.inputs);
  if (issues.length > 0) {
    res.status(400).json({ error: issues[0].message });
    return;
  }

  try {
    const id = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (instructorId !== null) {
        const existing = await tx.instructor.findUnique({ where: { id: instructorId } });
        if (!existing) throw new HttpError(404, 'Instructor not found');
      }
      const recipientId = await resolveRecipientId(tx, parsed.recipientId, parsed.recipientData);
      const owner = await tx.instructor.findUnique({ where: { recipientId } });
      if (owner && owner.id !== instructorId) {
        throw new HttpError(409, 'Recipient already has an instructor');
      }
      const data = {
        recipientId,
        hourlyRateCents: parsed.inputs.hourlyRateCents,
        months: parsed.inputs.months,
        timeBlocks: JSON.stringify(parsed.inputs.timeBlocks),
      };
      const saved =
        instructorId === null
          ? await tx.instructor.create({ data })
          : await tx.instructor.update({ where: { id: instructorId }, data });
      return saved.id;
    });
    res.status(instructorId === null ? 201 : 200).json({ id });
  } catch (err) {
    sendError(res, err);
  }
}

// GET /api/instructor
instructorRouter.get('/', async (_req, res) => {
  const [rows, weeksPerMonth] = await Promise.all([
    prisma.instructor.findMany({
      include: { recipient: true },
      orderBy: { recipient: { name: 'asc' } },
    }),
    getWeeksPerMonth(),
  ]);
  res.json(rows.map((row) => toListItem(row, weeksPerMonth)));
});

// GET /api/instructor/:id
instructorRouter.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const row =
    id === null
      ? null
      : await prisma.instructor.findUnique({ where: { id }, include: { recipient: true } });
  if (!row) {
    res.status(404).json({ error: 'Instructor not found' });
    return;
  }
  res.json(toInstructorDto(row, await getWeeksPerMonth()));
});

// POST /api/instructor
instructorRouter.post('/', async (req, res) => {
  await saveInstructor(res, null, req.body);
});

// PUT /api/instructor/:id
instructorRouter.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(404).json({ error: 'Instructor not found' });
    return;
  }
  await saveInstructor(res, id, req.body);
});

// DELETE /api/instructor/:id
instructorRouter.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const existing = id === null ? null : await prisma.instructor.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: 'Instructor not found' });
    return;
  }
  await prisma.instructor.delete({ where: { id: existing.id } });
  res.status(204).end();
});

// GET /api/instructor/:id/invoice-prefill
instructorRouter.get('/:id/invoice-prefill', async (req, res) => {
  const id = parseId(req.params.id);
  const row =
    id === null
      ? null
      : await prisma.instructor.findUnique({ where: { id }, include: { recipient: true } });
  if (!row) {
    res.status(404).json({ error: 'Instructor not found' });
    return;
  }
  const { weeksPerMonth, invoiceTemplate } = await getSettings();
  res.json(buildInvoicePrefill(row, weeksPerMonth, invoiceTemplate));
});

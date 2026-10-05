import { Router, type Response } from 'express';
import type { InstructorSettingsDto } from 'shared';
import type { Prisma } from '../../prisma/generated/client.js';
import {
  validateInstructorRent,
  validateWeeksPerMonth,
} from '../../../shared/src/instructorRent.js';
import { prisma } from '../prismaClient.js';
import {
  buildInvoicePrefill,
  parseInstructorSaveBody,
  parseWeeksPerMonth,
  type RecipientData,
  toInstructorDto,
  toListItem,
  WEEKS_PER_MONTH_KEY,
} from '../services/instructorRent.js';

export const instructorRouter = Router();

async function getWeeksPerMonth(): Promise<number> {
  const row = await prisma.systemSetting.findUnique({ where: { key: WEEKS_PER_MONTH_KEY } });
  return parseWeeksPerMonth(row?.value);
}

// GET /api/instructor/settings
instructorRouter.get('/settings', async (_req, res) => {
  const dto: InstructorSettingsDto = { weeksPerMonth: await getWeeksPerMonth() };
  res.json(dto);
});

// PUT /api/instructor/settings
instructorRouter.put('/settings', async (req, res) => {
  const { weeksPerMonth } = req.body as { weeksPerMonth?: unknown };
  if (typeof weeksPerMonth !== 'number') {
    res.status(400).json({ error: 'Weeks per month must be greater than 0' });
    return;
  }
  const error = validateWeeksPerMonth(weeksPerMonth);
  if (error) {
    res.status(400).json({ error });
    return;
  }
  await prisma.systemSetting.upsert({
    where: { key: WEEKS_PER_MONTH_KEY },
    update: { value: String(weeksPerMonth) },
    create: { key: WEEKS_PER_MONTH_KEY, value: String(weeksPerMonth) },
  });
  const dto: InstructorSettingsDto = { weeksPerMonth };
  res.json(dto);
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
  res.json(buildInvoicePrefill(row, await getWeeksPerMonth()));
});

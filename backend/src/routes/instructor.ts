import { Router } from 'express';
import type { InstructorSettingsDto } from 'shared';
import { validateWeeksPerMonth } from '../../../shared/src/instructorRent.js';
import { prisma } from '../prismaClient.js';
import { parseWeeksPerMonth, WEEKS_PER_MONTH_KEY } from '../services/instructorRent.js';

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
  if (typeof weeksPerMonth !== 'number' || validateWeeksPerMonth(weeksPerMonth)) {
    res.status(400).json({ error: 'Weeks per month must be greater than 0' });
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

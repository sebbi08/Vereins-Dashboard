import supertest from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { initializeApp } from '../../init';
import { prisma } from '../../prismaClient';
import { cleanDatabase, useCleanDatabase } from './helpers';

let request: ReturnType<typeof supertest>;

beforeAll(async () => {
  await initializeApp();
  request = supertest(createApp());
});

useCleanDatabase();

async function createRecipient(name = 'Anna Alt') {
  return prisma.invoiceRecipient.create({
    data: { name, street: 'Hauptstr. 1', city: '12345 Berlin', email: null, salutation: null },
  });
}

describe('Instructor model', () => {
  it('cleanDatabase removes instructors before their recipients', async () => {
    const recipient = await createRecipient();
    await prisma.instructor.create({
      data: { recipientId: recipient.id, hourlyRateCents: 1200, months: 6, timeBlocks: '[]' },
    });

    await cleanDatabase();

    expect(await prisma.instructor.count()).toBe(0);
    expect(await prisma.invoiceRecipient.count()).toBe(0);
  });

  it('allows only one instructor per recipient', async () => {
    const recipient = await createRecipient();
    const data = { recipientId: recipient.id, hourlyRateCents: 1200, months: 6, timeBlocks: '[]' };
    await prisma.instructor.create({ data });
    await expect(prisma.instructor.create({ data })).rejects.toThrow();
  });
});

describe('POST /api/e2e/reset', () => {
  it('succeeds when instructors exist', async () => {
    const recipient = await createRecipient();
    await prisma.instructor.create({
      data: { recipientId: recipient.id, hourlyRateCents: 1200, months: 6, timeBlocks: '[]' },
    });

    const res = await request.post('/api/e2e/reset');

    expect(res.status).toBe(200);
    expect(await prisma.instructor.count()).toBe(0);
  });
});

describe('GET /api/instructor/settings', () => {
  it('returns the default of 3.25 when nothing is stored', async () => {
    const res = await request.get('/api/instructor/settings');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ weeksPerMonth: 3.25 });
  });

  it.each(['', 'abc'])('falls back to 3.25 for a corrupt stored value %j', async (value) => {
    await prisma.systemSetting.create({ data: { key: 'instructorWeeksPerMonth', value } });
    const res = await request.get('/api/instructor/settings');
    expect(res.body).toEqual({ weeksPerMonth: 3.25 });
  });
});

describe('PUT /api/instructor/settings', () => {
  it('stores the value and returns it', async () => {
    const res = await request.put('/api/instructor/settings').send({ weeksPerMonth: 4.33 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ weeksPerMonth: 4.33 });
    const row = await prisma.systemSetting.findUnique({
      where: { key: 'instructorWeeksPerMonth' },
    });
    expect(row?.value).toBe('4.33');
    expect((await request.get('/api/instructor/settings')).body).toEqual({ weeksPerMonth: 4.33 });
  });

  it.each([0, -1, '3.25', null])('rejects %j', async (weeksPerMonth) => {
    const res = await request.put('/api/instructor/settings').send({ weeksPerMonth });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Weeks per month must be greater than 0' });
  });

  it('does not expose the setting through the donation receipt settings', async () => {
    await request.put('/api/instructor/settings').send({ weeksPerMonth: 4 });
    const res = await request.get('/api/settings');
    expect(res.body).not.toHaveProperty('instructorWeeksPerMonth');
  });
});

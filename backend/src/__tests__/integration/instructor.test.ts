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

const schedule = [
  { weekday: 'MO', start: '14:00', end: '18:00', breaks: [{ start: '16:00', end: '16:30' }] },
  { weekday: 'DO', start: '09:00', end: '13:00', breaks: [] },
];

function newInstructorBody(name = 'Anna Alt') {
  return {
    recipientData: { name, street: 'Hauptstr. 1', city: '12345 Berlin', email: 'anna@example.org' },
    hourlyRateCents: 1200,
    months: 6,
    timeBlocks: schedule,
  };
}

describe('POST /api/instructor', () => {
  it('creates a new recipient from recipientData', async () => {
    const res = await request.post('/api/instructor').send(newInstructorBody());

    expect(res.status).toBe(201);
    const instructor = await prisma.instructor.findUnique({
      where: { id: res.body.id },
      include: { recipient: true },
    });
    expect(instructor?.recipient.name).toBe('Anna Alt');
    expect(instructor?.recipient.email).toBe('anna@example.org');
    expect(JSON.parse(instructor!.timeBlocks)).toEqual(schedule);
  });

  it('links an existing recipient and updates it in place', async () => {
    const recipient = await createRecipient('Old Name');

    const res = await request.post('/api/instructor').send({
      ...newInstructorBody('New Name'),
      recipientId: recipient.id,
    });

    expect(res.status).toBe(201);
    expect(await prisma.invoiceRecipient.count()).toBe(1);
    const updated = await prisma.invoiceRecipient.findUnique({ where: { id: recipient.id } });
    expect(updated?.name).toBe('New Name');
  });

  it('links an existing recipient without changes when recipientData is omitted', async () => {
    const recipient = await createRecipient('Keep Me');
    const body: Partial<ReturnType<typeof newInstructorBody>> = newInstructorBody();
    delete body.recipientData;

    const res = await request.post('/api/instructor').send({ ...body, recipientId: recipient.id });

    expect(res.status).toBe(201);
    const unchanged = await prisma.invoiceRecipient.findUnique({ where: { id: recipient.id } });
    expect(unchanged?.name).toBe('Keep Me');
  });

  it('returns 409 for a recipient that already has an instructor', async () => {
    const recipient = await createRecipient();
    await request
      .post('/api/instructor')
      .send({ ...newInstructorBody(), recipientId: recipient.id });

    const res = await request
      .post('/api/instructor')
      .send({ ...newInstructorBody(), recipientId: recipient.id });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Recipient already has an instructor' });
    expect(await prisma.instructor.count()).toBe(1);
  });

  it('returns 400 without any recipient', async () => {
    const body: Partial<ReturnType<typeof newInstructorBody>> = newInstructorBody();
    delete body.recipientData;
    const res = await request.post('/api/instructor').send(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Recipient is required' });
  });

  it('returns 400 for an unknown recipientId', async () => {
    const res = await request
      .post('/api/instructor')
      .send({ ...newInstructorBody(), recipientId: 999 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Recipient not found' });
  });

  it.each([
    [
      'overlapping blocks',
      {
        timeBlocks: [
          { weekday: 'MO', start: '08:00', end: '12:00', breaks: [] },
          { weekday: 'MO', start: '11:00', end: '13:00', breaks: [] },
        ],
      },
      'Time blocks on the same day must not overlap',
    ],
    ['fractional months', { months: 1.5 }, 'Months must be a whole number of at least 1'],
    ['zero rate', { hourlyRateCents: 0 }, 'Hourly rate must be greater than 0'],
  ])('returns 400 for %s and writes nothing', async (_label, override, error) => {
    const res = await request.post('/api/instructor').send({ ...newInstructorBody(), ...override });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error });
    expect(await prisma.instructor.count()).toBe(0);
    expect(await prisma.invoiceRecipient.count()).toBe(0);
  });

  it.each([
    ['timeBlocks missing', { timeBlocks: undefined }],
    ['timeBlocks not an array', { timeBlocks: 'Mo 8-12' }],
    ['rate as string', { hourlyRateCents: '12' }],
  ])('returns 400 Invalid request body for %s', async (_label, override) => {
    const res = await request.post('/api/instructor').send({ ...newInstructorBody(), ...override });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid request body' });
  });
});

describe('GET /api/instructor', () => {
  it('lists instructors sorted by name with calculation', async () => {
    await request.post('/api/instructor').send(newInstructorBody('Zora Zeh'));
    await request.post('/api/instructor').send(newInstructorBody('Anna Alt'));

    const res = await request.get('/api/instructor');

    expect(res.status).toBe(200);
    expect(res.body.map((i: { name: string }) => i.name)).toEqual(['Anna Alt', 'Zora Zeh']);
    expect(res.body[0]).toMatchObject({
      hourlyRateCents: 1200,
      months: 6,
      calculation: { netMinutesPerWeek: 450, monthlyCents: 29250, totalCents: 175500 },
    });
  });

  it('uses the current weeks-per-month setting', async () => {
    await request.post('/api/instructor').send(newInstructorBody());
    await request.put('/api/instructor/settings').send({ weeksPerMonth: 4 });

    const res = await request.get('/api/instructor');

    // 450 min × 1200 × 4 × 6 / 60
    expect(res.body[0].calculation.totalCents).toBe(216000);
  });
});

describe('GET /api/instructor/:id', () => {
  it('returns the instructor with recipient, schedule and calculation', async () => {
    const { body } = await request.post('/api/instructor').send(newInstructorBody());

    const res = await request.get(`/api/instructor/${body.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: body.id,
      recipient: { name: 'Anna Alt', street: 'Hauptstr. 1', city: '12345 Berlin' },
      hourlyRateCents: 1200,
      months: 6,
      timeBlocks: schedule,
      calculation: { totalCents: 175500 },
    });
  });

  it.each(['999', 'abc'])('returns 404 for id %s', async (id) => {
    const res = await request.get(`/api/instructor/${id}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Instructor not found' });
  });
});

describe('PUT /api/instructor/:id', () => {
  it('updates schedule, rate, months and the recipient in place', async () => {
    const { body } = await request.post('/api/instructor').send(newInstructorBody());
    const instructor = await prisma.instructor.findUnique({ where: { id: body.id } });

    const res = await request.put(`/api/instructor/${body.id}`).send({
      ...newInstructorBody('Anna Neu'),
      recipientId: instructor!.recipientId,
      hourlyRateCents: 1500,
      months: 3,
      timeBlocks: [{ weekday: 'FR', start: '10:00', end: '11:00', breaks: [] }],
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: body.id });
    const updated = await prisma.instructor.findUnique({
      where: { id: body.id },
      include: { recipient: true },
    });
    expect(updated).toMatchObject({ hourlyRateCents: 1500, months: 3 });
    expect(updated?.recipient.name).toBe('Anna Neu');
    expect(await prisma.invoiceRecipient.count()).toBe(1);
  });

  it('returns 409 and leaves the other recipient untouched when taking its recipient', async () => {
    const first = await request.post('/api/instructor').send(newInstructorBody('Anna Alt'));
    const second = await request.post('/api/instructor').send(newInstructorBody('Bernd Bach'));
    const firstRow = await prisma.instructor.findUnique({ where: { id: first.body.id } });

    const res = await request.put(`/api/instructor/${second.body.id}`).send({
      ...newInstructorBody('Hijacked'),
      recipientId: firstRow!.recipientId,
    });

    expect(res.status).toBe(409);
    const firstRecipient = await prisma.invoiceRecipient.findUnique({
      where: { id: firstRow!.recipientId },
    });
    expect(firstRecipient?.name).toBe('Anna Alt');
  });

  it.each(['999', 'abc'])('returns 404 for id %s', async (id) => {
    const res = await request.put(`/api/instructor/${id}`).send(newInstructorBody());
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Instructor not found' });
    expect(await prisma.invoiceRecipient.count()).toBe(0);
  });
});

describe('DELETE /api/instructor/:id', () => {
  it('deletes the instructor and keeps the recipient', async () => {
    const { body } = await request.post('/api/instructor').send(newInstructorBody());

    const res = await request.delete(`/api/instructor/${body.id}`);

    expect(res.status).toBe(204);
    expect(await prisma.instructor.count()).toBe(0);
    expect(await prisma.invoiceRecipient.count()).toBe(1);
  });

  it.each(['999', 'abc'])('returns 404 for id %s', async (id) => {
    const res = await request.delete(`/api/instructor/${id}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Instructor not found' });
  });
});

describe('GET /api/instructor/:id/invoice-prefill', () => {
  it('returns recipient, title and one line item with the total', async () => {
    const { body } = await request.post('/api/instructor').send(newInstructorBody());

    const res = await request.get(`/api/instructor/${body.id}/invoice-prefill`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      recipient: expect.objectContaining({ name: 'Anna Alt', email: 'anna@example.org' }),
      title: 'Raummiete',
      lineItems: [
        {
          text: 'Raummiete 6 Monate (7,5 h/Woche × 3,25 Wochen × 6 Monate × 12,00 €)',
          priceInCents: 175500,
        },
      ],
    });
  });

  it('uses the singular for one month', async () => {
    const { body } = await request
      .post('/api/instructor')
      .send({ ...newInstructorBody(), months: 1 });

    const res = await request.get(`/api/instructor/${body.id}/invoice-prefill`);

    expect(res.body.lineItems[0].text).toBe(
      'Raummiete 1 Monat (7,5 h/Woche × 3,25 Wochen × 1 Monat × 12,00 €)',
    );
    expect(res.body.lineItems[0].priceInCents).toBe(29250);
  });

  it.each(['999', 'abc'])('returns 404 for id %s', async (id) => {
    const res = await request.get(`/api/instructor/${id}/invoice-prefill`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Instructor not found' });
  });
});

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

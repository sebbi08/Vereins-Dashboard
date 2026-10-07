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

async function createInstructor(name: string) {
  const recipient = await prisma.invoiceRecipient.create({
    data: { name, street: 'Hauptstr. 1', city: '12345 Berlin', email: null, salutation: null },
  });
  return prisma.instructor.create({
    data: { recipientId: recipient.id, hourlyRateCents: 1200, months: 6, timeBlocks: '[]' },
  });
}

describe('InstructorInvoiceRequest model', () => {
  it('stores one row per instructor and month', async () => {
    const instructor = await createInstructor('Anna Alt');
    const data = { instructorId: instructor.id, month: '2026-10' };
    await prisma.instructorInvoiceRequest.create({ data });
    await expect(prisma.instructorInvoiceRequest.create({ data })).rejects.toThrow();
  });

  it('is deleted together with its instructor', async () => {
    const instructor = await createInstructor('Anna Alt');
    await prisma.instructorInvoiceRequest.create({
      data: { instructorId: instructor.id, month: '2026-10' },
    });

    await prisma.instructor.delete({ where: { id: instructor.id } });

    expect(await prisma.instructorInvoiceRequest.count()).toBe(0);
  });

  it('is removed by cleanDatabase', async () => {
    const instructor = await createInstructor('Anna Alt');
    await prisma.instructorInvoiceRequest.create({
      data: { instructorId: instructor.id, month: '2026-10' },
    });

    await cleanDatabase();

    expect(await prisma.instructorInvoiceRequest.count()).toBe(0);
    expect(await prisma.instructor.count()).toBe(0);
  });

  it('is removed by POST /api/e2e/reset', async () => {
    const instructor = await createInstructor('Anna Alt');
    await prisma.instructorInvoiceRequest.create({
      data: { instructorId: instructor.id, month: '2026-10' },
    });

    const res = await request.post('/api/e2e/reset');

    expect(res.status).toBe(200);
    expect(await prisma.instructorInvoiceRequest.count()).toBe(0);
  });
});

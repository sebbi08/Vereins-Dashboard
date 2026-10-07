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

function requestsOf(instructorId: number) {
  return prisma.instructorInvoiceRequest.findMany({
    where: { instructorId },
    select: { month: true },
    orderBy: { month: 'asc' },
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

describe('GET /api/instructor/invoice-requests', () => {
  it('returns the requests of one year ordered by instructor and month', async () => {
    const anna = await createInstructor('Anna Alt');
    const bernd = await createInstructor('Bernd Bach');
    await prisma.instructorInvoiceRequest.createMany({
      data: [
        { instructorId: bernd.id, month: '2026-02' },
        { instructorId: anna.id, month: '2026-12' },
        { instructorId: anna.id, month: '2025-12' },
        { instructorId: bernd.id, month: '2027-01' },
        { instructorId: anna.id, month: '2026-01' },
      ],
    });

    const res = await request.get('/api/instructor/invoice-requests?year=2026');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { instructorId: anna.id, month: '2026-01' },
      { instructorId: anna.id, month: '2026-12' },
      { instructorId: bernd.id, month: '2026-02' },
    ]);
  });

  it('returns an empty list for a year without requests', async () => {
    const res = await request.get('/api/instructor/invoice-requests?year=2026');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it.each([
    '',
    '?year=',
    '?year=abc',
    '?year=1999',
    '?year=2101',
    '?year=2026.5',
    '?year=02026',
    '?year=2026&year=2027',
  ])('returns 400 for the query %j', async (query) => {
    const res = await request.get(`/api/instructor/invoice-requests${query}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid year' });
  });
});

describe.each(['put', 'delete'] as const)(
  '%s /api/instructor/:id/invoice-requests/:month',
  (method) => {
    it('returns 404 for an unknown instructor', async () => {
      const res = await request[method]('/api/instructor/999999/invoice-requests/2026-10');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Instructor not found' });
    });

    it.each(['abc', '0', '-1', '1.5'])('returns 400 for the instructor id %j', async (id) => {
      const res = await request[method](`/api/instructor/${id}/invoice-requests/2026-10`);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid instructor id or month' });
    });

    it.each(['2026-13', '2026-00', '2026-1', '26-01', '1999-12', 'abc'])(
      'returns 400 for the month %j',
      async (month) => {
        const instructor = await createInstructor('Anna Alt');
        const res = await request[method](
          `/api/instructor/${instructor.id}/invoice-requests/${month}`,
        );
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'Invalid instructor id or month' });
      },
    );
  },
);

describe('PUT /api/instructor/:id/invoice-requests/:month', () => {
  it('marks the month as requested and can be repeated', async () => {
    const instructor = await createInstructor('Anna Alt');
    const url = `/api/instructor/${instructor.id}/invoice-requests/2026-10`;

    expect((await request.put(url)).status).toBe(204);
    expect((await request.put(url)).status).toBe(204);

    expect(await requestsOf(instructor.id)).toEqual([{ month: '2026-10' }]);
  });
});

describe('DELETE /api/instructor/:id/invoice-requests/:month', () => {
  it('removes the mark and can be repeated', async () => {
    const instructor = await createInstructor('Anna Alt');
    await prisma.instructorInvoiceRequest.createMany({
      data: [
        { instructorId: instructor.id, month: '2026-10' },
        { instructorId: instructor.id, month: '2026-11' },
      ],
    });
    const url = `/api/instructor/${instructor.id}/invoice-requests/2026-10`;

    expect((await request.delete(url)).status).toBe(204);
    expect((await request.delete(url)).status).toBe(204);

    expect(await requestsOf(instructor.id)).toEqual([{ month: '2026-11' }]);
  });
});

describe('DELETE /api/instructor/:id', () => {
  it("also deletes the instructor's invoice requests", async () => {
    const instructor = await createInstructor('Anna Alt');
    await request.put(`/api/instructor/${instructor.id}/invoice-requests/2026-10`);

    const res = await request.delete(`/api/instructor/${instructor.id}`);

    expect(res.status).toBe(204);
    expect(await prisma.instructorInvoiceRequest.count()).toBe(0);
  });
});

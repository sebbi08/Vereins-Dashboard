import supertest from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { initializeApp } from '../../init';
import { prisma } from '../../prismaClient';
import { useCleanDatabase } from './helpers';

let request: ReturnType<typeof supertest>;

beforeAll(async () => {
  await initializeApp();
  request = supertest(createApp());
});

useCleanDatabase();

async function createSpender(data?: Partial<Parameters<typeof prisma.donor.create>[0]['data']>) {
  return prisma.donor.create({
    data: {
      name: 'Max Mustermann',
      street: 'Musterstraße 1',
      city: 'Musterstadt',
      letterSalutation: 'Sehr geehrter Herr Mustermann',
      ...data,
    },
  });
}

describe('GET /api/donor', () => {
  it('returns an empty array when no spender exist', async () => {
    const res = await request.get('/api/donor');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns all spender ordered by name', async () => {
    await createSpender({ name: 'Zorro Z' });
    await createSpender({ name: 'Anna A' });

    const res = await request.get('/api/donor');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].name).toBe('Anna A');
    expect(res.body[1].name).toBe('Zorro Z');
  });

  it('filters spender by name query', async () => {
    await createSpender({ name: 'Hans Schmidt' });
    await createSpender({ name: 'Maria Müller' });

    const res = await request.get('/api/donor?q=Schmidt');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Hans Schmidt');
  });

  it('returns at most 20 results', async () => {
    const creates = Array.from({ length: 25 }, (_, i) =>
      createSpender({ name: `Spender ${String(i).padStart(2, '0')}` }),
    );
    await Promise.all(creates);

    const res = await request.get('/api/donor');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(20);
  });
});

describe('PATCH /api/donor/:id', () => {
  it('updates a spender field', async () => {
    const spender = await createSpender();

    const res = await request
      .patch(`/api/donor/${spender.id}`)
      .send({ name: 'Max Updated' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Max Updated');
  });

  it('returns 400 for an invalid id', async () => {
    const res = await request.patch('/api/donor/not-a-number').send({ name: 'Test' });
    expect(res.status).toBe(400);
  });
});

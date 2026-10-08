import supertest from 'supertest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import { initializeApp } from '../../init';
import { prisma } from '../../prismaClient';
import { useCleanDatabase } from './helpers';

beforeAll(async () => {
  await initializeApp();
});

useCleanDatabase();

afterEach(() => {
  vi.unstubAllEnvs();
});

async function createRecipient() {
  return prisma.invoiceRecipient.create({
    data: {
      name: 'Anna Alt',
      street: 'Hauptstr. 1',
      city: '12345 Berlin',
      email: null,
      salutation: null,
    },
  });
}

describe('POST /api/e2e/reset', () => {
  it('does not exist unless E2E_RESET_ENABLED is "true"', async () => {
    vi.stubEnv('E2E_RESET_ENABLED', '');
    await createRecipient();

    const res = await supertest(createApp()).post('/api/e2e/reset');

    expect(res.status).toBe(404);
    expect(await prisma.invoiceRecipient.count()).toBe(1);
  });

  it('does not exist in production even when the flag is set', async () => {
    vi.stubEnv('E2E_RESET_ENABLED', 'true');
    vi.stubEnv('NODE_ENV', 'production');
    await createRecipient();

    const res = await supertest(createApp()).post('/api/e2e/reset');

    expect(res.status).toBe(404);
    expect(await prisma.invoiceRecipient.count()).toBe(1);
  });

  it('wipes the data when the flag is set outside production', async () => {
    vi.stubEnv('E2E_RESET_ENABLED', 'true');
    await createRecipient();

    const res = await supertest(createApp()).post('/api/e2e/reset');

    expect(res.status).toBe(200);
    expect(await prisma.invoiceRecipient.count()).toBe(0);
  });
});

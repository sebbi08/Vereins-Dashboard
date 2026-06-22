import supertest from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

describe('GET /api/settings', () => {
  it('returns an object with the default settings keys', async () => {
    await initializeApp(); // seed defaults
    const res = await request.get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('treasurer');
    expect(res.body).toHaveProperty('charitablePurpose');
    expect(res.body).toHaveProperty('taxOfficeName');
    expect(res.body).toHaveProperty('taxNumber');
    expect(res.body).toHaveProperty('exemptionDate');
    expect(res.body).toHaveProperty('assessmentPeriod');
  });

  it('returns the default charitablePurpose value', async () => {
    await initializeApp();
    const res = await request.get('/api/settings');
    expect(res.body.charitablePurpose).toBe('');
  });
});

describe('PUT /api/settings', () => {
  beforeEach(async () => {
    await initializeApp();
  });

  it('updates an existing setting', async () => {
    const res = await request
      .put('/api/settings')
      .send({ treasurer: 'Max Mustermann' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message');

    const updated = await prisma.systemSetting.findUnique({ where: { key: 'treasurer' } });
    expect(updated?.value).toBe('Max Mustermann');
  });

  it('creates a new setting if it did not exist', async () => {
    await prisma.systemSetting.deleteMany({ where: { key: 'taxOfficeName' } });

    const res = await request
      .put('/api/settings')
      .send({ taxOfficeName: 'Finanzamt Berlin' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);

    const setting = await prisma.systemSetting.findUnique({ where: { key: 'taxOfficeName' } });
    expect(setting?.value).toBe('Finanzamt Berlin');
  });

  it('ignores unknown keys', async () => {
    const res = await request
      .put('/api/settings')
      .send({ unknownKey: 'value' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);

    const setting = await prisma.systemSetting.findUnique({ where: { key: 'unknownKey' } });
    expect(setting).toBeNull();
  });
});

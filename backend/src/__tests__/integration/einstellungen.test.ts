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

describe('GET /api/einstellungen', () => {
  it('returns an object with the default settings keys', async () => {
    await initializeApp(); // seed defaults
    const res = await request.get('/api/einstellungen');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('kassenwart');
    expect(res.body).toHaveProperty('gemeinnuetzigerZweck');
    expect(res.body).toHaveProperty('finanzamtName');
    expect(res.body).toHaveProperty('steuernummer');
    expect(res.body).toHaveProperty('freistellungsdatum');
    expect(res.body).toHaveProperty('veranlagungszeitraum');
  });

  it('returns the default gemeinnuetzigerZweck value', async () => {
    await initializeApp();
    const res = await request.get('/api/einstellungen');
    expect(res.body.gemeinnuetzigerZweck).toBe('Förderung der Jugend- und Musikkultur');
  });
});

describe('PUT /api/einstellungen', () => {
  beforeEach(async () => {
    await initializeApp();
  });

  it('updates an existing setting', async () => {
    const res = await request
      .put('/api/einstellungen')
      .send({ kassenwart: 'Max Mustermann' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message');

    const updated = await prisma.systemEinstellung.findUnique({ where: { key: 'kassenwart' } });
    expect(updated?.value).toBe('Max Mustermann');
  });

  it('creates a new setting if it did not exist', async () => {
    await prisma.systemEinstellung.deleteMany({ where: { key: 'finanzamtName' } });

    const res = await request
      .put('/api/einstellungen')
      .send({ finanzamtName: 'Finanzamt Berlin' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);

    const setting = await prisma.systemEinstellung.findUnique({ where: { key: 'finanzamtName' } });
    expect(setting?.value).toBe('Finanzamt Berlin');
  });

  it('ignores unknown keys', async () => {
    const res = await request
      .put('/api/einstellungen')
      .send({ unknownKey: 'value' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);

    const setting = await prisma.systemEinstellung.findUnique({ where: { key: 'unknownKey' } });
    expect(setting).toBeNull();
  });
});

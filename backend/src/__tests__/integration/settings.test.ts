import supertest from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_BOOKING_IMPORT_SETTINGS } from '../../../../shared/src/invoicePayments';
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

describe('booking import settings', () => {
  const custom = {
    encoding: 'utf-8',
    delimiter: '\t',
    columns: { date: 'Datum', payer: 'Name', purpose: 'Text', amount: 'Umsatz' },
  };

  it('answers the defaults when nothing is stored', async () => {
    const res = await request.get('/api/settings/booking-import');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(DEFAULT_BOOKING_IMPORT_SETTINGS);
  });

  it('stores the settings and answers them on the next GET', async () => {
    const put = await request.put('/api/settings/booking-import').send(custom);
    expect(put.status).toBe(200);
    expect(put.body).toEqual(custom);
    expect((await request.get('/api/settings/booking-import')).body).toEqual(custom);
  });

  it.each([
    { ...custom, encoding: 'latin1' },
    { ...custom, delimiter: '|' },
    { ...custom, columns: { ...custom.columns, date: 5 } },
    { ...custom, columns: { date: 'Datum', payer: 'Name', purpose: 'Text' } },
    { ...custom, columns: { ...custom.columns, date: 'x'.repeat(201) } },
    { encoding: 'utf-8', delimiter: ';' },
  ])('rejects %j', async (body) => {
    const res = await request.put('/api/settings/booking-import').send(body);
    expect(res.status).toBe(400);
    expect((await request.get('/api/settings/booking-import')).body).toEqual(
      DEFAULT_BOOKING_IMPORT_SETTINGS,
    );
  });

  it('falls back to the defaults when the stored value is unreadable', async () => {
    await prisma.systemSetting.create({ data: { key: 'bookingImport', value: '{oops' } });
    const res = await request.get('/api/settings/booking-import');
    expect(res.body).toEqual(DEFAULT_BOOKING_IMPORT_SETTINGS);
  });

  it('keeps the booking import out of the general settings', async () => {
    await request.put('/api/settings/booking-import').send(custom);
    const res = await request.get('/api/settings');
    expect(res.body).not.toHaveProperty('bookingImport');
  });
});

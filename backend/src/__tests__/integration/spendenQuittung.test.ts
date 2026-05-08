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

async function seedSpenderAndQuittung() {
  const spender = await prisma.spender.create({
    data: {
      name: 'Test Spender',
      strasse: 'Teststraße 1',
      ort: 'Teststadt',
      briefAnrede: 'Sehr geehrte Damen und Herren',
    },
  });

  const quittung = await prisma.spendenQuittung.create({
    data: {
      nummer: 'SQ-2024-0001',
      jahr: 2024,
      laufendeNummer: 1,
      spenderId: spender.id,
      spendendatum: new Date('2024-06-01'),
    },
  });

  // Need a vorlage to create a revision
  const vorlage = await prisma.vorlage.create({
    data: {
      typ: 'QUITTUNG',
      version: 1,
      dateiName: 'test.pdf',
      dateiPfad: 'vorlagen/test.pdf',
      aktiv: true,
    },
  });

  const revision = await prisma.spendenQuittungRevision.create({
    data: {
      quittungId: quittung.id,
      revisionNummer: 1,
      name: 'Test Spender',
      strasse: 'Teststraße 1',
      ort: 'Teststadt',
      briefAnrede: 'Sehr geehrte Damen und Herren',
      spendenbetragCents: 5000,
      spendendatum: new Date('2024-06-01'),
      mitAnschreiben: false,
      kassenwart: 'Kassenwart',
      gemeinnuetzigerZweck: 'Förderung',
      finanzamtName: 'Finanzamt',
      steuernummer: '123/456/789',
      freistellungsdatum: '01.01.2024',
      veranlagungszeitraum: '2024',
      quittungsVorlageId: vorlage.id,
      pdfStatus: 'OK',
    },
  });

  return { spender, quittung, revision, vorlage };
}

describe('GET /api/spenden-quittung', () => {
  it('returns empty list when no quittungen exist', async () => {
    const res = await request.get('/api/spenden-quittung');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns list of active quittungen', async () => {
    await seedSpenderAndQuittung();

    const res = await request.get('/api/spenden-quittung');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      nummer: 'SQ-2024-0001',
      status: 'AKTIV',
      spenderName: 'Test Spender',
      spendenbetragCents: 5000,
    });
  });

  it('excludes stornierte quittungen by default', async () => {
    const { quittung } = await seedSpenderAndQuittung();
    await prisma.spendenQuittung.update({
      where: { id: quittung.id },
      data: { status: 'STORNIERT' },
    });

    const res = await request.get('/api/spenden-quittung');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it('includes stornierte quittungen when mitStorniert=true', async () => {
    const { quittung } = await seedSpenderAndQuittung();
    await prisma.spendenQuittung.update({
      where: { id: quittung.id },
      data: { status: 'STORNIERT' },
    });

    const res = await request.get('/api/spenden-quittung?mitStorniert=true');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].status).toBe('STORNIERT');
  });
});

describe('GET /api/spenden-quittung/:id', () => {
  it('returns a quittung with revisions', async () => {
    const { quittung } = await seedSpenderAndQuittung();

    const res = await request.get(`/api/spenden-quittung/${quittung.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: quittung.id,
      nummer: 'SQ-2024-0001',
      status: 'AKTIV',
    });
    expect(res.body.revisionen).toHaveLength(1);
  });

  it('returns 404 for non-existent quittung', async () => {
    const res = await request.get('/api/spenden-quittung/99999');
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid id', async () => {
    const res = await request.get('/api/spenden-quittung/invalid');
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/spenden-quittung/:id/stornieren', () => {
  it('sets quittung status to STORNIERT', async () => {
    const { quittung } = await seedSpenderAndQuittung();

    const res = await request.patch(`/api/spenden-quittung/${quittung.id}/stornieren`);
    expect(res.status).toBe(200);

    const updated = await prisma.spendenQuittung.findUnique({ where: { id: quittung.id } });
    expect(updated?.status).toBe('STORNIERT');
  });

  it('returns 404 for non-existent quittung', async () => {
    const res = await request.patch('/api/spenden-quittung/99999/stornieren');
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid id', async () => {
    const res = await request.patch('/api/spenden-quittung/invalid/stornieren');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/spenden-quittung/revision/:revisionId/download', () => {
  it('returns 404 when revision has no PDF', async () => {
    const { revision } = await seedSpenderAndQuittung();
    await prisma.spendenQuittungRevision.update({
      where: { id: revision.id },
      data: { pdfStatus: 'FAILED', dateiPfad: null },
    });

    const res = await request.get(`/api/spenden-quittung/revision/${revision.id}/download`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for non-existent revision', async () => {
    const res = await request.get('/api/spenden-quittung/revision/99999/download');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/spenden-quittung/revision/:revisionId/retry-pdf', () => {
  it('returns 400 when pdfStatus is not FAILED', async () => {
    const { revision } = await seedSpenderAndQuittung();
    // revision has pdfStatus 'OK' from seed
    const res = await request.post(`/api/spenden-quittung/revision/${revision.id}/retry-pdf`);
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent revision', async () => {
    const res = await request.post('/api/spenden-quittung/revision/99999/retry-pdf');
    expect(res.status).toBe(404);
  });
});

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

async function seedVorlage() {
  return prisma.vorlage.create({
    data: {
      typ: 'RECHNUNG',
      version: 1,
      dateiName: 'template.docx',
      dateiPfad: 'vorlagen/template.docx',
      aktiv: true,
    },
  });
}

async function seedEmpfaengerAndRechnung() {
  const vorlage = await seedVorlage();

  const empfaenger = await prisma.rechnungsempfaenger.create({
    data: {
      name: 'Test Firma',
      strasse: 'Teststraße 1',
      ort: 'Teststadt',
      email: 'test@example.com',
    },
  });

  const rechnung = await prisma.rechnung.create({
    data: {
      nummer: '1 / 2026',
      jahr: 2026,
      laufendeNummer: 1,
      empfaengerId: empfaenger.id,
      rechnungsdatum: new Date('2026-06-01'),
    },
  });

  const revision = await prisma.rechnungRevision.create({
    data: {
      rechnungId: rechnung.id,
      revisionNummer: 1,
      anrede: '',
      name: 'Test Firma',
      strasse: 'Teststraße 1',
      ort: 'Teststadt',
      rechnungsdatum: new Date('2026-06-01'),
      title: 'Test Rechnung',
      positionen: JSON.stringify([{ text: 'Test Position', priceInCents: 10000 }]),
      ust: 19,
      einzug: false,
      email: 'test@example.com',
      mailAnrede: 'Sehr geehrte Damen und Herren',
      vorlageId: vorlage.id,
      pdfStatus: 'OK',
    },
  });

  return { vorlage, empfaenger, rechnung, revision };
}

const gEingaben = {
  anrede: '',
  name: 'Test Firma',
  strasse: 'Teststraße 1',
  ort: 'Teststadt',
  rechnungsdatum: '2026-06-01',
  title: 'Test Rechnung',
  positionen: [{ text: 'Test Position', priceInCents: 10000 }],
  ust: 19,
  einzug: false,
  email: 'test@example.com',
  mailAnrede: 'Sehr geehrte Damen und Herren',
};

describe('GET /api/rechnung', () => {
  it('returns empty list when no rechnungen exist', async () => {
    const res = await request.get('/api/rechnung');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns list of active rechnungen', async () => {
    await seedEmpfaengerAndRechnung();

    const res = await request.get('/api/rechnung');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      nummer: '1 / 2026',
      status: 'AKTIV',
      empfaengerName: 'Test Firma',
    });
  });

  it('excludes stornierte rechnungen by default', async () => {
    const { rechnung } = await seedEmpfaengerAndRechnung();
    await prisma.rechnung.update({
      where: { id: rechnung.id },
      data: { status: 'STORNIERT' },
    });

    const res = await request.get('/api/rechnung');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it('includes stornierte rechnungen when mitStorniert=true', async () => {
    const { rechnung } = await seedEmpfaengerAndRechnung();
    await prisma.rechnung.update({
      where: { id: rechnung.id },
      data: { status: 'STORNIERT' },
    });

    const res = await request.get('/api/rechnung?mitStorniert=true');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].status).toBe('STORNIERT');
  });
});

describe('GET /api/rechnung/empfaenger', () => {
  it('returns empty list when no empfaenger exist', async () => {
    const res = await request.get('/api/rechnung/empfaenger');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns empfaenger matching search', async () => {
    await prisma.rechnungsempfaenger.create({
      data: { name: 'Test Firma', strasse: 'X', ort: 'Y' },
    });

    const res = await request.get('/api/rechnung/empfaenger?search=Test');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe('GET /api/rechnung/:id', () => {
  it('returns a rechnung with revisions', async () => {
    const { rechnung } = await seedEmpfaengerAndRechnung();

    const res = await request.get(`/api/rechnung/${rechnung.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: rechnung.id,
      nummer: '1 / 2026',
      status: 'AKTIV',
    });
    expect(res.body.revisionen).toHaveLength(1);
  });

  it('returns 404 for non-existent rechnung', async () => {
    const res = await request.get('/api/rechnung/99999');
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid id', async () => {
    const res = await request.get('/api/rechnung/invalid');
    expect(res.status).toBe(400);
  });
});

describe('POST /api/rechnung', () => {
  it('returns 400 without template', async () => {
    const res = await request.post('/api/rechnung').send({
      empfaengerDaten: { name: 'Test', strasse: 'X', ort: 'Y' },
      eingaben: gEingaben,
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 with empty positionen', async () => {
    await seedVorlage();
    const res = await request.post('/api/rechnung').send({
      empfaengerDaten: { name: 'Test', strasse: 'X', ort: 'Y' },
      eingaben: { ...gEingaben, positionen: [] },
    });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/rechnung/:id/stornieren', () => {
  it('sets rechnung status to STORNIERT', async () => {
    const { rechnung } = await seedEmpfaengerAndRechnung();

    const res = await request.patch(`/api/rechnung/${rechnung.id}/stornieren`);
    expect(res.status).toBe(200);

    const updated = await prisma.rechnung.findUnique({ where: { id: rechnung.id } });
    expect(updated?.status).toBe('STORNIERT');
  });

  it('returns 404 for non-existent rechnung', async () => {
    const res = await request.patch('/api/rechnung/99999/stornieren');
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid id', async () => {
    const res = await request.patch('/api/rechnung/invalid/stornieren');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/rechnung/revision/:revisionId/download', () => {
  it('returns 404 when revision has no PDF', async () => {
    const { revision } = await seedEmpfaengerAndRechnung();
    await prisma.rechnungRevision.update({
      where: { id: revision.id },
      data: { pdfStatus: 'FAILED', dateiPfad: null },
    });

    const res = await request.get(`/api/rechnung/revision/${revision.id}/download`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for non-existent revision', async () => {
    const res = await request.get('/api/rechnung/revision/99999/download');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/rechnung/revision/:revisionId/retry-pdf', () => {
  it('returns 400 when pdfStatus is not FAILED', async () => {
    const { revision } = await seedEmpfaengerAndRechnung();
    const res = await request.post(`/api/rechnung/revision/${revision.id}/retry-pdf`);
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent revision', async () => {
    const res = await request.post('/api/rechnung/revision/99999/retry-pdf');
    expect(res.status).toBe(404);
  });
});

import type { Prisma } from '@prisma/client';
import { Router } from 'express';
import fs from 'fs';
import type { PdfStatus, QuittungEingaben, SpendenQuittungListItem } from 'shared';
import { prisma } from '../prismaClient';
import { generiereQuittungPdf } from '../services/pdfGenerierung';
import { generiereQuittungsNummer } from '../services/quittungsNummer';

export const spendenQuittungRouter = Router();

const DEFAULT_BRIEF_ANREDE = 'Sehr geehrte Damen und Herren';
const PDF_FEHLER_MELDUNG = 'PDF konnte nicht erzeugt werden. Bitte Retry versuchen.';
const laufendeRetries = new Set<number>();

function revisionZuDto(rev: {
  id: number;
  revisionNummer: number;
  status: string;
  pdfStatus: string;
  pdfFehler: string | null;
  pdfTechFehler: string | null;
  name: string;
  strasse: string;
  ort: string;
  briefAnrede: string;
  adressAnrede: string | null;
  spendenbetragCents: number;
  spendendatum: Date;
  mitAnschreiben: boolean;
  kassenwart: string;
  gemeinnuetzigerZweck: string;
  finanzamtName: string;
  steuernummer: string;
  freistellungsdatum: string;
  veranlagungszeitraum: string;
  dateiPfad: string | null;
  erstelltAm: Date;
}) {
  return {
    id: rev.id,
    revisionNummer: rev.revisionNummer,
    status: rev.status,
    pdfStatus: rev.pdfStatus as PdfStatus,
    pdfFehler: rev.pdfFehler,
    pdfTechFehler: rev.pdfTechFehler,
    eingaben: {
      name: rev.name,
      strasse: rev.strasse,
      ort: rev.ort,
      briefAnrede: rev.briefAnrede,
      adressAnrede: rev.adressAnrede ?? '',
      spendenbetragCents: rev.spendenbetragCents,
      spendendatum: rev.spendendatum.toISOString(),
      mitAnschreiben: rev.mitAnschreiben,
      kassenwart: rev.kassenwart,
      gemeinnuetzigerZweck: rev.gemeinnuetzigerZweck,
      finanzamtName: rev.finanzamtName,
      steuernummer: rev.steuernummer,
      freistellungsdatum: rev.freistellungsdatum,
      veranlagungszeitraum: rev.veranlagungszeitraum,
    },
    dateiPfad: rev.dateiPfad,
    erstelltAm: rev.erstelltAm.toISOString(),
  };
}

function validierePflichtfelder(eingaben: QuittungEingaben): string | null {
  if (!eingaben.name.trim()) return 'Name ist erforderlich';
  if (!eingaben.strasse.trim()) return 'Straße ist erforderlich';
  if (!eingaben.ort.trim()) return 'Ort ist erforderlich';
  if (eingaben.mitAnschreiben && !eingaben.briefAnrede.trim()) {
    return 'BriefAnrede ist erforderlich, wenn ein Anschreiben erstellt wird';
  }
  return null;
}

function normalizeAdressAnrede(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? '';
  return normalized ? normalized : null;
}

function normalizeBriefAnrede(eingaben: QuittungEingaben): string {
  if (eingaben.mitAnschreiben) {
    return eingaben.briefAnrede.trim();
  }
  return DEFAULT_BRIEF_ANREDE;
}

async function updateRevisionPdfStatus(
  revisionId: number,
  update: {
    pdfStatus: PdfStatus;
    dateiPfad?: string | null;
    pdfFehler?: string | null;
    pdfTechFehler?: string | null;
  },
) {
  await prisma.spendenQuittungRevision.update({
    where: { id: revisionId },
    data: {
      pdfStatus: update.pdfStatus,
      ...(update.dateiPfad !== undefined && { dateiPfad: update.dateiPfad }),
      ...(update.pdfFehler !== undefined && { pdfFehler: update.pdfFehler }),
      ...(update.pdfTechFehler !== undefined && { pdfTechFehler: update.pdfTechFehler }),
    },
  });
}

function serialisiereTechnischenFehler(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || `${error.name}: ${error.message}`;
  }
  return String(error);
}

async function versuchePdfErzeugung(revisionId: number) {
  try {
    const dateiPfad = await generiereQuittungPdf(prisma, revisionId);
    await updateRevisionPdfStatus(revisionId, {
      pdfStatus: 'OK',
      dateiPfad,
      pdfFehler: null,
      pdfTechFehler: null,
    });
    return {
      pdfStatus: 'OK' as const,
      pdfFehler: null,
      pdfTechFehler: null,
      dateiPfad,
    };
  } catch (error) {
    await updateRevisionPdfStatus(revisionId, {
      pdfStatus: 'FAILED',
      dateiPfad: null,
      pdfFehler: PDF_FEHLER_MELDUNG,
      pdfTechFehler: serialisiereTechnischenFehler(error),
    });

    const failed = await prisma.spendenQuittungRevision.findUniqueOrThrow({
      where: { id: revisionId },
      select: { pdfFehler: true, pdfTechFehler: true },
    });

    return {
      pdfStatus: 'FAILED' as const,
      pdfFehler: failed.pdfFehler,
      pdfTechFehler: failed.pdfTechFehler,
      dateiPfad: null,
    };
  }
}

// GET /api/spenden-quittung
spendenQuittungRouter.get('/', async (req, res) => {
  const search = String(req.query.search ?? '');
  const vonDatum = req.query.vonDatum ? new Date(String(req.query.vonDatum)) : undefined;
  const bisDatum = req.query.bisDatum ? new Date(String(req.query.bisDatum)) : undefined;
  const mitStorniert = req.query.mitStorniert === 'true';

  const quittungen = await prisma.spendenQuittung.findMany({
    where: {
      ...(mitStorniert ? {} : { status: 'AKTIV' }),
      ...(vonDatum || bisDatum ? { spendendatum: { gte: vonDatum, lte: bisDatum } } : {}),
      ...(search
        ? {
            OR: [{ nummer: { contains: search } }, { spender: { name: { contains: search } } }],
          }
        : {}),
    },
    include: {
      spender: true,
      revisionen: {
        where: { status: 'AKTIV' },
        orderBy: { revisionNummer: 'desc' },
        take: 1,
      },
    },
    orderBy: { spendendatum: 'desc' },
  });

  const list: SpendenQuittungListItem[] = quittungen.map((q) => ({
    id: q.id,
    nummer: q.nummer,
    status: q.status as 'AKTIV' | 'STORNIERT',
    spenderName: q.spender.name,
    spendenbetragCents: q.revisionen[0]?.spendenbetragCents ?? 0,
    spendendatum: q.spendendatum.toISOString(),
    createdAt: q.createdAt.toISOString(),
    aktiveRevisionNummer: q.revisionen[0]?.revisionNummer ?? null,
  }));

  res.json(list);
});

// GET /api/spenden-quittung/revision/:revisionId/download
spendenQuittungRouter.get('/revision/:revisionId/download', async (req, res) => {
  const id = parseInt(req.params.revisionId);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Ungültige Revisions-ID' });
    return;
  }

  const revision = await prisma.spendenQuittungRevision.findUnique({
    where: { id },
    include: { quittung: true },
  });

  if (!revision) {
    res.status(404).json({ error: 'Revision nicht gefunden' });
    return;
  }

  if (!revision.dateiPfad || revision.pdfStatus !== 'OK') {
    res.status(404).json({ error: 'Datei nicht vorhanden' });
    return;
  }

  const dateiName = `${revision.quittung.nummer}-R${revision.revisionNummer}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${dateiName}"`);
  fs.createReadStream(revision.dateiPfad).pipe(res);
});

// POST /api/spenden-quittung/revision/:revisionId/retry-pdf
spendenQuittungRouter.post('/revision/:revisionId/retry-pdf', async (req, res) => {
  const id = parseInt(req.params.revisionId);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Ungültige Revisions-ID' });
    return;
  }

  const revision = await prisma.spendenQuittungRevision.findUnique({ where: { id } });
  if (!revision) {
    res.status(404).json({ error: 'Revision nicht gefunden' });
    return;
  }

  if (revision.status !== 'AKTIV') {
    res.status(400).json({ error: 'Retry ist nur für aktive Revisionen erlaubt' });
    return;
  }

  if (revision.pdfStatus !== 'FAILED') {
    res.status(400).json({ error: 'Retry ist nur bei fehlgeschlagenem PDF möglich' });
    return;
  }

  if (laufendeRetries.has(id)) {
    res.status(409).json({ error: 'Für diese Revision läuft bereits ein Retry' });
    return;
  }

  laufendeRetries.add(id);
  try {
    const pdf = await versuchePdfErzeugung(id);
    res.json({
      revisionId: id,
      pdfStatus: pdf.pdfStatus,
      pdfFehler: pdf.pdfFehler,
      pdfTechFehler: pdf.pdfTechFehler,
      dateiPfad: pdf.dateiPfad,
    });
  } finally {
    laufendeRetries.delete(id);
  }
});

// GET /api/spenden-quittung/:id
spendenQuittungRouter.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Ungültige ID' });
    return;
  }

  const quittung = await prisma.spendenQuittung.findUnique({
    where: { id },
    include: {
      spender: true,
      revisionen: { orderBy: { revisionNummer: 'desc' } },
    },
  });

  if (!quittung) {
    res.status(404).json({ error: 'Quittung nicht gefunden' });
    return;
  }

  const aktiveRevision = quittung.revisionen.find((r: { status: string }) => r.status === 'AKTIV');

  res.json({
    id: quittung.id,
    nummer: quittung.nummer,
    status: quittung.status,
    spender: quittung.spender,
    spendendatum: quittung.spendendatum.toISOString(),
    createdAt: quittung.createdAt.toISOString(),
    aktiveRevision: aktiveRevision ? revisionZuDto(aktiveRevision) : null,
    revisionen: quittung.revisionen.map(revisionZuDto),
  });
});

// POST /api/spenden-quittung
spendenQuittungRouter.post('/', async (req, res) => {
  const body = req.body as {
    spenderId?: number;
    spenderDaten?: {
      name: string;
      strasse: string;
      ort: string;
      briefAnrede?: string;
      adressAnrede?: string;
    };
    eingaben: QuittungEingaben;
  };

  const validierungsfehler = validierePflichtfelder(body.eingaben);
  if (validierungsfehler) {
    res.status(400).json({ error: validierungsfehler });
    return;
  }

  const quittungsVorlage = await prisma.vorlage.findFirst({
    where: { typ: 'QUITTUNG', aktiv: true },
  });
  if (!quittungsVorlage) {
    res.status(400).json({ error: 'Keine aktive Quittungsvorlage vorhanden' });
    return;
  }

  const anschreibenVorlage = body.eingaben.mitAnschreiben
    ? await prisma.vorlage.findFirst({
        where: { typ: 'ANSCHREIBEN', aktiv: true },
      })
    : null;

  if (body.eingaben.mitAnschreiben && !anschreibenVorlage) {
    res.status(400).json({ error: 'Keine aktive Anschreibenvorlage vorhanden' });
    return;
  }

  const { nummer, jahr, laufendeNummer } = await generiereQuittungsNummer(prisma);
  const spendendatum = new Date(body.eingaben.spendendatum);

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    let spenderUpdated = false;
    let spenderId = body.spenderId;

    if (spenderId) {
      const bestehenderSpender = await tx.spender.findUnique({ where: { id: spenderId } });
      if (!bestehenderSpender) {
        throw new Error('Spender nicht gefunden');
      }

      const spenderUpdateData: {
        name: string;
        strasse: string;
        ort: string;
        briefAnrede?: string;
        adressAnrede?: string | null;
      } = {
        name: body.eingaben.name,
        strasse: body.eingaben.strasse,
        ort: body.eingaben.ort,
      };

      if (body.eingaben.mitAnschreiben) {
        spenderUpdateData.briefAnrede = body.eingaben.briefAnrede.trim();
        spenderUpdateData.adressAnrede = normalizeAdressAnrede(body.eingaben.adressAnrede);
      }

      await tx.spender.update({ where: { id: spenderId }, data: spenderUpdateData });
      spenderUpdated = true;
    } else {
      if (!body.spenderDaten) {
        throw new Error('Kein Spender angegeben');
      }

      const neuerSpender = await tx.spender.create({
        data: {
          name: body.spenderDaten.name,
          strasse: body.spenderDaten.strasse,
          ort: body.spenderDaten.ort,
          briefAnrede: body.eingaben.mitAnschreiben
            ? body.eingaben.briefAnrede.trim()
            : DEFAULT_BRIEF_ANREDE,
          adressAnrede: body.eingaben.mitAnschreiben
            ? normalizeAdressAnrede(body.eingaben.adressAnrede)
            : null,
        },
      });
      spenderId = neuerSpender.id;
      spenderUpdated = true;
    }

    const quittung = await tx.spendenQuittung.create({
      data: {
        nummer,
        jahr,
        laufendeNummer,
        spenderId: spenderId!,
        spendendatum,
      },
    });

    const revision = await tx.spendenQuittungRevision.create({
      data: {
        quittungId: quittung.id,
        revisionNummer: 1,
        name: body.eingaben.name,
        strasse: body.eingaben.strasse,
        ort: body.eingaben.ort,
        briefAnrede: normalizeBriefAnrede(body.eingaben),
        adressAnrede: body.eingaben.mitAnschreiben
          ? normalizeAdressAnrede(body.eingaben.adressAnrede)
          : null,
        spendenbetragCents: body.eingaben.spendenbetragCents,
        spendendatum,
        mitAnschreiben: body.eingaben.mitAnschreiben,
        kassenwart: body.eingaben.kassenwart,
        gemeinnuetzigerZweck: body.eingaben.gemeinnuetzigerZweck,
        finanzamtName: body.eingaben.finanzamtName,
        steuernummer: body.eingaben.steuernummer,
        freistellungsdatum: body.eingaben.freistellungsdatum,
        veranlagungszeitraum: body.eingaben.veranlagungszeitraum,
        anschreibenVorlageId: anschreibenVorlage?.id ?? null,
        quittungsVorlageId: quittungsVorlage.id,
        pdfStatus: 'PENDING',
      },
    });

    const spender = await tx.spender.findUniqueOrThrow({ where: { id: spenderId! } });

    return { quittung, revision, spender, spenderUpdated };
  });

  const pdf = await versuchePdfErzeugung(result.revision.id);

  res.status(201).json({
    quittungId: result.quittung.id,
    revisionId: result.revision.id,
    spender: result.spender,
    spenderUpdated: result.spenderUpdated,
    pdfStatus: pdf.pdfStatus,
    pdfFehler: pdf.pdfFehler,
    pdfTechFehler: pdf.pdfTechFehler,
    dateiPfad: pdf.dateiPfad,
  });
});

// POST /api/spenden-quittung/:id/revision
spendenQuittungRouter.post('/:id/revision', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Ungültige ID' });
    return;
  }

  const quittung = await prisma.spendenQuittung.findUnique({ where: { id } });
  if (!quittung) {
    res.status(404).json({ error: 'Quittung nicht gefunden' });
    return;
  }
  if (quittung.status === 'STORNIERT') {
    res.status(400).json({ error: 'Stornierte Quittungen können nicht revidiert werden' });
    return;
  }

  const body = req.body as { eingaben: QuittungEingaben };

  const validierungsfehler = validierePflichtfelder(body.eingaben);
  if (validierungsfehler) {
    res.status(400).json({ error: validierungsfehler });
    return;
  }

  const quittungsVorlage = await prisma.vorlage.findFirst({
    where: { typ: 'QUITTUNG', aktiv: true },
  });
  if (!quittungsVorlage) {
    res.status(400).json({ error: 'Keine aktive Quittungsvorlage vorhanden' });
    return;
  }

  const anschreibenVorlage = body.eingaben.mitAnschreiben
    ? await prisma.vorlage.findFirst({
        where: { typ: 'ANSCHREIBEN', aktiv: true },
      })
    : null;

  if (body.eingaben.mitAnschreiben && !anschreibenVorlage) {
    res.status(400).json({ error: 'Keine aktive Anschreibenvorlage vorhanden' });
    return;
  }

  const letzteRevision = await prisma.spendenQuittungRevision.findFirst({
    where: { quittungId: id },
    orderBy: { revisionNummer: 'desc' },
  });
  const neueRevisionNummer = (letzteRevision?.revisionNummer ?? 0) + 1;
  const spendendatum = new Date(body.eingaben.spendendatum);

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.spendenQuittungRevision.updateMany({
      where: { quittungId: id, status: 'AKTIV' },
      data: { status: 'ERSETZT' },
    });
    await tx.spendenQuittung.update({ where: { id }, data: { spendendatum } });

    const spenderUpdateData: {
      name: string;
      strasse: string;
      ort: string;
      briefAnrede?: string;
      adressAnrede?: string | null;
    } = {
      name: body.eingaben.name,
      strasse: body.eingaben.strasse,
      ort: body.eingaben.ort,
    };

    if (body.eingaben.mitAnschreiben) {
      spenderUpdateData.briefAnrede = body.eingaben.briefAnrede.trim();
      spenderUpdateData.adressAnrede = normalizeAdressAnrede(body.eingaben.adressAnrede);
    }

    await tx.spender.update({
      where: { id: quittung.spenderId },
      data: spenderUpdateData,
    });

    const neueRevision = await tx.spendenQuittungRevision.create({
      data: {
        quittungId: id,
        revisionNummer: neueRevisionNummer,
        name: body.eingaben.name,
        strasse: body.eingaben.strasse,
        ort: body.eingaben.ort,
        briefAnrede: normalizeBriefAnrede(body.eingaben),
        adressAnrede: body.eingaben.mitAnschreiben
          ? normalizeAdressAnrede(body.eingaben.adressAnrede)
          : null,
        spendenbetragCents: body.eingaben.spendenbetragCents,
        spendendatum,
        mitAnschreiben: body.eingaben.mitAnschreiben,
        kassenwart: body.eingaben.kassenwart,
        gemeinnuetzigerZweck: body.eingaben.gemeinnuetzigerZweck,
        finanzamtName: body.eingaben.finanzamtName,
        steuernummer: body.eingaben.steuernummer,
        freistellungsdatum: body.eingaben.freistellungsdatum,
        veranlagungszeitraum: body.eingaben.veranlagungszeitraum,
        anschreibenVorlageId: anschreibenVorlage?.id ?? null,
        quittungsVorlageId: quittungsVorlage.id,
        pdfStatus: 'PENDING',
      },
    });

    const spender = await tx.spender.findUniqueOrThrow({ where: { id: quittung.spenderId } });

    return { neueRevision, spender, spenderUpdated: true };
  });

  const pdf = await versuchePdfErzeugung(result.neueRevision.id);

  res.status(201).json({
    quittungId: id,
    revisionId: result.neueRevision.id,
    spender: result.spender,
    spenderUpdated: result.spenderUpdated,
    pdfStatus: pdf.pdfStatus,
    pdfFehler: pdf.pdfFehler,
    pdfTechFehler: pdf.pdfTechFehler,
    dateiPfad: pdf.dateiPfad,
  });
});

// PATCH /api/spenden-quittung/:id/stornieren
spendenQuittungRouter.patch('/:id/stornieren', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Ungültige ID' });
    return;
  }

  const quittung = await prisma.spendenQuittung.findUnique({ where: { id } });
  if (!quittung) {
    res.status(404).json({ error: 'Quittung nicht gefunden' });
    return;
  }

  await prisma.spendenQuittung.update({
    where: { id },
    data: { status: 'STORNIERT' },
  });

  res.json({ message: 'Quittung storniert' });
});

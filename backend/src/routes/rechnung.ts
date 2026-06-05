import { Router } from 'express';
import fs from 'fs';
import type { PdfStatus, RechnungEingaben, Rechnungsposition, RechnungListItem } from 'shared';
import type { Prisma } from '../../prisma/generated/client.js';
import { toAbsolutePath } from '../config.js';
import { prisma } from '../prismaClient.js';
import { generiereRechnungPdf } from '../services/pdfGenerierung.js';
import { generiereRechnungsNummer } from '../services/rechnungsNummer.js';

export const rechnungRouter = Router();

const PDF_FEHLER_MELDUNG = 'PDF konnte nicht erzeugt werden. Bitte Retry versuchen.';
const laufendeRetries = new Set<number>();

function revisionZuDto(rev: {
  id: number;
  revisionNummer: number;
  status: string;
  pdfStatus: string;
  pdfFehler: string | null;
  pdfTechFehler: string | null;
  anrede: string;
  name: string;
  strasse: string;
  ort: string;
  rechnungsdatum: Date;
  title: string;
  positionen: string;
  ust: number;
  einzug: boolean;
  email: string;
  mailAnrede: string;
  dateiPfad: string | null;
  erstelltAm: Date;
}) {
  return {
    id: rev.id,
    revisionNummer: rev.revisionNummer,
    status: rev.status as 'AKTIV' | 'ERSETZT',
    pdfStatus: rev.pdfStatus as PdfStatus,
    pdfFehler: rev.pdfFehler,
    pdfTechFehler: rev.pdfTechFehler,
    eingaben: {
      anrede: rev.anrede,
      name: rev.name,
      strasse: rev.strasse,
      ort: rev.ort,
      rechnungsdatum: rev.rechnungsdatum.toISOString(),
      title: rev.title,
      positionen: JSON.parse(rev.positionen) as Rechnungsposition[],
      ust: rev.ust,
      einzug: rev.einzug,
      email: rev.email,
      mailAnrede: rev.mailAnrede,
    } satisfies RechnungEingaben,
    dateiPfad: rev.dateiPfad,
    erstelltAm: rev.erstelltAm.toISOString(),
  };
}

function validierePflichtfelder(eingaben: RechnungEingaben): string | null {
  if (!eingaben.name.trim()) return 'Name ist erforderlich';
  if (!eingaben.strasse.trim()) return 'Straße ist erforderlich';
  if (!eingaben.ort.trim()) return 'Ort ist erforderlich';
  if (!eingaben.title.trim()) return 'Titel ist erforderlich';
  if (!eingaben.positionen || eingaben.positionen.length === 0) {
    return 'Mindestens eine Position ist erforderlich';
  }
  for (let i = 0; i < eingaben.positionen.length; i++) {
    if (!eingaben.positionen[i].text.trim()) {
      return `Position ${i + 1}: Text ist erforderlich`;
    }
    if (eingaben.positionen[i].priceInCents <= 0) {
      return `Position ${i + 1}: Preis muss größer als 0 sein`;
    }
  }
  if (eingaben.ust !== 7 && eingaben.ust !== 19) {
    return 'USt muss 7% oder 19% sein';
  }
  return null;
}

function berechneBrutto(positionenJson: string, ust: number): number {
  const positionen: Rechnungsposition[] = JSON.parse(positionenJson);
  const netto = positionen.reduce((sum, p) => sum + p.priceInCents, 0);
  const steuer = Math.round(netto * (ust / 100));
  return netto + steuer;
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
  await prisma.rechnungRevision.update({
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
    const dateiPfad = await generiereRechnungPdf(prisma, revisionId);
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

    const failed = await prisma.rechnungRevision.findUniqueOrThrow({
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

// GET /api/rechnung/empfaenger
rechnungRouter.get('/empfaenger', async (req, res) => {
  const search = String(req.query.search ?? '');
  const empfaenger = await prisma.rechnungsempfaenger.findMany({
    where: search ? { name: { contains: search } } : {},
    orderBy: { name: 'asc' },
    take: 20,
  });
  res.json(empfaenger);
});

// GET /api/rechnung
rechnungRouter.get('/', async (req, res) => {
  const search = String(req.query.search ?? '');
  const vonDatum = req.query.vonDatum ? new Date(String(req.query.vonDatum)) : undefined;
  const bisDatum = req.query.bisDatum ? new Date(String(req.query.bisDatum)) : undefined;
  const mitStorniert = req.query.mitStorniert === 'true';

  const rechnungen = await prisma.rechnung.findMany({
    where: {
      ...(mitStorniert ? {} : { status: 'AKTIV' }),
      ...(vonDatum || bisDatum ? { rechnungsdatum: { gte: vonDatum, lte: bisDatum } } : {}),
      ...(search
        ? {
            OR: [
              { nummer: { contains: search } },
              { empfaenger: { name: { contains: search } } },
            ],
          }
        : {}),
    },
    include: {
      empfaenger: true,
      revisionen: {
        where: { status: 'AKTIV' },
        orderBy: { revisionNummer: 'desc' },
        take: 1,
      },
    },
    orderBy: { rechnungsdatum: 'desc' },
  });

  const list: RechnungListItem[] = rechnungen.map((r) => ({
    id: r.id,
    nummer: r.nummer,
    status: r.status as 'AKTIV' | 'STORNIERT',
    empfaengerName: r.empfaenger.name,
    betragCents: r.revisionen[0]
      ? berechneBrutto(r.revisionen[0].positionen, r.revisionen[0].ust)
      : 0,
    rechnungsdatum: r.rechnungsdatum.toISOString(),
    createdAt: r.createdAt.toISOString(),
    aktiveRevisionNummer: r.revisionen[0]?.revisionNummer ?? null,
  }));

  res.json(list);
});

// GET /api/rechnung/revision/:revisionId/download
// NOTE: This route MUST come before /:id to avoid matching "download" as an id
rechnungRouter.get('/revision/:revisionId/download', async (req, res) => {
  const id = parseInt(req.params.revisionId);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Ungültige Revisions-ID' });
    return;
  }

  const revision = await prisma.rechnungRevision.findUnique({
    where: { id },
    include: { rechnung: true },
  });

  if (!revision) {
    res.status(404).json({ error: 'Revision nicht gefunden' });
    return;
  }

  if (!revision.dateiPfad || revision.pdfStatus !== 'OK') {
    res.status(404).json({ error: 'Datei nicht vorhanden' });
    return;
  }

  const safeNum = revision.rechnung.nummer.replace(/\s*\/\s*/g, '-');
  const dateiName = `${safeNum}-R${revision.revisionNummer}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${dateiName}"`);
  fs.createReadStream(toAbsolutePath(revision.dateiPfad)).pipe(res);
});

// POST /api/rechnung/revision/:revisionId/retry-pdf
rechnungRouter.post('/revision/:revisionId/retry-pdf', async (req, res) => {
  const id = parseInt(req.params.revisionId);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Ungültige Revisions-ID' });
    return;
  }

  const revision = await prisma.rechnungRevision.findUnique({ where: { id } });
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

// GET /api/rechnung/:id
rechnungRouter.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Ungültige ID' });
    return;
  }

  const rechnung = await prisma.rechnung.findUnique({
    where: { id },
    include: {
      empfaenger: true,
      revisionen: { orderBy: { revisionNummer: 'desc' } },
    },
  });

  if (!rechnung) {
    res.status(404).json({ error: 'Rechnung nicht gefunden' });
    return;
  }

  const aktiveRevision = rechnung.revisionen.find((r) => r.status === 'AKTIV');

  res.json({
    id: rechnung.id,
    nummer: rechnung.nummer,
    status: rechnung.status,
    empfaenger: rechnung.empfaenger,
    rechnungsdatum: rechnung.rechnungsdatum.toISOString(),
    createdAt: rechnung.createdAt.toISOString(),
    aktiveRevision: aktiveRevision ? revisionZuDto(aktiveRevision) : null,
    revisionen: rechnung.revisionen.map(revisionZuDto),
  });
});

// POST /api/rechnung
rechnungRouter.post('/', async (req, res) => {
  const body = req.body as {
    empfaengerId?: number;
    empfaengerDaten?: {
      name: string;
      strasse: string;
      ort: string;
      email?: string;
      anrede?: string;
    };
    eingaben: RechnungEingaben;
  };

  const validierungsfehler = validierePflichtfelder(body.eingaben);
  if (validierungsfehler) {
    res.status(400).json({ error: validierungsfehler });
    return;
  }

  const rechnungsVorlage = await prisma.vorlage.findFirst({
    where: { typ: 'RECHNUNG', aktiv: true },
  });
  if (!rechnungsVorlage) {
    res.status(400).json({ error: 'Keine aktive Rechnungsvorlage vorhanden' });
    return;
  }

  const { nummer, jahr, laufendeNummer } = await generiereRechnungsNummer(prisma);
  const rechnungsdatum = body.eingaben.rechnungsdatum
    ? new Date(body.eingaben.rechnungsdatum)
    : new Date();

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    let empfaengerUpdated = false;
    let empfaengerId = body.empfaengerId;

    if (empfaengerId) {
      const bestehender = await tx.rechnungsempfaenger.findUnique({ where: { id: empfaengerId } });
      if (!bestehender) {
        throw new Error('Empfänger nicht gefunden');
      }

      await tx.rechnungsempfaenger.update({
        where: { id: empfaengerId },
        data: {
          name: body.eingaben.name,
          strasse: body.eingaben.strasse,
          ort: body.eingaben.ort,
          email: body.eingaben.email || null,
          anrede: body.eingaben.anrede || null,
        },
      });
      empfaengerUpdated = true;
    } else {
      if (!body.empfaengerDaten) {
        throw new Error('Kein Empfänger angegeben');
      }

      const neuer = await tx.rechnungsempfaenger.create({
        data: {
          name: body.empfaengerDaten.name,
          strasse: body.empfaengerDaten.strasse,
          ort: body.empfaengerDaten.ort,
          email: body.empfaengerDaten.email || null,
          anrede: body.empfaengerDaten.anrede || null,
        },
      });
      empfaengerId = neuer.id;
      empfaengerUpdated = true;
    }

    const rechnung = await tx.rechnung.create({
      data: {
        nummer,
        jahr,
        laufendeNummer,
        empfaengerId: empfaengerId!,
        rechnungsdatum,
      },
    });

    const revision = await tx.rechnungRevision.create({
      data: {
        rechnungId: rechnung.id,
        revisionNummer: 1,
        anrede: body.eingaben.anrede,
        name: body.eingaben.name,
        strasse: body.eingaben.strasse,
        ort: body.eingaben.ort,
        rechnungsdatum,
        title: body.eingaben.title,
        positionen: JSON.stringify(body.eingaben.positionen),
        ust: body.eingaben.ust,
        einzug: body.eingaben.einzug,
        email: body.eingaben.email,
        mailAnrede: body.eingaben.mailAnrede,
        vorlageId: rechnungsVorlage.id,
        pdfStatus: 'PENDING',
      },
    });

    const empfaenger = await tx.rechnungsempfaenger.findUniqueOrThrow({
      where: { id: empfaengerId! },
    });

    return { rechnung, revision, empfaenger, empfaengerUpdated };
  });

  const pdf = await versuchePdfErzeugung(result.revision.id);

  res.status(201).json({
    rechnungId: result.rechnung.id,
    revisionId: result.revision.id,
    empfaenger: result.empfaenger,
    empfaengerUpdated: result.empfaengerUpdated,
    pdfStatus: pdf.pdfStatus,
    pdfFehler: pdf.pdfFehler,
    pdfTechFehler: pdf.pdfTechFehler,
    dateiPfad: pdf.dateiPfad,
  });
});

// POST /api/rechnung/:id/revision
rechnungRouter.post('/:id/revision', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Ungültige ID' });
    return;
  }

  const rechnung = await prisma.rechnung.findUnique({ where: { id } });
  if (!rechnung) {
    res.status(404).json({ error: 'Rechnung nicht gefunden' });
    return;
  }
  if (rechnung.status === 'STORNIERT') {
    res.status(400).json({ error: 'Stornierte Rechnungen können nicht revidiert werden' });
    return;
  }

  const body = req.body as { eingaben: RechnungEingaben };

  const validierungsfehler = validierePflichtfelder(body.eingaben);
  if (validierungsfehler) {
    res.status(400).json({ error: validierungsfehler });
    return;
  }

  const rechnungsVorlage = await prisma.vorlage.findFirst({
    where: { typ: 'RECHNUNG', aktiv: true },
  });
  if (!rechnungsVorlage) {
    res.status(400).json({ error: 'Keine aktive Rechnungsvorlage vorhanden' });
    return;
  }

  const letzteRevision = await prisma.rechnungRevision.findFirst({
    where: { rechnungId: id },
    orderBy: { revisionNummer: 'desc' },
  });
  const neueRevisionNummer = (letzteRevision?.revisionNummer ?? 0) + 1;
  const rechnungsdatum = body.eingaben.rechnungsdatum
    ? new Date(body.eingaben.rechnungsdatum)
    : new Date();

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.rechnungRevision.updateMany({
      where: { rechnungId: id, status: 'AKTIV' },
      data: { status: 'ERSETZT' },
    });
    await tx.rechnung.update({ where: { id }, data: { rechnungsdatum } });

    await tx.rechnungsempfaenger.update({
      where: { id: rechnung.empfaengerId },
      data: {
        name: body.eingaben.name,
        strasse: body.eingaben.strasse,
        ort: body.eingaben.ort,
        email: body.eingaben.email || null,
        anrede: body.eingaben.anrede || null,
      },
    });

    const neueRevision = await tx.rechnungRevision.create({
      data: {
        rechnungId: id,
        revisionNummer: neueRevisionNummer,
        anrede: body.eingaben.anrede,
        name: body.eingaben.name,
        strasse: body.eingaben.strasse,
        ort: body.eingaben.ort,
        rechnungsdatum,
        title: body.eingaben.title,
        positionen: JSON.stringify(body.eingaben.positionen),
        ust: body.eingaben.ust,
        einzug: body.eingaben.einzug,
        email: body.eingaben.email,
        mailAnrede: body.eingaben.mailAnrede,
        vorlageId: rechnungsVorlage.id,
        pdfStatus: 'PENDING',
      },
    });

    const empfaenger = await tx.rechnungsempfaenger.findUniqueOrThrow({
      where: { id: rechnung.empfaengerId },
    });

    return { neueRevision, empfaenger, empfaengerUpdated: true };
  });

  const pdf = await versuchePdfErzeugung(result.neueRevision.id);

  res.status(201).json({
    rechnungId: id,
    revisionId: result.neueRevision.id,
    empfaenger: result.empfaenger,
    empfaengerUpdated: result.empfaengerUpdated,
    pdfStatus: pdf.pdfStatus,
    pdfFehler: pdf.pdfFehler,
    pdfTechFehler: pdf.pdfTechFehler,
    dateiPfad: pdf.dateiPfad,
  });
});

// PATCH /api/rechnung/:id/stornieren
rechnungRouter.patch('/:id/stornieren', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Ungültige ID' });
    return;
  }

  const rechnung = await prisma.rechnung.findUnique({ where: { id } });
  if (!rechnung) {
    res.status(404).json({ error: 'Rechnung nicht gefunden' });
    return;
  }

  await prisma.rechnung.update({
    where: { id },
    data: { status: 'STORNIERT' },
  });

  res.json({ message: 'Rechnung storniert' });
});

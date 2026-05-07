import { Router } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import type { VorlageTyp } from 'shared';
import { VORLAGEN_DIR } from '../config';
import { prisma } from '../prismaClient';
import {
  generierePreviewVorlage,
  getDummyDaten,
  type VorschauEinstellungen,
} from '../services/pdfGenerierung';
import { validiereVorlage } from '../services/vorlagenValidierung';

export const vorlagenRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const ERLAUBTE_ENDUNGEN: Record<VorlageTyp, string> = {
  ANSCHREIBEN: '.docx',
  QUITTUNG: '.pdf',
};

const GUELTIGE_TYPEN: VorlageTyp[] = ['ANSCHREIBEN', 'QUITTUNG'];

type VorlagePreviewDelegate = {
  findUnique: (args: {
    where: { typ: VorlageTyp };
  }) => Promise<{ dateiPfad: string | null } | null>;
  upsert: (args: {
    where: { typ: VorlageTyp };
    update: { dateiPfad: string; erstelltAm: Date };
    create: { typ: VorlageTyp; dateiPfad: string };
  }) => Promise<unknown>;
};

function serialisiereTechnischenFehler(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || `${error.name}: ${error.message}`;
  }
  return String(error);
}

function istGueltigerTyp(typ: string): typ is VorlageTyp {
  return GUELTIGE_TYPEN.includes(typ as VorlageTyp);
}

function holeVorlagePreviewDelegate(): VorlagePreviewDelegate | null {
  const delegate = (prisma as unknown as Record<string, unknown>).vorlagePreview;
  if (!delegate) {
    return null;
  }
  return delegate as VorlagePreviewDelegate;
}

async function ladeVorschauEinstellungen(): Promise<VorschauEinstellungen> {
  const rows = await prisma.systemEinstellung.findMany({
    where: {
      key: {
        in: [
          'kassenwart',
          'gemeinnuetzigerZweck',
          'finanzamtName',
          'steuernummer',
          'freistellungsdatum',
          'veranlagungszeitraum',
        ],
      },
    },
  });

  const values = new Map(rows.map((row) => [row.key, row.value]));

  return {
    kassenwart: values.get('kassenwart') ?? '',
    gemeinnuetzigerZweck: values.get('gemeinnuetzigerZweck') ?? '',
    finanzamtName: values.get('finanzamtName') ?? '',
    steuernummer: values.get('steuernummer') ?? '',
    freistellungsdatum: values.get('freistellungsdatum') ?? '',
    veranlagungszeitraum: values.get('veranlagungszeitraum') ?? '',
  };
}

vorlagenRouter.get('/', async (_req, res) => {
  const vorlagen = await prisma.vorlage.findMany({
    where: { aktiv: true },
    select: {
      id: true,
      typ: true,
      version: true,
      dateiName: true,
      aktiv: true,
      hochgeladenAm: true,
    },
    orderBy: { typ: 'asc' },
  });
  res.json(vorlagen);
});

vorlagenRouter.get('/:typ/download', async (req, res) => {
  const typ = String(req.params.typ).toUpperCase() as VorlageTyp;
  if (!istGueltigerTyp(typ)) {
    res.status(400).json({ error: 'Ungültiger Vorlagentyp' });
    return;
  }

  const vorlage = await prisma.vorlage.findFirst({
    where: { typ, aktiv: true },
  });
  if (!vorlage) {
    res.status(404).json({ error: 'Keine aktive Vorlage gefunden' });
    return;
  }

  res.download(vorlage.dateiPfad, vorlage.dateiName);
});

vorlagenRouter.get('/preview/:typ', async (req, res) => {
  const typ = String(req.params.typ).toUpperCase() as VorlageTyp;
  if (!istGueltigerTyp(typ)) {
    res.status(400).json({ error: 'Ungültiger Vorlagentyp' });
    return;
  }

  const standardPreviewPath = path.join(
    VORLAGEN_DIR,
    'preview',
    `${typ.toLowerCase()}_preview.pdf`,
  );
  let previewPfad = standardPreviewPath;

  const vorlagePreview = holeVorlagePreviewDelegate();
  if (vorlagePreview) {
    const preview = await vorlagePreview.findUnique({
      where: { typ },
    });
    if (preview?.dateiPfad) {
      previewPfad = preview.dateiPfad;
    }
  }

  try {
    await fs.promises.access(previewPfad, fs.constants.R_OK);
  } catch {
    res.status(404).json({ error: 'Keine Vorschau vorhanden' });
    return;
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${typ.toLowerCase()}_preview.pdf"`);
  fs.createReadStream(previewPfad).pipe(res);
});

vorlagenRouter.post('/:typ/preview', upload.single('vorlage'), async (req, res) => {
  const typ = String(req.params.typ).toUpperCase() as VorlageTyp;
  if (!istGueltigerTyp(typ)) {
    res.status(400).json({ error: 'Ungültiger Vorlagentyp' });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: 'Keine Datei hochgeladen' });
    return;
  }

  const erlaubteEndung = ERLAUBTE_ENDUNGEN[typ];
  if (!req.file.originalname.toLowerCase().endsWith(erlaubteEndung)) {
    res.status(400).json({
      error: `Nur ${erlaubteEndung}-Dateien erlaubt für Vorlage vom Typ ${typ}`,
    });
    return;
  }

  const fehler = await validiereVorlage(typ, req.file.buffer);
  if (fehler) {
    res.status(422).json({
      error: 'Ungültige Vorlage',
      fehlendePflichtfelder: fehler.fehlendePflichtfelder,
    });
    return;
  }

  const einstellungen = await ladeVorschauEinstellungen();
  const daten = getDummyDaten(typ, einstellungen);

  try {
    const previewBuffer = await generierePreviewVorlage(typ, req.file.buffer, daten);

    const previewDir = path.join(VORLAGEN_DIR, 'preview');
    await fs.promises.mkdir(previewDir, { recursive: true });
    const previewPath = path.join(previewDir, `${typ.toLowerCase()}_preview.pdf`);
    await fs.promises.writeFile(previewPath, previewBuffer);

    const vorlagePreview = holeVorlagePreviewDelegate();
    if (vorlagePreview) {
      try {
        await vorlagePreview.upsert({
          where: { typ },
          update: { dateiPfad: previewPath, erstelltAm: new Date() },
          create: { typ, dateiPfad: previewPath },
        });
        console.info(`[vorlagen] Preview persisted in DB for typ=${typ} path=${previewPath}`);
      } catch (persistError) {
        console.warn(
          `[vorlagen] Preview DB persistence failed for typ=${typ}; file fallback remains active`,
          persistError,
        );
      }
    } else {
      console.warn(
        `[vorlagen] Prisma delegate 'vorlagePreview' unavailable; using file-only preview fallback for typ=${typ}`,
      );
    }

    res.json({
      success: true,
      data: previewBuffer.toString('base64'),
      typ,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Vorschau konnte nicht generiert werden',
      technicalError: serialisiereTechnischenFehler(error),
    });
  }
});

vorlagenRouter.post('/:typ/upload', upload.single('vorlage'), async (req, res) => {
  const typ = String(req.params.typ).toUpperCase() as VorlageTyp;
  if (!istGueltigerTyp(typ)) {
    res.status(400).json({ error: 'Ungültiger Vorlagentyp' });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: 'Keine Datei hochgeladen' });
    return;
  }

  const erlaubteEndung = ERLAUBTE_ENDUNGEN[typ];
  if (!req.file.originalname.toLowerCase().endsWith(erlaubteEndung)) {
    res.status(400).json({
      error: `Nur ${erlaubteEndung}-Dateien erlaubt für Vorlage vom Typ ${typ}`,
    });
    return;
  }

  const fehler = await validiereVorlage(typ, req.file.buffer);
  if (fehler) {
    res.status(422).json({
      error: `Vorlage ungültig: Pflichtfelder fehlen`,
      fehlendePflichtfelder: fehler.fehlendePflichtfelder,
    });
    return;
  }

  const aktuelleVorlage = await prisma.vorlage.findFirst({
    where: { typ, aktiv: true },
  });
  const neueVersion = aktuelleVorlage ? aktuelleVorlage.version + 1 : 1;

  const dateiName = req.file.originalname;
  const dateiPfad = path.join(VORLAGEN_DIR, `${typ.toLowerCase()}_v${neueVersion}_${dateiName}`);

  await fs.promises.mkdir(VORLAGEN_DIR, { recursive: true });
  await fs.promises.writeFile(dateiPfad, req.file.buffer);

  await prisma.$transaction([
    prisma.vorlage.updateMany({
      where: { typ, aktiv: true },
      data: { aktiv: false },
    }),
    prisma.vorlage.create({
      data: {
        typ,
        version: neueVersion,
        dateiName,
        dateiPfad,
        aktiv: true,
      },
    }),
  ]);

  const neueVorlage = await prisma.vorlage.findFirst({
    where: { typ, aktiv: true },
  });

  res.status(201).json(neueVorlage);
});

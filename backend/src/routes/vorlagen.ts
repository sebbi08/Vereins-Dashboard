import { Router } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import type { VorlageTyp } from 'shared';
import { VORLAGEN_DIR, toAbsolutePath, toRelativePath } from '../config.js';
import { prisma } from '../prismaClient.js';
import {
  generierePreviewVorlage,
  getDummyDaten,
  type VorschauEinstellungen,
} from '../services/pdfGenerierung.js';
import { validiereVorlage } from '../services/vorlagenValidierung.js';

export const vorlagenRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const ERLAUBTE_ENDUNGEN: Record<VorlageTyp, string> = {
  ANSCHREIBEN: '.docx',
  QUITTUNG: '.pdf',
  RECHNUNG: '.docx',
};

const GUELTIGE_TYPEN: VorlageTyp[] = ['ANSCHREIBEN', 'QUITTUNG', 'RECHNUNG'];

function istGueltigerTyp(typ: string): typ is VorlageTyp {
  return GUELTIGE_TYPEN.includes(typ as VorlageTyp);
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

  res.download(toAbsolutePath(vorlage.dateiPfad), vorlage.dateiName);
});

vorlagenRouter.get('/preview/:typ', async (req, res) => {
  const typ = String(req.params.typ).toUpperCase() as VorlageTyp;
  if (!istGueltigerTyp(typ)) {
    res.status(400).json({ error: 'Ungültiger Vorlagentyp' });
    return;
  }

  const vorlage = await prisma.vorlage.findFirst({
    where: { typ, aktiv: true },
  });
  if (!vorlage) {
    res.status(404).json({ error: 'Keine aktive Vorlage vorhanden' });
    return;
  }

  try {
    const einstellungen = await ladeVorschauEinstellungen();
    const daten = getDummyDaten(typ, einstellungen);
    const vorlageBuffer = await fs.promises.readFile(toAbsolutePath(vorlage.dateiPfad));
    const previewBuffer = await generierePreviewVorlage(typ, vorlageBuffer, daten);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${typ.toLowerCase()}_preview.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(previewBuffer);
  } catch (error) {
    console.error(`[vorlagen] Live preview generation failed for typ=${typ}`, error);
    res.status(500).json({ error: 'Vorschau konnte nicht generiert werden' });
  }
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

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      success: true,
      data: previewBuffer.toString('base64'),
      typ,
    });
  } catch (error) {
    console.error(`[vorlagen] Upload preview generation failed for typ=${typ}`, error);
    res.status(500).json({ error: 'Vorschau konnte nicht generiert werden' });
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
        dateiPfad: toRelativePath(dateiPfad),
        aktiv: true,
      },
    }),
  ]);

  const neueVorlage = await prisma.vorlage.findFirst({
    where: { typ, aktiv: true },
  });

  res.status(201).json(neueVorlage);
});

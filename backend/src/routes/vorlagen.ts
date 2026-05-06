import { Router } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import type { VorlageTyp } from 'shared';
import { VORLAGEN_DIR } from '../config';
import { prisma } from '../prismaClient';
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
  if (!['ANSCHREIBEN', 'QUITTUNG'].includes(typ)) {
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

vorlagenRouter.post('/:typ/upload', upload.single('vorlage'), async (req, res) => {
  const typ = String(req.params.typ).toUpperCase() as VorlageTyp;
  if (!['ANSCHREIBEN', 'QUITTUNG'].includes(typ)) {
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

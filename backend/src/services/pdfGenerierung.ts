import type { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import Docxtemplater from 'docxtemplater';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import PizZip from 'pizzip';
import { promisify } from 'util';
import { QUITTUNGEN_DIR } from '../config';
import { betragInWorten, formatBetrag, formatDatum } from './betragInWorten';

const execAsync = promisify(exec);

interface AnschreibenDaten {
  AdressAnrede: string;
  adressAnrede: string;
  BriefAnrede: string;
  briefAnrede: string;
  Anrede: string;
  BriefAnreden: { Anrede: string }[];
  Name: string;
  Strasse: string;
  Ort: string;
  Heute: string;
  Betrag: string;
  TagDerZuwendung: string;
  Kassenwart: string;
}

async function fuelleAnschreibenVorlage(
  vorlageBuffer: Buffer,
  daten: AnschreibenDaten,
): Promise<Buffer> {
  const zip = new PizZip(vorlageBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });
  doc.render(daten);
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
}

async function docxZuPdf(docxBuffer: Buffer): Promise<Buffer> {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'lo-'));
  const docxPath = path.join(tmpDir, 'input.docx');
  const pdfPath = path.join(tmpDir, 'input.pdf');

  try {
    await fs.promises.writeFile(docxPath, docxBuffer);
    await execAsync(`libreoffice --headless --convert-to pdf --outdir "${tmpDir}" "${docxPath}"`);
    return await fs.promises.readFile(pdfPath);
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
}

async function fuellePdfFormular(
  vorlageBuffer: Buffer,
  daten: {
    name: string;
    betrag: string;
    betragInBuchstaben: string;
    tagDerZuwendung: string;
    zweck: string;
    steuerNr: string;
    steuerNrDatum: string;
    veranlagungsZeitraum: string;
    finanzamtName: string;
  },
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(vorlageBuffer);
  const form = pdfDoc.getForm();

  const leseFelderSicher = () => {
    try {
      return form.getFields();
    } catch {
      return [];
    }
  };

  const setTextField = (name: string, value: string) => {
    try {
      form.getTextField(name).setText(value);
    } catch {
      // Feld existiert nicht in dieser Version — ignorieren
    }
  };

  setTextField('Name', daten.name);
  setTextField('Betrag', daten.betrag);
  setTextField('BetragInBuchstaben', daten.betragInBuchstaben);
  setTextField('TagDerZuwendung', daten.tagDerZuwendung);
  setTextField('Zweck', daten.zweck);
  setTextField('Steuer Nr', daten.steuerNr);
  setTextField('SteuerNrDatum', daten.steuerNrDatum);
  setTextField('VeranlagungsZeitraum', daten.veranlagungsZeitraum);
  setTextField('NameFinanzamt', daten.finanzamtName);
  setTextField('Finanzamt', daten.finanzamtName);

  try {
    form.flatten();
  } catch {
    // Manche PDF-Vorlagen enthalten inkonsistente AcroForm-Strukturen,
    // bei denen pdf-lib beim Flattening fehlschlägt. In dem Fall behalten
    // wir die ausgefüllten Felder und setzen sie nach Möglichkeit read-only.
    for (const feld of leseFelderSicher()) {
      try {
        feld.enableReadOnly();
      } catch {
        // Nicht jedes Feld lässt sich in jeder Vorlage mutieren.
      }
    }
  }

  try {
    return Buffer.from(await pdfDoc.save());
  } catch {
    // Einige Vorlagen haben defekte AcroForm-Einträge. Dann scheitert pdf-lib
    // beim automatischen Aktualisieren der Appearance-Streams. In dem Fall
    // speichern wir ohne dieses Update, damit die Datei trotzdem erzeugt wird.
    return Buffer.from(
      await pdfDoc.save({
        updateFieldAppearances: false,
      }),
    );
  }
}

async function verbindePdfs(pdfs: Buffer[]): Promise<Buffer> {
  const merged = await PDFDocument.create();
  for (const pdfBuffer of pdfs) {
    const doc = await PDFDocument.load(pdfBuffer);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }
  return Buffer.from(await merged.save());
}

/** Wandelt ein ISO-Datum (YYYY-MM-DD) ins deutsche Format (DD.MM.YYYY) um.
 *  Gibt den Eingabewert unverändert zurück, falls er kein ISO-Datum ist. */
function formatiereDatum(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  }
  return iso;
}

export async function generiereQuittungPdf(
  prisma: PrismaClient,
  revisionId: number,
): Promise<string> {
  const revision = await prisma.spendenQuittungRevision.findUniqueOrThrow({
    where: { id: revisionId },
    include: {
      quittung: true,
      anschreibenVorlage: true,
      quittungsVorlage: true,
    },
  });

  const betragFormatiert = formatBetrag(revision.spendenbetragCents);
  const betragWorte = betragInWorten(revision.spendenbetragCents);
  const spendendatumFormatiert = formatDatum(revision.spendendatum);

  const pdfs: Buffer[] = [];

  if (revision.mitAnschreiben && revision.anschreibenVorlage) {
    const vorlageBuffer = await fs.promises.readFile(revision.anschreibenVorlage.dateiPfad);
    const revisionMitAnrede = revision as typeof revision & {
      adressAnrede?: string | null;
      briefAnrede?: string | null;
    };
    const adressAnrede = revisionMitAnrede.adressAnrede ?? '';
    const briefAnrede = revisionMitAnrede.briefAnrede ?? '';
    const filledDocx = await fuelleAnschreibenVorlage(vorlageBuffer, {
      AdressAnrede: adressAnrede,
      adressAnrede,
      BriefAnrede: briefAnrede,
      briefAnrede,
      Anrede: adressAnrede,
      BriefAnreden: [{ Anrede: briefAnrede }],
      Name: revision.name,
      Strasse: revision.strasse,
      Ort: revision.ort,
      Heute: formatDatum(new Date()),
      Betrag: betragFormatiert,
      TagDerZuwendung: spendendatumFormatiert,
      Kassenwart: revision.kassenwart,
    });
    const anschreibenPdf = await docxZuPdf(filledDocx);
    pdfs.push(anschreibenPdf);
  }

  const quittungsVorlageBuffer = await fs.promises.readFile(revision.quittungsVorlage.dateiPfad);
  const quittungPdf = await fuellePdfFormular(quittungsVorlageBuffer, {
    name: `${revision.name}, ${revision.strasse}, ${revision.ort}`,
    betrag: betragFormatiert,
    betragInBuchstaben: betragWorte,
    tagDerZuwendung: spendendatumFormatiert,
    zweck: revision.gemeinnuetzigerZweck,
    steuerNr: revision.steuernummer,
    steuerNrDatum: formatiereDatum(revision.freistellungsdatum),
    veranlagungsZeitraum: revision.veranlagungszeitraum,
    finanzamtName: revision.finanzamtName,
  });
  pdfs.push(quittungPdf);

  const finalPdf = pdfs.length > 1 ? await verbindePdfs(pdfs) : pdfs[0];

  const outputDir = path.join(
    QUITTUNGEN_DIR,
    String(revision.quittungId),
    `r${revision.revisionNummer}`,
  );
  await fs.promises.mkdir(outputDir, { recursive: true });

  const dateiName = `${revision.quittung.nummer}-R${revision.revisionNummer}.pdf`;
  const outputPath = path.join(outputDir, dateiName);
  await fs.promises.writeFile(outputPath, finalPdf);

  return outputPath;
}

import { exec } from 'child_process';
import Docxtemplater from 'docxtemplater';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PDFDocument, RotationTypes, StandardFonts } from 'pdf-lib';
import PizZip from 'pizzip';
import type { VorlageTyp } from 'shared';
import { promisify } from 'util';
import type { PrismaClient } from '../../prisma/generated/client.js';
import { QUITTUNGEN_DIR, RECHNUNGEN_DIR, toAbsolutePath, toRelativePath } from '../config.js';
import { betragInWorten, formatBetrag, formatDatum } from './betragInWorten.js';

const execAsync = promisify(exec);

export interface AnschreibenDaten {
  BriefAnrede: string;
  Anrede: string;
  Name: string;
  Strasse: string;
  Ort: string;
  Heute: string;
  Betrag: string;
  TagDerZuwendung: string;
  Kassenwart: string;
}

export interface PdfFormularDaten {
  name: string;
  betrag: string;
  betragInBuchstaben: string;
  tagDerZuwendung: string;
  zweck: string;
  steuerNr: string;
  steuerNrDatum: string;
  veranlagungsZeitraum: string;
  finanzamtName: string;
  ortDatumUnterschrift: string;
  quittungsNummer?: string;
}

export interface VorschauEinstellungen {
  kassenwart: string;
  gemeinnuetzigerZweck: string;
  finanzamtName: string;
  steuernummer: string;
  freistellungsdatum: string;
  veranlagungszeitraum: string;
}

export interface RechnungDaten {
  Anrede: string;
  Name: string;
  Strasse: string;
  Ort: string;
  Heute: string;
  Title: string;
  ReNr: string;
  Netto: string;
  Steuer: string;
  Brutto: string;
  ust: number;
  MailAnrede: string;
  PaymentDetails: string;
  TableWithServices: string;
}

function getDocxTablePositionen(positionen: Array<{ text: string; priceInCents: number }>): string {
  let tableItems = '';
  positionen.forEach((_item, index) => {
    tableItems += `
        <w:tr>
            <w:tc>
                <w:tcPr>
                    <w:tcW w:w="6912" w:type="dxa"/>
                </w:tcPr>
                <w:p>
                    <w:r>
                        <w:t>{text${index}}</w:t>
                    </w:r>
                </w:p>
            </w:tc>
            <w:tc>
                <w:tcPr>
                    <w:tcW w:w="1728" w:type="dxa"/>
                </w:tcPr>
                <w:p>
                    <w:r>
                        <w:t>{price${index}}€</w:t>
                    </w:r>
                </w:p>
            </w:tc>
        </w:tr>`;
  });

  return `
        <w:tbl>
            <w:tblGrid>
                <w:gridCol w:w="2880"/>
                <w:gridCol w:w="2880"/>
                <w:gridCol w:w="2880"/>
            </w:tblGrid>
            <w:tblPr>
                <w:tblStyle w:val="TableGrid"/>
                <w:tblBorders>
                    <w:top w:val="single" w:sz="1" w:space="0" w:color="000000"/>
                    <w:start w:val="single" w:sz="1" w:space="0" w:color="000000"/>
                    <w:bottom w:val="single" w:sz="1" w:space="0" w:color="000000"/>
                    <w:end w:val="single" w:sz="1" w:space="0" w:color="000000"/>
                    <w:insideH w:val="single" w:sz="1" w:space="0" w:color="000000"/>
                    <w:insideV w:val="single" w:sz="1" w:space="0" w:color="000000"/>
                </w:tblBorders>
            </w:tblPr>
            <w:tr>
                <w:tc>
                    <w:tcPr>
                        <w:tcW w:w="6912" w:type="dxa"/>
                    </w:tcPr>
                    <w:p>
                        <w:r>
                            <w:rPr>
                                <w:b w:val="true"/>
                            </w:rPr>
                            <w:t>Leistung</w:t>
                        </w:r>
                    </w:p>
                </w:tc>
                <w:tc>
                    <w:tcPr>
                        <w:tcW w:w="1728" w:type="dxa"/>
                    </w:tcPr>
                    <w:p>
                        <w:r>
                            <w:rPr>
                                <w:b w:val="true"/>
                            </w:rPr>
                            <w:t>Preis</w:t>
                        </w:r>
                    </w:p>
                </w:tc>
            </w:tr>
            ${tableItems}
        </w:tbl>`;
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

async function fuelleRechnungsVorlage(
  vorlageBuffer: Buffer,
  daten: RechnungDaten,
): Promise<Buffer> {
  const zip = new PizZip(vorlageBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });
  doc.render({
    Anrede: daten.Anrede,
    Name: daten.Name,
    Strasse: daten.Strasse,
    Ort: daten.Ort,
    Heute: daten.Heute,
    Title: daten.Title,
    ReNr: daten.ReNr,
    Netto: daten.Netto,
    Steuer: daten.Steuer,
    Brutto: daten.Brutto,
    ust: daten.ust,
    MailAnrede: daten.MailAnrede,
    PaymentDetails: daten.PaymentDetails,
    TableWithServices: daten.TableWithServices,
    monthlyPay: false,
    MonthlyBruto: '',
  });

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

async function fuellePdfFormular(vorlageBuffer: Buffer, daten: PdfFormularDaten): Promise<Buffer> {
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
  setTextField('Finanzamt', daten.finanzamtName);
  setTextField('OrtDatum', daten.ortDatumUnterschrift);

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

  if (daten.quittungsNummer) {
    const pages = pdfDoc.getPages();
    const firstPage = pages[0];
    if (firstPage) {
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      firstPage.drawText(`${daten.quittungsNummer}`, {
        x: 32,
        y: 20,
        size: 9,
        font,
        rotate: { type: RotationTypes.Degrees, angle: 90 },
      });
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

export function getDummyDaten(
  typ: VorlageTyp,
  einstellungen: VorschauEinstellungen,
): AnschreibenDaten | PdfFormularDaten | RechnungDaten {
  if (typ === 'ANSCHREIBEN') {
    return {
      BriefAnrede: 'Sehr geehrte Damen und Herren',
      Anrede: 'Max Mustermann',
      Name: 'Muserfirma GmbH',
      Strasse: 'Musterstraße 1',
      Ort: '67105 Schifferstadt',
      Heute: formatDatum(new Date()),
      Betrag: '100,00 €',
      TagDerZuwendung: '01.01.2024',
      Kassenwart: einstellungen.kassenwart || 'Kassenwart Max Mustermann',
    };
  }

  if (typ === 'RECHNUNG') {
    return {
      Anrede: '',
      Name: 'Muserfirma GmbH',
      Strasse: 'Musterstraße 1',
      Ort: '67105 Schifferstadt',
      Heute: formatDatum(new Date()),
      Title: 'Miete Musikheim April 2026',
      ReNr: '1 / 2026',
      Netto: '84,03',
      Steuer: '15,97',
      Brutto: '100,00',
      ust: 19,
      MailAnrede: 'Sehr geehrte Damen und Herren',
      PaymentDetails: 'Bitte überweisen Sie den Betrag unter Angabe der Rechnungsnummer an das untenstehende Konto.',
      TableWithServices: getDocxTablePositionen([
        { text: 'Miete Musikheim', priceInCents: 8403 },
      ]),
    } as RechnungDaten;
  }

  return {
    name: 'Max Mustermann, Musterstraße 1, 67105 Schifferstadt',
    betrag: '100,00 €',
    betragInBuchstaben: betragInWorten(10000).replace(/^./, (first) => first.toLowerCase()),
    tagDerZuwendung: '01.01.2024',
    zweck: einstellungen.gemeinnuetzigerZweck,
    steuerNr: einstellungen.steuernummer,
    steuerNrDatum: formatiereDatum(einstellungen.freistellungsdatum),
    veranlagungsZeitraum: einstellungen.veranlagungszeitraum,
    finanzamtName: einstellungen.finanzamtName,
    ortDatumUnterschrift: `Schifferstadt, ${formatDatum(new Date())}`,
    quittungsNummer: '000001',
  };
}

export async function generierePreviewVorlage(
  typ: VorlageTyp,
  vorlageBuffer: Buffer,
  daten: AnschreibenDaten | PdfFormularDaten | RechnungDaten,
): Promise<Buffer> {
  if (typ === 'ANSCHREIBEN') {
    const filledDocx = await fuelleAnschreibenVorlage(vorlageBuffer, daten as AnschreibenDaten);
    return docxZuPdf(filledDocx);
  }
  if (typ === 'RECHNUNG') {
    const filledDocx = await fuelleRechnungsVorlage(vorlageBuffer, daten as RechnungDaten);
    return docxZuPdf(filledDocx);
  }
  return fuellePdfFormular(vorlageBuffer, daten as PdfFormularDaten);
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
    const vorlageBuffer = await fs.promises.readFile(
      toAbsolutePath(revision.anschreibenVorlage.dateiPfad),
    );
    const revisionMitAnrede = revision as typeof revision & {
      adressAnrede?: string | null;
      briefAnrede?: string | null;
    };
    const adressAnrede = revisionMitAnrede.adressAnrede ?? '';
    const briefAnrede = revisionMitAnrede.briefAnrede ?? '';
    const filledDocx = await fuelleAnschreibenVorlage(vorlageBuffer, {
      BriefAnrede: briefAnrede,
      Anrede: adressAnrede,
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

  const quittungsVorlageBuffer = await fs.promises.readFile(
    toAbsolutePath(revision.quittungsVorlage.dateiPfad),
  );
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
    ortDatumUnterschrift: `Schifferstadt, ${formatDatum(new Date())}`,
    quittungsNummer: revision.quittung.nummer,
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

  return toRelativePath(outputPath);
}

export async function generiereRechnungPdf(
  prisma: PrismaClient,
  revisionId: number,
): Promise<string> {
  const revision = await prisma.rechnungRevision.findUniqueOrThrow({
    where: { id: revisionId },
    include: {
      rechnung: true,
      vorlage: true,
    },
  });

  const positionen: Array<{ text: string; priceInCents: number }> = JSON.parse(revision.positionen);
  const netto = positionen.reduce((sum, p) => sum + p.priceInCents, 0);
  const steuer = Math.round(netto * (revision.ust / 100));
  const brutto = netto + steuer;

  const invoiceDateFormatted = revision.rechnungsdatum.toLocaleDateString('de');

  const paymentDetails = revision.einzug
    ? `Der Betrag wird in den nächsten Tagen mit dem Vermerk "${revision.rechnung.nummer}" von Ihrem Konto eingezogen.`
    : 'Bitte Überweisen Sie den Betrag unter Angabe der Rechnungsnummer an das untenstehende Konto.';

  const tableXml = getDocxTablePositionen(positionen);

  const vorlageBuffer = await fs.promises.readFile(toAbsolutePath(revision.vorlage.dateiPfad));

  // Pass 1: Template-level placeholders
  const zip1 = new PizZip(vorlageBuffer);
  const doc1 = new Docxtemplater(zip1, {
    paragraphLoop: true,
    linebreaks: true,
  });
  doc1.render({
    Anrede: revision.anrede,
    Name: revision.name,
    Strasse: revision.strasse,
    Ort: revision.ort,
    Heute: invoiceDateFormatted,
    Title: revision.title,
    ReNr: revision.rechnung.nummer,
    Netto: (netto / 100).toFixed(2),
    Steuer: (steuer / 100).toFixed(2),
    Brutto: (brutto / 100).toFixed(2),
    ust: revision.ust,
    MailAnrede: revision.mailAnrede,
    PaymentDetails: paymentDetails,
    TableWithServices: tableXml,
    monthlyPay: false,
    MonthlyBruto: '',
  });

  // Pass 2: Per-position placeholders
  const doc2 = new Docxtemplater(doc1.getZip(), {
    paragraphLoop: true,
    linebreaks: true,
  });
  const pass2Data: Record<string, string> = {};
  positionen.forEach((pos, idx) => {
    pass2Data[`text${idx}`] = pos.text;
    pass2Data[`price${idx}`] = (pos.priceInCents / 100).toFixed(2);
  });
  doc2.render(pass2Data);

  const docxBuffer = doc2.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
  const pdfBuffer = await docxZuPdf(docxBuffer);

  const outputDir = path.join(
    RECHNUNGEN_DIR,
    String(revision.rechnungId),
    `r${revision.revisionNummer}`,
  );
  await fs.promises.mkdir(outputDir, { recursive: true });

  const safeNum = revision.rechnung.nummer.replace(/\s*\/\s*/g, '-');
  const dateiName = `${safeNum}-R${revision.revisionNummer}.pdf`;
  const outputPath = path.join(outputDir, dateiName);
  await fs.promises.writeFile(outputPath, pdfBuffer);

  return toRelativePath(outputPath);
}

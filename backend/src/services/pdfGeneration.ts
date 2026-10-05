import { exec } from 'child_process';
import Docxtemplater from 'docxtemplater';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PDFDocument, RotationTypes, StandardFonts } from 'pdf-lib';
import PizZip from 'pizzip';
import type { TemplateType } from 'shared';
import { promisify } from 'util';
import type { PrismaClient } from '../../prisma/generated/client.js';
import { INVOICES_DIR, RECEIPTS_DIR, toAbsolutePath, toRelativePath } from '../config.js';
import { amountInWords, formatAmount, formatDate } from './amountInWords.js';

const execAsync = promisify(exec);

export interface CoverLetterData {
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

export interface PdfFormData {
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

export interface PreviewSettings {
  treasurer: string;
  charitablePurpose: string;
  taxOfficeName: string;
  taxNumber: string;
  exemptionDate: string;
  assessmentPeriod: string;
}

export interface InvoiceData {
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

function getDocxTableLineItems(
  lineItems: Array<{ text: string; priceInCents: number }>,
  resolved = false,
): string {
  let tableItems = '';
  lineItems.forEach((item, index) => {
    const textContent = resolved ? item.text : `{text${index}}`;
    const priceContent = resolved ? (item.priceInCents / 100).toFixed(2) : `{price${index}}`;
    tableItems += `
        <w:tr>
            <w:tc>
                <w:tcPr>
                    <w:tcW w:w="6912" w:type="dxa"/>
                </w:tcPr>
                <w:p>
                    <w:r>
                        <w:t>${textContent}</w:t>
                    </w:r>
                </w:p>
            </w:tc>
            <w:tc>
                <w:tcPr>
                    <w:tcW w:w="1728" w:type="dxa"/>
                </w:tcPr>
                <w:p>
                    <w:r>
                        <w:t>${priceContent}€</w:t>
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

async function fillCoverLetterTemplate(
  templateBuffer: Buffer,
  data: CoverLetterData,
): Promise<Buffer> {
  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });
  doc.render(data);
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
}

async function fillInvoiceTemplate(templateBuffer: Buffer, data: InvoiceData): Promise<Buffer> {
  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });
  doc.render({
    Anrede: data.Anrede,
    Name: data.Name,
    Strasse: data.Strasse,
    Ort: data.Ort,
    Heute: data.Heute,
    Title: data.Title,
    ReNr: data.ReNr,
    Netto: data.Netto,
    Steuer: data.Steuer,
    Brutto: data.Brutto,
    ust: data.ust,
    MailAnrede: data.MailAnrede,
    PaymentDetails: data.PaymentDetails,
    TableWithServices: data.TableWithServices,
    monthlyPay: false,
    MonthlyBruto: '',
  });

  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
}

async function docxToPdf(docxBuffer: Buffer): Promise<Buffer> {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'lo-'));
  const docxPath = path.join(tmpDir, 'input.docx');
  const pdfPath = path.join(tmpDir, 'input.pdf');

  try {
    await fs.promises.writeFile(docxPath, docxBuffer);
    await execAsync(
      `libreoffice --headless --norestore --nofirststartwizard --convert-to pdf --outdir "${tmpDir}" "${docxPath}"`,
    );
    return await fs.promises.readFile(pdfPath);
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
}

async function fillPdfForm(templateBuffer: Buffer, data: PdfFormData): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(templateBuffer);
  const form = pdfDoc.getForm();

  const safeReadFields = () => {
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
      // Field doesn't exist in this version — ignore
    }
  };

  setTextField('Name', data.name);
  setTextField('Betrag', data.betrag);
  setTextField('BetragInBuchstaben', data.betragInBuchstaben);
  setTextField('TagDerZuwendung', data.tagDerZuwendung);
  setTextField('Zweck', data.zweck);
  setTextField('Steuer Nr', data.steuerNr);
  setTextField('SteuerNrDatum', data.steuerNrDatum);
  setTextField('VeranlagungsZeitraum', data.veranlagungsZeitraum);
  setTextField('Finanzamt', data.finanzamtName);
  setTextField('OrtDatum', data.ortDatumUnterschrift);

  try {
    form.flatten();
  } catch {
    // Some PDF templates contain inconsistent AcroForm structures
    // where pdf-lib fails during flattening. In that case we keep
    // the filled fields and set them read-only if possible.
    for (const field of safeReadFields()) {
      try {
        field.enableReadOnly();
      } catch {
        // Not every field can be mutated in every template.
      }
    }
  }

  if (data.quittungsNummer) {
    const pages = pdfDoc.getPages();
    const firstPage = pages[0];
    if (firstPage) {
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      firstPage.drawText(`${data.quittungsNummer}`, {
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
    // Some templates have broken AcroForm entries. Then pdf-lib fails
    // during automatic appearance stream updates. In that case
    // save without this update so the file is still generated.
    return Buffer.from(
      await pdfDoc.save({
        updateFieldAppearances: false,
      }),
    );
  }
}

export function getDummyData(
  type: TemplateType,
  settings: PreviewSettings,
): CoverLetterData | PdfFormData | InvoiceData {
  if (type === 'ANSCHREIBEN') {
    return {
      BriefAnrede: 'Sehr geehrte Damen und Herren',
      Anrede: 'Max Mustermann',
      Name: 'Muserfirma GmbH',
      Strasse: 'Musterstraße 1',
      Ort: '67105 Schifferstadt',
      Heute: formatDate(new Date()),
      Betrag: '100,00 €',
      TagDerZuwendung: '01.01.2024',
      Kassenwart: settings.treasurer || 'Kassenwart Max Mustermann',
    };
  }

  if (type === 'RECHNUNG') {
    return {
      Anrede: '',
      Name: 'Muserfirma GmbH',
      Strasse: 'Musterstraße 1',
      Ort: '67105 Schifferstadt',
      Heute: formatDate(new Date()),
      Title: 'Miete Musikheim April 2026',
      ReNr: '1 / 2026',
      Netto: '84,03',
      Steuer: '15,97',
      Brutto: '100,00',
      ust: 19,
      MailAnrede: 'Sehr geehrte Damen und Herren',
      PaymentDetails:
        'Bitte überweisen Sie den Betrag unter Angabe der Rechnungsnummer an das untenstehende Konto.',
      TableWithServices: getDocxTableLineItems(
        [{ text: 'Miete Musikheim', priceInCents: 8403 }],
        true,
      ),
    } as InvoiceData;
  }

  return {
    name: 'Max Mustermann, Musterstraße 1, 67105 Schifferstadt',
    betrag: '100,00 €',
    betragInBuchstaben: amountInWords(10000).replace(/^./, (first) => first.toLowerCase()),
    tagDerZuwendung: '01.01.2024',
    zweck: settings.charitablePurpose,
    steuerNr: settings.taxNumber,
    steuerNrDatum: formatGermanDate(settings.exemptionDate),
    veranlagungsZeitraum: settings.assessmentPeriod,
    finanzamtName: settings.taxOfficeName,
    ortDatumUnterschrift: `Schifferstadt, ${formatDate(new Date())}`,
    quittungsNummer: '000001',
  };
}

export async function generatePreviewTemplate(
  type: TemplateType,
  templateBuffer: Buffer,
  data: CoverLetterData | PdfFormData | InvoiceData,
): Promise<Buffer> {
  if (type === 'ANSCHREIBEN') {
    const filledDocx = await fillCoverLetterTemplate(templateBuffer, data as CoverLetterData);
    return docxToPdf(filledDocx);
  }
  if (type === 'RECHNUNG') {
    const filledDocx = await fillInvoiceTemplate(templateBuffer, data as InvoiceData);
    return docxToPdf(filledDocx);
  }
  return fillPdfForm(templateBuffer, data as PdfFormData);
}

async function mergePdfs(pdfs: Buffer[]): Promise<Buffer> {
  const merged = await PDFDocument.create();
  for (const pdfBuffer of pdfs) {
    const doc = await PDFDocument.load(pdfBuffer);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }
  return Buffer.from(await merged.save());
}

/** Converts an ISO date (YYYY-MM-DD) to German format (DD.MM.YYYY).
 *  Returns the input unchanged if it's not an ISO date. */
function formatGermanDate(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  }
  return iso;
}

export async function generateReceiptPdf(
  prisma: PrismaClient,
  revisionId: number,
): Promise<string> {
  const revision = await prisma.donationReceiptRevision.findUniqueOrThrow({
    where: { id: revisionId },
    include: {
      donationReceipt: true,
      coverLetterTemplate: true,
      receiptTemplate: true,
    },
  });

  const amountFormatted = formatAmount(revision.donationAmountCents);
  const amountWords = amountInWords(revision.donationAmountCents);
  const donationDateFormatted = formatDate(revision.donationDate);

  const pdfs: Buffer[] = [];

  if (revision.withCoverLetter && revision.coverLetterTemplate) {
    const templateBuffer = await fs.promises.readFile(
      toAbsolutePath(revision.coverLetterTemplate.filePath),
    );
    const filledDocx = await fillCoverLetterTemplate(templateBuffer, {
      BriefAnrede: revision.letterSalutation,
      Anrede: revision.addressSalutation ?? '',
      Name: revision.name,
      Strasse: revision.street,
      Ort: revision.city,
      Heute: formatDate(new Date()),
      Betrag: amountFormatted,
      TagDerZuwendung: donationDateFormatted,
      Kassenwart: revision.treasurer,
    });
    const coverLetterPdf = await docxToPdf(filledDocx);
    pdfs.push(coverLetterPdf);
  }

  const receiptTemplateBuffer = await fs.promises.readFile(
    toAbsolutePath(revision.receiptTemplate.filePath),
  );
  const receiptPdf = await fillPdfForm(receiptTemplateBuffer, {
    name: `${revision.name}, ${revision.street}, ${revision.city}`,
    betrag: amountFormatted,
    betragInBuchstaben: amountWords,
    tagDerZuwendung: donationDateFormatted,
    zweck: revision.charitablePurpose,
    steuerNr: revision.taxNumber,
    steuerNrDatum: formatGermanDate(revision.exemptionDate),
    veranlagungsZeitraum: revision.assessmentPeriod,
    finanzamtName: revision.taxOfficeName,
    ortDatumUnterschrift: `Schifferstadt, ${formatDate(new Date())}`,
    quittungsNummer: revision.donationReceipt.number,
  });
  pdfs.push(receiptPdf);

  const finalPdf = pdfs.length > 1 ? await mergePdfs(pdfs) : pdfs[0];

  const outputDir = path.join(
    RECEIPTS_DIR,
    String(revision.donationReceiptId),
    `r${revision.revisionNumber}`,
  );
  await fs.promises.mkdir(outputDir, { recursive: true });

  const fileName = `${revision.donationReceipt.number}-R${revision.revisionNumber}.pdf`;
  const outputPath = path.join(outputDir, fileName);
  await fs.promises.writeFile(outputPath, finalPdf);

  return toRelativePath(outputPath);
}

export interface InvoiceDocxInput {
  salutation: string;
  name: string;
  street: string;
  city: string;
  invoiceDate: Date;
  title: string;
  invoiceNumber: string;
  vat: number;
  emailSalutation: string;
  directDebit: boolean;
  lineItems: Array<{ text: string; priceInCents: number }>;
}

/** Fills the invoice DOCX template (two passes). `\n` in line item texts becomes a line break. */
export function buildInvoiceDocx(templateBuffer: Buffer, input: InvoiceDocxInput): Buffer {
  const net = input.lineItems.reduce((sum, p) => sum + p.priceInCents, 0);
  const tax = Math.round(net * (input.vat / 100));
  const gross = net + tax;

  const paymentDetails = input.directDebit
    ? `Der Betrag wird in den nächsten Tagen mit dem Vermerk "${input.invoiceNumber}" von Ihrem Konto eingezogen.`
    : 'Bitte Überweisen Sie den Betrag unter Angabe der Rechnungsnummer an das untenstehende Konto.';

  // Pass 1: Template-level placeholders
  const doc1 = new Docxtemplater(new PizZip(templateBuffer), {
    paragraphLoop: true,
    linebreaks: true,
  });
  doc1.render({
    Anrede: input.salutation,
    Name: input.name,
    Strasse: input.street,
    Ort: input.city,
    Heute: input.invoiceDate.toLocaleDateString('de'),
    Title: input.title,
    ReNr: input.invoiceNumber,
    Netto: (net / 100).toFixed(2),
    Steuer: (tax / 100).toFixed(2),
    Brutto: (gross / 100).toFixed(2),
    ust: input.vat,
    MailAnrede: input.emailSalutation,
    PaymentDetails: paymentDetails,
    TableWithServices: getDocxTableLineItems(input.lineItems),
    monthlyPay: false,
    MonthlyBruto: '',
  });

  // Pass 2: Per-line-item placeholders (fresh zip from pass 1 output)
  const pass1Buffer = doc1.getZip().generate({ type: 'nodebuffer' }) as Buffer;
  const doc2 = new Docxtemplater(new PizZip(pass1Buffer), {
    paragraphLoop: true,
    linebreaks: true,
  });
  const pass2Data: Record<string, string> = {};
  input.lineItems.forEach((item, idx) => {
    pass2Data[`text${idx}`] = item.text;
    pass2Data[`price${idx}`] = (item.priceInCents / 100).toFixed(2);
  });
  doc2.render(pass2Data);

  return doc2.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
}

export async function generateInvoicePdf(
  prisma: PrismaClient,
  revisionId: number,
): Promise<string> {
  const revision = await prisma.invoiceRevision.findUniqueOrThrow({
    where: { id: revisionId },
    include: {
      invoice: true,
      template: true,
    },
  });

  const lineItems: Array<{ text: string; priceInCents: number }> = JSON.parse(revision.positions);
  const templateBuffer = await fs.promises.readFile(toAbsolutePath(revision.template.filePath));

  const docxBuffer = buildInvoiceDocx(templateBuffer, {
    salutation: revision.salutation,
    name: revision.name,
    street: revision.street,
    city: revision.city,
    invoiceDate: revision.invoiceDate,
    title: revision.title,
    invoiceNumber: revision.invoice.number,
    vat: revision.vat,
    emailSalutation: revision.emailSalutation,
    directDebit: revision.directDebit,
    lineItems,
  });
  const pdfBuffer = await docxToPdf(docxBuffer);

  const outputDir = path.join(
    INVOICES_DIR,
    String(revision.invoiceId),
    `r${revision.revisionNumber}`,
  );
  await fs.promises.mkdir(outputDir, { recursive: true });

  const safeNum = revision.invoice.number.replace(/\s*\/\s*/g, '-');
  const fileName = `${safeNum}-R${revision.revisionNumber}.pdf`;
  const outputPath = path.join(outputDir, fileName);
  await fs.promises.writeFile(outputPath, pdfBuffer);

  return toRelativePath(outputPath);
}

import { execFile } from 'child_process';
import Docxtemplater from 'docxtemplater';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PDFDocument, RotationTypes, StandardFonts } from 'pdf-lib';
import PizZip from 'pizzip';
import type { TemplateType } from 'shared';
import { calculateInvoiceTotals } from '../../../shared/src/invoiceTotals.js';
import { promisify } from 'util';
import type { PrismaClient } from '../../prisma/generated/client.js';
import { INVOICES_DIR, RECEIPTS_DIR, toAbsolutePath, toRelativePath } from '../config.js';
import { amountInWords, formatAmount, formatDate, formatEuroNumber } from './amountInWords.js';

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

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * WordprocessingML runs for a line item text: XML-escaped, `\n` as line breaks, and
 * XML-invalid control characters (everything below U+0020 except \t, \n, \r) removed.
 */
function lineItemTextRuns(text: string): string {
  // eslint-disable-next-line no-control-regex
  const clean = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  return clean
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => `<w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>`)
    .join('<w:r><w:br/></w:r>');
}

/**
 * Raw XML for the `{@TableWithServices}` tag. Content is inserted already resolved: raw XML
 * output is not parsed as a template, so braces in any text stay literal.
 */
function getDocxTableLineItems(lineItems: Array<{ text: string; priceInCents: number }>): string {
  let tableItems = '';
  lineItems.forEach((item) => {
    const priceContent = `${formatEuroNumber(item.priceInCents)}\u00a0€`;
    tableItems += `
        <w:tr>
            <w:tc>
                <w:tcPr>
                    <w:tcW w:w="6912" w:type="dxa"/>
                </w:tcPr>
                <w:p>${lineItemTextRuns(item.text)}</w:p>
            </w:tc>
            <w:tc>
                <w:tcPr>
                    <w:tcW w:w="1728" w:type="dxa"/>
                </w:tcPr>
                <w:p>
                    <w:r>
                        <w:t xml:space="preserve">${priceContent}</w:t>
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

const execFileAsync = promisify(execFile);

/** How long one LibreOffice conversion may take before it is killed. */
const LIBREOFFICE_TIMEOUT_MS = 60_000;

export type CommandRunner = (
  file: string,
  args: string[],
  options: { timeout: number; killSignal: NodeJS.Signals },
) => Promise<unknown>;

/**
 * Builds the DOCX → PDF converter. Conversions run one at a time: LibreOffice instances that
 * share a profile hand off to each other or exit with an error. The converter keeps its own
 * profile (not the one in $HOME) and reuses it, because setting up a fresh profile adds several
 * seconds to every conversion. After a failed or killed conversion the profile is discarded, so
 * a lock left behind cannot block later conversions.
 */
export function createDocxToPdf(run: CommandRunner): (docxBuffer: Buffer) => Promise<Buffer> {
  let queue: Promise<unknown> = Promise.resolve();
  let profileDir: string | null = null;

  async function convert(docxBuffer: Buffer): Promise<Buffer> {
    profileDir ??= await fs.promises.mkdtemp(path.join(os.tmpdir(), 'lo-profile-'));
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'lo-'));
    const docxPath = path.join(tmpDir, 'input.docx');
    const pdfPath = path.join(tmpDir, 'input.pdf');

    try {
      await fs.promises.writeFile(docxPath, docxBuffer);
      await run(
        'libreoffice',
        [
          '--headless',
          '--norestore',
          '--nofirststartwizard',
          `-env:UserInstallation=file://${profileDir}`,
          '--convert-to',
          'pdf',
          '--outdir',
          tmpDir,
          docxPath,
        ],
        { timeout: LIBREOFFICE_TIMEOUT_MS, killSignal: 'SIGKILL' },
      ).catch(async (err: unknown) => {
        const broken = profileDir;
        profileDir = null;
        if (broken) await fs.promises.rm(broken, { recursive: true, force: true });
        throw err;
      });
      return await fs.promises.readFile(pdfPath);
    } finally {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    }
  }

  return (docxBuffer) => {
    const result = queue.then(() => convert(docxBuffer));
    queue = result.catch(() => undefined);
    return result;
  };
}

export const docxToPdf = createDocxToPdf(execFileAsync);

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
): CoverLetterData | PdfFormData | InvoiceDocxInput {
  if (type === 'ANSCHREIBEN') {
    return {
      BriefAnrede: 'Sehr geehrte Damen und Herren',
      Anrede: 'Max Mustermann',
      Name: 'Musterfirma GmbH',
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
      salutation: '',
      name: 'Musterfirma GmbH',
      street: 'Musterstraße 1',
      city: '67105 Schifferstadt',
      invoiceDate: new Date(),
      title: 'Miete Musikheim April 2026',
      invoiceNumber: '1 / 2026',
      vat: 19,
      emailSalutation: 'Sehr geehrte Damen und Herren',
      directDebit: false,
      lineItems: [{ text: 'Miete Musikheim', priceInCents: 8403 }],
    };
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
  data: CoverLetterData | PdfFormData | InvoiceDocxInput,
): Promise<Buffer> {
  if (type === 'ANSCHREIBEN') {
    const filledDocx = await fillCoverLetterTemplate(templateBuffer, data as CoverLetterData);
    return docxToPdf(filledDocx);
  }
  if (type === 'RECHNUNG') {
    const filledDocx = buildInvoiceDocx(templateBuffer, data as InvoiceDocxInput);
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

/**
 * Fills the invoice DOCX template in a single pass. `\n` in line item texts becomes a line
 * break; braces in any value stay literal (values are never re-parsed as template syntax).
 */
export function buildInvoiceDocx(templateBuffer: Buffer, input: InvoiceDocxInput): Buffer {
  const {
    netCents: net,
    taxCents: tax,
    grossCents: gross,
  } = calculateInvoiceTotals(input.lineItems, input.vat);

  const paymentDetails = input.directDebit
    ? `Der Betrag wird in den nächsten Tagen mit dem Vermerk "${input.invoiceNumber}" von Ihrem Konto eingezogen.`
    : 'Bitte überweisen Sie den Betrag unter Angabe der Rechnungsnummer an das untenstehende Konto.';

  const doc = new Docxtemplater(new PizZip(templateBuffer), {
    paragraphLoop: true,
    linebreaks: true,
  });
  doc.render({
    Anrede: input.salutation,
    Name: input.name,
    Strasse: input.street,
    Ort: input.city,
    Heute: formatDate(input.invoiceDate),
    Title: input.title,
    ReNr: input.invoiceNumber,
    Netto: formatEuroNumber(net),
    Steuer: formatEuroNumber(tax),
    Brutto: formatEuroNumber(gross),
    ust: input.vat,
    MailAnrede: input.emailSalutation,
    PaymentDetails: paymentDetails,
    TableWithServices: getDocxTableLineItems(input.lineItems),
    monthlyPay: false,
    MonthlyBruto: '',
  });

  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
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

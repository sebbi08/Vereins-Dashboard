import Docxtemplater from 'docxtemplater';
import inspectModuleExport from 'docxtemplater/js/inspect-module.js';
import { PDFDocument } from 'pdf-lib';
import PizZip from 'pizzip';
import type { TemplateType, TemplateValidationError } from 'shared';

const REQUIRED_FIELDS_COVER_LETTER: Array<string | string[]> = [
  ['BriefAnrede', 'briefAnrede'],
  'Name',
  'Strasse',
  'Ort',
  'Heute',
  'Betrag',
  'TagDerZuwendung',
  'Kassenwart',
];

const REQUIRED_FIELDS_RECEIPT = [
  'Name',
  'Betrag',
  'BetragInBuchstaben',
  'TagDerZuwendung',
  'Zweck',
  'Steuer Nr',
  'SteuerNrDatum',
  'VeranlagungsZeitraum',
  'Finanzamt',
  'OrtDatum',
];

const REQUIRED_FIELDS_INVOICE = [
  'Name',
  'Strasse',
  'Ort',
  'Heute',
  'Title',
  'TableWithServices',
  'Netto',
  'Steuer',
  'Brutto',
  'ust',
  'PaymentDetails',
];

type InspectModule = Docxtemplater.DXT.Module & { getAllTags(): Record<string, unknown> };
/** The package exports a factory at runtime, although its typings declare a default class. */
const createInspectModule = inspectModuleExport as unknown as () => InspectModule;

/**
 * The placeholder names used in a DOCX template, read by docxtemplater itself, so a word that
 * merely contains a name ("ust" in "August") does not count and tags split across runs do.
 * A template docxtemplater cannot parse has no usable placeholders.
 */
function docxPlaceholders(buffer: Buffer): Set<string> {
  try {
    const inspect = createInspectModule();
    new Docxtemplater(new PizZip(buffer), {
      modules: [inspect],
      paragraphLoop: true,
      linebreaks: true,
    });
    return new Set(Object.keys(inspect.getAllTags()));
  } catch {
    return new Set();
  }
}

export function validateCoverLetterTemplate(buffer: Buffer): TemplateValidationError | null {
  const tags = docxPlaceholders(buffer);

  const missing = REQUIRED_FIELDS_COVER_LETTER.filter((requiredField) => {
    if (Array.isArray(requiredField)) {
      return !requiredField.some((variant) => tags.has(variant));
    }
    return !tags.has(requiredField);
  }).map((requiredField) => (Array.isArray(requiredField) ? requiredField[0] : requiredField));

  if (missing.length > 0) {
    return { type: 'ANSCHREIBEN', missingRequiredFields: missing };
  }
  return null;
}

export async function validateReceiptTemplate(
  buffer: Buffer,
): Promise<TemplateValidationError | null> {
  const pdfDoc = await PDFDocument.load(buffer);
  const form = pdfDoc.getForm();
  const presentFields = form.getFields().map((f) => f.getName());

  const missing = REQUIRED_FIELDS_RECEIPT.filter((p) => !presentFields.includes(p));

  if (missing.length > 0) {
    return { type: 'QUITTUNG', missingRequiredFields: missing };
  }
  return null;
}

export function validateInvoiceTemplate(buffer: Buffer): TemplateValidationError | null {
  const tags = docxPlaceholders(buffer);

  const missing = REQUIRED_FIELDS_INVOICE.filter((p) => !tags.has(p));

  if (missing.length > 0) {
    return { type: 'RECHNUNG', missingRequiredFields: missing };
  }
  return null;
}

export async function validateTemplate(
  type: TemplateType,
  buffer: Buffer,
): Promise<TemplateValidationError | null> {
  if (type === 'ANSCHREIBEN') {
    return validateCoverLetterTemplate(buffer);
  }
  if (type === 'RECHNUNG') {
    return validateInvoiceTemplate(buffer);
  }
  return validateReceiptTemplate(buffer);
}

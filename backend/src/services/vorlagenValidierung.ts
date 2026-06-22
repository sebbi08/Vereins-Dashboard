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

export function validateCoverLetterTemplate(buffer: Buffer): TemplateValidationError | null {
  const zip = new PizZip(buffer);
  const docXml = zip.files['word/document.xml']?.asText() ?? '';

  const missing = REQUIRED_FIELDS_COVER_LETTER.filter((requiredField) => {
    if (Array.isArray(requiredField)) {
      return !requiredField.some((variant) => docXml.includes(variant));
    }
    return !docXml.includes(requiredField);
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
  const zip = new PizZip(buffer);
  const docXml = zip.files['word/document.xml']?.asText() ?? '';

  const missing = REQUIRED_FIELDS_INVOICE.filter((p) => !docXml.includes(p));

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

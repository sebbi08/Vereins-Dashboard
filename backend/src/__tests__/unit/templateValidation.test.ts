import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import PizZip from 'pizzip';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import {
  validateCoverLetterTemplate,
  validateInvoiceTemplate,
  validateReceiptTemplate,
  validateTemplate,
} from '../../services/templateValidation';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  fs.readFileSync(path.resolve(__dirname, '../../../../e2e/fixture', name));

/** A minimal but valid DOCX whose body consists of the given paragraph texts. */
function docx(...paragraphs: string[]): Buffer {
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>',
  );
  const body = paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join('');
  zip.file(
    'word/document.xml',
    '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      `<w:body>${body}</w:body></w:document>`,
  );
  return Buffer.from(zip.generate({ type: 'arraybuffer' }));
}

const COVER_LETTER_TAGS = [
  '{BriefAnrede}',
  '{Name}',
  '{Strasse}',
  '{Ort}',
  '{Heute}',
  '{Betrag}',
  '{TagDerZuwendung}',
  '{Kassenwart}',
];

const INVOICE_TAGS = [
  '{Name}',
  '{Strasse}',
  '{Ort}',
  '{Heute}',
  '{Title}',
  '{@TableWithServices}',
  '{Netto}',
  '{Steuer}',
  '{Brutto}',
  '{ust}',
  '{PaymentDetails}',
];

async function pdfWithFields(...names: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage();
  const form = doc.getForm();
  names.forEach((name, i) => form.createTextField(name).addToPage(page, { y: 20 + i * 30 }));
  return Buffer.from(await doc.save());
}

const RECEIPT_FIELDS = [
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

describe('validateCoverLetterTemplate', () => {
  it('accepts a template with every placeholder', () => {
    expect(validateCoverLetterTemplate(docx(...COVER_LETTER_TAGS))).toBeNull();
  });

  it('accepts briefAnrede as an alternative to BriefAnrede', () => {
    const tags = COVER_LETTER_TAGS.map((t) => (t === '{BriefAnrede}' ? '{briefAnrede}' : t));
    expect(validateCoverLetterTemplate(docx(...tags))).toBeNull();
  });

  it('names a missing placeholder', () => {
    const result = validateCoverLetterTemplate(
      docx(...COVER_LETTER_TAGS.filter((t) => t !== '{Betrag}')),
    );
    expect(result).toEqual({ type: 'ANSCHREIBEN', missingRequiredFields: ['Betrag'] });
  });

  it('does not count plain words as placeholders', () => {
    const result = validateCoverLetterTemplate(docx('Name Strasse Ort Heute Betrag Kassenwart'));
    expect(result?.missingRequiredFields).toContain('Name');
    expect(result?.missingRequiredFields).toContain('Kassenwart');
  });

  it('accepts the real cover letter template', () => {
    expect(validateCoverLetterTemplate(fixture('Briefkopf spende.docx'))).toBeNull();
  });
});

describe('validateInvoiceTemplate', () => {
  it('accepts a template with every placeholder', () => {
    expect(validateInvoiceTemplate(docx(...INVOICE_TAGS))).toBeNull();
  });

  it('is not fooled by a word that contains a placeholder name', () => {
    // "ust" appears in August, Kunst and Lust — but there is no {ust} tag
    const tags = INVOICE_TAGS.filter((t) => t !== '{ust}');
    const result = validateInvoiceTemplate(docx('Miete August, Kunst und Lust', ...tags));
    expect(result).toEqual({ type: 'RECHNUNG', missingRequiredFields: ['ust'] });
  });

  it('reports every placeholder when the template has broken tag syntax', () => {
    const result = validateInvoiceTemplate(docx('{Name', ...INVOICE_TAGS.slice(1)));
    expect(result?.type).toBe('RECHNUNG');
    expect(result?.missingRequiredFields).toEqual(INVOICE_TAGS.map((t) => t.replace(/[{}@]/g, '')));
  });

  it('accepts the real invoice template', () => {
    expect(validateInvoiceTemplate(fixture('Rechnung.docx'))).toBeNull();
  });
});

describe('validateReceiptTemplate', () => {
  it('accepts a form with every field', async () => {
    expect(await validateReceiptTemplate(await pdfWithFields(...RECEIPT_FIELDS))).toBeNull();
  });

  it('requires the tax office and the place/date field', async () => {
    const fields = RECEIPT_FIELDS.filter((f) => f !== 'Finanzamt' && f !== 'OrtDatum');
    expect(await validateReceiptTemplate(await pdfWithFields(...fields))).toEqual({
      type: 'QUITTUNG',
      missingRequiredFields: ['Finanzamt', 'OrtDatum'],
    });
  });

  it('accepts the real receipt form', async () => {
    expect(await validateReceiptTemplate(fixture('geldspende_verein.pdf'))).toBeNull();
  });
});

describe('validateTemplate (dispatcher)', () => {
  it('delegates by template type', async () => {
    expect(await validateTemplate('ANSCHREIBEN', docx(...COVER_LETTER_TAGS))).toBeNull();
    expect(await validateTemplate('RECHNUNG', docx(...INVOICE_TAGS))).toBeNull();
  });
});

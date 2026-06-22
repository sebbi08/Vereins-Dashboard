import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';
import {
  validateCoverLetterTemplate,
  validateInvoiceTemplate,
  validateTemplate,
} from '../../services/templateValidation';

/** Creates a minimal DOCX buffer with the given XML body content. */
function buildDocxBuffer(documentXml: string): Buffer {
  const zip = new PizZip();
  zip.file('word/document.xml', documentXml);
  return Buffer.from(zip.generate({ type: 'arraybuffer' }));
}

const ALLE_PFLICHTFELDER_XML = `
  <w:body>
    <w:p><w:t>briefAnrede</w:t></w:p>
    <w:p><w:t>Name</w:t></w:p>
    <w:p><w:t>Strasse</w:t></w:p>
    <w:p><w:t>Ort</w:t></w:p>
    <w:p><w:t>Heute</w:t></w:p>
    <w:p><w:t>Betrag</w:t></w:p>
    <w:p><w:t>TagDerZuwendung</w:t></w:p>
    <w:p><w:t>Kassenwart</w:t></w:p>
  </w:body>
`;

const ALLE_PFLICHTFELDER_RECHNUNG_XML = `
  <w:body>
    <w:p><w:t>Name</w:t></w:p>
    <w:p><w:t>Strasse</w:t></w:p>
    <w:p><w:t>Ort</w:t></w:p>
    <w:p><w:t>Heute</w:t></w:p>
    <w:p><w:t>Title</w:t></w:p>
    <w:p><w:t>TableWithServices</w:t></w:p>
    <w:p><w:t>Netto</w:t></w:p>
    <w:p><w:t>Steuer</w:t></w:p>
    <w:p><w:t>Brutto</w:t></w:p>
    <w:p><w:t>ust</w:t></w:p>
    <w:p><w:t>PaymentDetails</w:t></w:p>
  </w:body>
`;

describe('validateCoverLetterTemplate', () => {
  it('returns null when all required fields are present', () => {
    const buffer = buildDocxBuffer(ALLE_PFLICHTFELDER_XML);
    const result = validateCoverLetterTemplate(buffer);
    expect(result).toBeNull();
  });

  it('returns errors when required fields are missing', () => {
    const buffer = buildDocxBuffer('<w:body><w:p><w:t>Name</w:t></w:p></w:body>');
    const result = validateCoverLetterTemplate(buffer);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('ANSCHREIBEN');
    expect(result!.missingRequiredFields.length).toBeGreaterThan(0);
  });

  it('accepts BriefAnrede as alternative to briefAnrede', () => {
    const xml = ALLE_PFLICHTFELDER_XML.replace('briefAnrede', 'BriefAnrede');
    const buffer = buildDocxBuffer(xml);
    const result = validateCoverLetterTemplate(buffer);
    expect(result).toBeNull();
  });

  it('returns specific missing fields', () => {
    const xmlWithoutBetrag = ALLE_PFLICHTFELDER_XML.replace('<w:p><w:t>Betrag</w:t></w:p>', '');
    const buffer = buildDocxBuffer(xmlWithoutBetrag);
    const result = validateCoverLetterTemplate(buffer);
    expect(result).not.toBeNull();
    expect(result!.missingRequiredFields).toContain('Betrag');
  });
});

describe('validiereVonlage (dispatcher)', () => {
  it('delegates to ANSCHREIBEN validator for ANSCHREIBEN type', async () => {
    const buffer = buildDocxBuffer(ALLE_PFLICHTFELDER_XML);
    const result = await validateTemplate('ANSCHREIBEN', buffer);
    expect(result).toBeNull();
  });

  it('delegates to RECHNUNG validator for RECHNUNG type', async () => {
    const buffer = buildDocxBuffer(ALLE_PFLICHTFELDER_RECHNUNG_XML);
    const result = await validateTemplate('RECHNUNG', buffer);
    expect(result).toBeNull();
  });
});

describe('validateInvoiceTemplate', () => {
  it('returns null when all Pflichtfelder are present', () => {
    const buffer = buildDocxBuffer(ALLE_PFLICHTFELDER_RECHNUNG_XML);
    const result = validateInvoiceTemplate(buffer);
    expect(result).toBeNull();
  });

  it('returns missing fields when some are missing', () => {
    const buffer = buildDocxBuffer('<w:body><w:p><w:t>Name</w:t></w:p></w:body>');
    const result = validateInvoiceTemplate(buffer);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('RECHNUNG');
    expect(result!.missingRequiredFields).toContain('Ort');
    expect(result!.missingRequiredFields).toContain('Title');
  });

  it('returns specific missing fields', () => {
    const xmlWithoutTitle = ALLE_PFLICHTFELDER_RECHNUNG_XML.replace(
      '<w:p><w:t>Title</w:t></w:p>',
      '',
    );
    const buffer = buildDocxBuffer(xmlWithoutTitle);
    const result = validateInvoiceTemplate(buffer);
    expect(result).not.toBeNull();
    expect(result!.missingRequiredFields).toContain('Title');
    expect(result!.missingRequiredFields).not.toContain('Name');
  });
});

import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';
import { validiereAnschreibenVorlage, validiereVorlage } from '../../services/vorlagenValidierung';

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

describe('validiereAnschreibenVorlage', () => {
  it('returns null when all required fields are present', () => {
    const buffer = buildDocxBuffer(ALLE_PFLICHTFELDER_XML);
    const result = validiereAnschreibenVorlage(buffer);
    expect(result).toBeNull();
  });

  it('returns errors when required fields are missing', () => {
    const buffer = buildDocxBuffer('<w:body><w:p><w:t>Name</w:t></w:p></w:body>');
    const result = validiereAnschreibenVorlage(buffer);
    expect(result).not.toBeNull();
    expect(result!.typ).toBe('ANSCHREIBEN');
    expect(result!.fehlendePflichtfelder.length).toBeGreaterThan(0);
  });

  it('accepts BriefAnrede as alternative to briefAnrede', () => {
    const xml = ALLE_PFLICHTFELDER_XML.replace('briefAnrede', 'BriefAnrede');
    const buffer = buildDocxBuffer(xml);
    const result = validiereAnschreibenVorlage(buffer);
    expect(result).toBeNull();
  });

  it('returns specific missing fields', () => {
    const xmlWithoutBetrag = ALLE_PFLICHTFELDER_XML.replace('<w:p><w:t>Betrag</w:t></w:p>', '');
    const buffer = buildDocxBuffer(xmlWithoutBetrag);
    const result = validiereAnschreibenVorlage(buffer);
    expect(result).not.toBeNull();
    expect(result!.fehlendePflichtfelder).toContain('Betrag');
  });
});

describe('validiereVorlage (dispatcher)', () => {
  it('delegates to ANSCHREIBEN validator for ANSCHREIBEN type', async () => {
    const buffer = buildDocxBuffer(ALLE_PFLICHTFELDER_XML);
    const result = await validiereVorlage('ANSCHREIBEN', buffer);
    expect(result).toBeNull();
  });
});

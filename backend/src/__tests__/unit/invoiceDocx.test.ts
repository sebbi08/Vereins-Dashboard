import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import { fileURLToPath } from 'url';
import { describe, expect, it, vi } from 'vitest';
import { buildInvoiceDocx } from '../../services/pdfGeneration';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.resolve(__dirname, '../../../../e2e/fixture/Rechnung.docx');

function documentXml(docx: Buffer): string {
  return new PizZip(docx).file('word/document.xml')!.asText();
}

const baseInput = {
  salutation: 'Frau',
  name: 'Anna Alt',
  street: 'Hauptstr. 1',
  city: '12345 Berlin',
  invoiceDate: new Date('2026-10-05T10:00:00Z'),
  title: 'Raummiete',
  invoiceNumber: '1 / 2026',
  vat: 19,
  emailSalutation: 'Hallo',
  directDebit: false,
};

describe('buildInvoiceDocx', () => {
  it('renders a line break in a line item as <w:br/>', () => {
    const docx = buildInvoiceDocx(fs.readFileSync(templatePath), {
      ...baseInput,
      lineItems: [{ text: 'Zeile 1\nZeile 2', priceInCents: 182813 }],
    });

    expect(documentXml(docx)).toMatch(
      /Zeile 1<\/w:t><\/w:r><w:r><w:br\/><\/w:r><w:r><w:t[^>]*>Zeile 2/,
    );
  });

  it('renders every line item text and price', () => {
    const xml = documentXml(
      buildInvoiceDocx(fs.readFileSync(templatePath), {
        ...baseInput,
        lineItems: [
          { text: 'Erste Position', priceInCents: 1000 },
          { text: 'Zweite Position', priceInCents: 2550 },
        ],
      }),
    );
    expect(xml).toContain('Erste Position');
    expect(xml).toContain('Zweite Position');
    expect(xml).toContain('25.50€');
    expect(xml).not.toContain('{text0}');
  });

  it('does not warn about reusing a generated zip', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    buildInvoiceDocx(fs.readFileSync(templatePath), {
      ...baseInput,
      lineItems: [{ text: 'A', priceInCents: 100 }],
    });
    const messages = [...warn.mock.calls, ...log.mock.calls].flat().join(' ');
    expect(messages).not.toContain('previous docxtemplater generation');
    warn.mockRestore();
    log.mockRestore();
  });
});

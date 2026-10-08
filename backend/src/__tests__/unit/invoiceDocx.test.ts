import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import { fileURLToPath } from 'url';
import { describe, expect, it, vi } from 'vitest';
import {
  buildInvoiceDocx,
  getDummyData,
  type InvoiceDocxInput,
} from '../../services/pdfGeneration';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.resolve(__dirname, '../../../../e2e/fixture/Rechnung.docx');

function documentXml(docx: Buffer): string {
  return new PizZip(docx).file('word/document.xml')!.asText();
}

/** Visible text of the document (tags removed, entities kept). */
function textOf(xml: string): string {
  return xml.replace(/<[^>]+>/g, '');
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

  it('strips XML-invalid control characters from line item texts', () => {
    const xml = documentXml(
      buildInvoiceDocx(fs.readFileSync(templatePath), {
        ...baseInput,
        lineItems: [{ text: 'A\u000BB\u0001C', priceInCents: 100 }],
      }),
    );
    expect(xml).toContain('ABC');
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
    expect(textOf(xml)).toContain('25,50\u00a0€');
    expect(xml).not.toContain('{text0}');
  });

  it.each([
    ['name', { name: 'Firma {Nord}' }, 'Firma {Nord}'],
    ['name equal to a line item tag', { name: '{text0}' }, '{text0}'],
    ['title with an open brace', { title: 'Kurs {' }, 'Kurs {'],
    ['street with a close brace', { street: 'Weg }' }, 'Weg }'],
  ])('keeps braces in the %s literally', (_label, override, expected) => {
    const xml = documentXml(
      buildInvoiceDocx(fs.readFileSync(templatePath), {
        ...baseInput,
        ...override,
        lineItems: [{ text: 'Position A', priceInCents: 1000 }],
      }),
    );
    expect(textOf(xml)).toContain(expected);
    expect(textOf(xml)).toContain('Position A');
  });

  it('writes the totals in German notation with thousands separators', () => {
    const text = textOf(
      documentXml(
        buildInvoiceDocx(fs.readFileSync(templatePath), {
          ...baseInput,
          lineItems: [{ text: 'Miete', priceInCents: 123456 }],
        }),
      ),
    );
    expect(text).toContain('1.234,56'); // net
    expect(text).toContain('234,57'); // 19 % tax
    expect(text).toContain('1.469,13'); // gross
    expect(text).not.toContain('1234.56');
  });

  it('writes the invoice date as dd.mm.yyyy', () => {
    const text = textOf(
      documentXml(
        buildInvoiceDocx(fs.readFileSync(templatePath), {
          ...baseInput,
          lineItems: [{ text: 'Miete', priceInCents: 1000 }],
        }),
      ),
    );
    expect(text).toContain('05.10.2026');
    expect(text).not.toMatch(/(^|\D)5\.10\.2026/);
  });

  it('renders the template preview with the same builder and data shape as real invoices', () => {
    const dummy = getDummyData('RECHNUNG', {
      treasurer: '',
      charitablePurpose: '',
      taxOfficeName: '',
      taxNumber: '',
      exemptionDate: '',
      assessmentPeriod: '',
    });
    expect(dummy).toHaveProperty('lineItems');
    expect(dummy).toHaveProperty('invoiceNumber');

    const text = textOf(
      documentXml(buildInvoiceDocx(fs.readFileSync(templatePath), dummy as InvoiceDocxInput)),
    );
    expect(text).toContain('Miete Musikheim');
    expect(text).toContain('84,03');
    expect(text).toContain('100,00');
  });

  it('keeps braces and XML special characters in line items literally', () => {
    const xml = documentXml(
      buildInvoiceDocx(fs.readFileSync(templatePath), {
        ...baseInput,
        lineItems: [{ text: 'Kurs {A} }{ <b> & Co', priceInCents: 1000 }],
      }),
    );
    expect(xml).toContain('Kurs {A} }{ &lt;b&gt; &amp; Co');
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

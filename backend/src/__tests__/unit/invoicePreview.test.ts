import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import PizZip from 'pizzip';
import type { InvoiceContent } from 'shared';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { createInvoicePreview } from '../../services/invoicePreview';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.resolve(__dirname, '../../../../e2e/fixture/Rechnung.docx');

const content: InvoiceContent = {
  salutation: 'Frau',
  name: 'Anna Alt',
  street: 'Hauptstr. 1',
  city: '12345 Berlin',
  title: 'Raummiete',
  lineItems: [{ text: 'Raummiete Oktober', priceInCents: 10000 }],
  vat: 19,
  directDebit: false,
  email: 'anna@example.org',
  emailSalutation: 'Hallo',
};

async function onePagePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  return Buffer.from(await doc.save());
}

/** A preview generator whose "LibreOffice" keeps the DOCX it was given. */
function previewWithFakeConverter() {
  const seen: { docx: Buffer | null; templatePath: string | null } = {
    docx: null,
    templatePath: null,
  };
  const generate = createInvoicePreview({
    convert: async (docx) => {
      seen.docx = docx;
      return onePagePdf();
    },
    readTemplate: async (storedPath) => {
      seen.templatePath = storedPath;
      return fs.promises.readFile(templatePath);
    },
  });
  return { generate, seen };
}

function textOf(docx: Buffer): string {
  return new PizZip(docx)
    .file('word/document.xml')!
    .asText()
    .replace(/<[^>]+>/g, '');
}

describe('invoice preview', () => {
  it('fills the template with the draft, today and "Preview" as the number', async () => {
    const { generate, seen } = previewWithFakeConverter();

    const pdf = await generate('templates/t.docx', content, new Date('2026-10-12T12:00:00Z'));

    expect(seen.templatePath).toBe('templates/t.docx');
    const text = textOf(seen.docx!);
    expect(text).toContain('Anna Alt');
    expect(text).toContain('Raummiete Oktober');
    expect(text).toContain('Preview');
    expect(text).toContain('12.10.2026');
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
    expect(pdf.length).toBeGreaterThan((await onePagePdf()).length); // the watermark was added
  });

  it('also previews a draft that only has a name', async () => {
    const { generate } = previewWithFakeConverter();
    const incomplete: InvoiceContent = {
      ...content,
      street: '',
      city: '',
      title: '',
      lineItems: [{ text: '', priceInCents: 0 }],
      email: '',
      emailSalutation: '',
    };
    const pdf = await generate('templates/t.docx', incomplete, new Date('2026-10-12T12:00:00Z'));
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
  });

  it('passes a failed conversion on', async () => {
    const generate = createInvoicePreview({
      convert: async () => {
        throw new Error('libreoffice crashed');
      },
      readTemplate: async () => fs.promises.readFile(templatePath),
    });
    await expect(generate('templates/t.docx', content, new Date())).rejects.toThrow(
      'libreoffice crashed',
    );
  });
});

import fs from 'fs';
import path from 'path';
import { PDFDocument, PDFName } from 'pdf-lib';
import PizZip from 'pizzip';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import {
  fillCoverLetterTemplate,
  generatePreviewTemplate,
  getDummyData,
  mergePdfs,
  type CoverLetterData,
  type PdfFormData,
} from '../../services/pdfGeneration';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  fs.readFileSync(path.resolve(__dirname, '../../../../e2e/fixture', name));

const settings = {
  treasurer: '',
  charitablePurpose: 'Förderung der Musik',
  taxOfficeName: 'Finanzamt',
  taxNumber: '12/345/67890',
  exemptionDate: '2024-01-01',
  assessmentPeriod: '2023',
};

async function receiptPdf(number: string): Promise<Buffer> {
  const data = { ...(getDummyData('QUITTUNG', settings) as PdfFormData), quittungsNummer: number };
  return generatePreviewTemplate('QUITTUNG', fixture('geldspende_verein.pdf'), data);
}

/** What a viewer shows: the XMP title wins over the info dictionary when both exist. */
async function shownTitle(pdf: Buffer) {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  const preferences = doc.catalog.getViewerPreferences();
  return {
    title: doc.getTitle(),
    xmp: doc.catalog.get(PDFName.of('Metadata')),
    displayDocTitle: preferences?.getDisplayDocTitle(),
  };
}

describe('document titles', () => {
  it('titles the cover letter "Anschreiben" instead of the template title', async () => {
    const docx = await fillCoverLetterTemplate(
      fixture('Briefkopf spende.docx'),
      getDummyData('ANSCHREIBEN', settings) as CoverLetterData,
    );
    const core = new PizZip(docx).file('docProps/core.xml')!.asText();
    expect(core).toContain('<dc:title>Anschreiben</dc:title>');
    expect(core.match(/<dc:title/g)).toHaveLength(1);
  });

  it('titles the receipt with its number and drops the template XMP title', async () => {
    expect(await shownTitle(await receiptPdf('000042'))).toEqual({
      title: 'Zuwendungsbestätigung 000042',
      xmp: undefined,
      displayDocTitle: true,
    });
  });

  it('titles a cover letter merged with the receipt like the receipt', async () => {
    const merged = await mergePdfs(
      [await receiptPdf('000042'), await receiptPdf('000042')],
      'Zuwendungsbestätigung 000042',
    );
    expect(await shownTitle(merged)).toEqual({
      title: 'Zuwendungsbestätigung 000042',
      xmp: undefined,
      displayDocTitle: true,
    });
  });
});

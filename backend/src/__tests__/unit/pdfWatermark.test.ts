import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { addWatermark } from '../../services/pdfWatermark';

/** "Preview" as pdf-lib writes it into a content stream (hex string of the characters). */
const PREVIEW_HEX = Buffer.from('Preview', 'latin1').toString('hex');

async function twoPages(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]).drawText('Seite 1');
  doc.addPage([842, 595]).drawText('Seite 2');
  return Buffer.from(await doc.save());
}

/** The decoded drawing instructions of every page. */
async function pageContents(pdf: Buffer): Promise<string[]> {
  const doc = await PDFDocument.load(pdf);
  return doc.getPages().map((page) => {
    const contents = page.node.Contents();
    const streams =
      contents instanceof PDFArray
        ? contents.asArray().map((ref) => doc.context.lookup(ref))
        : [contents];
    return streams
      .map((stream) =>
        stream instanceof PDFRawStream
          ? Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1')
          : '',
      )
      .join('\n');
  });
}

describe('addWatermark', () => {
  it('draws the text on every page and keeps the pages', async () => {
    const original = await twoPages();
    expect((await pageContents(original)).some((page) => page.includes(PREVIEW_HEX))).toBe(false);

    const marked = await pageContents(await addWatermark(original, 'Preview'));

    expect(marked).toHaveLength(2);
    expect(marked.every((page) => page.includes(PREVIEW_HEX))).toBe(true);
    expect(marked[0]).toContain(Buffer.from('Seite 1', 'latin1').toString('hex'));
  });

  it('draws it mostly transparent (35 % opacity), in grey and rotated', async () => {
    const [page] = await pageContents(await addWatermark(await twoPages(), 'Preview'));
    const watermark = page.slice(page.lastIndexOf('BT', page.indexOf(PREVIEW_HEX)) - 40);
    expect(watermark).toMatch(/\/GS-\d+ gs/); // an opacity state
    expect(watermark).toContain('0.6 0.6 0.6 rg');
    expect(watermark).toMatch(/0\.7071\d* 0\.7071\d* -0\.7071\d* 0\.7071\d* [\d.]+ [\d.]+ Tm/);
  });
});

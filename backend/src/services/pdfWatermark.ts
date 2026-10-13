import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';

const ANGLE = Math.PI / 4;

/**
 * Draws `text` across every page: centred, rotated 45°, light grey and half transparent, about
 * 60 % of the page diagonal wide. The page content stays untouched below it.
 */
export async function addWatermark(pdf: Buffer, text: string): Promise<Buffer> {
  const doc = await PDFDocument.load(pdf);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);

  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const size = (0.6 * Math.hypot(width, height)) / font.widthOfTextAtSize(text, 1);
    const textWidth = font.widthOfTextAtSize(text, size);
    const textHeight = font.heightAtSize(size, { descender: false });
    // drawText rotates around the start of the text: shift it so the text's centre is the page's
    const x = width / 2 - (textWidth / 2) * Math.cos(ANGLE) + (textHeight / 2) * Math.sin(ANGLE);
    const y = height / 2 - (textWidth / 2) * Math.sin(ANGLE) - (textHeight / 2) * Math.cos(ANGLE);
    page.drawText(text, {
      x,
      y,
      size,
      font,
      color: rgb(0.6, 0.6, 0.6),
      opacity: 0.35,
      rotate: degrees(45),
    });
  }
  return Buffer.from(await doc.save());
}

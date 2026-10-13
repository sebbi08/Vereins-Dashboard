import fs from 'fs';
import type { InvoiceContent } from 'shared';
import { toAbsolutePath } from '../config.js';
import { buildInvoiceDocx, docxToPdf } from './pdfGeneration.js';
import { addWatermark } from './pdfWatermark.js';

/** Stands where the invoice number will be, and across every page as the watermark. */
export const PREVIEW_LABEL = 'Preview';

/**
 * Builds "show this draft as it would look as an invoice". The PDF is only returned: no invoice
 * number is taken and nothing is written to the data directory.
 */
export function createInvoicePreview(deps: {
  convert: (docx: Buffer) => Promise<Buffer>;
  readTemplate: (storedPath: string) => Promise<Buffer>;
}): (templatePath: string, content: InvoiceContent, today: Date) => Promise<Buffer> {
  return async (templatePath, content, today) => {
    const docx = buildInvoiceDocx(await deps.readTemplate(templatePath), {
      salutation: content.salutation,
      name: content.name,
      street: content.street,
      city: content.city,
      invoiceDate: today,
      title: content.title,
      invoiceNumber: PREVIEW_LABEL,
      vat: content.vat,
      emailSalutation: content.emailSalutation,
      directDebit: content.directDebit,
      lineItems: content.lineItems,
    });
    return addWatermark(await deps.convert(docx), PREVIEW_LABEL);
  };
}

export const generateInvoicePreview = createInvoicePreview({
  convert: docxToPdf,
  readTemplate: (storedPath) => fs.promises.readFile(toAbsolutePath(storedPath)),
});

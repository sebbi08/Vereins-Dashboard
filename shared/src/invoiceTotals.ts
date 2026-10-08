import type { InvoiceLineItem } from './index.js';

/** The standard VAT rate; instructor invoices always use it. */
export const INVOICE_VAT_PERCENT = 19;

export interface InvoiceTotals {
  netCents: number;
  taxCents: number;
  grossCents: number;
}

/**
 * Net, tax and gross of an invoice in cents. The one place this is calculated: the amounts on
 * screen, in the invoice list and on the PDF must always agree.
 */
export function calculateInvoiceTotals(
  lineItems: readonly Pick<InvoiceLineItem, 'priceInCents'>[],
  vatPercent: number,
): InvoiceTotals {
  const netCents = lineItems.reduce((sum, item) => sum + item.priceInCents, 0);
  const taxCents = Math.round(netCents * (vatPercent / 100));
  return { netCents, taxCents, grossCents: netCents + taxCents };
}

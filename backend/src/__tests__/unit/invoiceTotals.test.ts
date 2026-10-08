import { describe, expect, it } from 'vitest';
import { calculateInvoiceTotals, INVOICE_VAT_PERCENT } from '../../../../shared/src/invoiceTotals';

describe('calculateInvoiceTotals', () => {
  it('sums the line items and adds the VAT, rounded to whole cents', () => {
    expect(calculateInvoiceTotals([{ priceInCents: 1000 }, { priceInCents: 2000 }], 19)).toEqual({
      netCents: 3000,
      taxCents: 570,
      grossCents: 3570,
    });
  });

  it('rounds half a cent of tax up', () => {
    // 8403 × 19 % = 1596.57 → 1597
    expect(calculateInvoiceTotals([{ priceInCents: 8403 }], 19)).toEqual({
      netCents: 8403,
      taxCents: 1597,
      grossCents: 10000,
    });
  });

  it('handles the reduced rate and an empty invoice', () => {
    expect(calculateInvoiceTotals([{ priceInCents: 1000 }], 7).grossCents).toBe(1070);
    expect(calculateInvoiceTotals([], 19)).toEqual({ netCents: 0, taxCents: 0, grossCents: 0 });
  });

  it('exposes the standard rate used for instructor invoices', () => {
    expect(INVOICE_VAT_PERCENT).toBe(19);
  });
});

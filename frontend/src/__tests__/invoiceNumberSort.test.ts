import { describe, expect, it } from 'vitest';
import { invoiceNumberSortKey } from '../utils/invoiceNumberSort';

describe('invoiceNumberSortKey', () => {
  it('orders invoice numbers by year, then running number', () => {
    const numbers = ['9 / 2026', '12 / 2025', '10 / 2026', '1 / 2026'];
    const sorted = [...numbers].sort((a, b) =>
      invoiceNumberSortKey(a).localeCompare(invoiceNumberSortKey(b)),
    );
    expect(sorted).toEqual(['12 / 2025', '1 / 2026', '9 / 2026', '10 / 2026']);
  });

  it('keeps an unexpected number format sortable as text', () => {
    expect(invoiceNumberSortKey('X-1')).toBe('X-1');
  });
});

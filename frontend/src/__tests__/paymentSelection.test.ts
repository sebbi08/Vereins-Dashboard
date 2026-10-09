import type { BookingMatch, MatchCandidate, MatchLevel } from 'shared';
import { describe, expect, it } from 'vitest';
import {
  canSelect,
  chooseInvoice,
  chosenCandidate,
  initialRows,
  removePaidInvoices,
  selectedInvoiceIds,
  setSelected,
} from '../utils/paymentSelection';

function candidate(invoiceId: number): MatchCandidate {
  return {
    invoiceId,
    invoiceNumber: `${invoiceId} / 2026`,
    recipientName: 'Anna Alt',
    invoiceDate: '2026-03-01',
    amountCents: 5950,
    reasons: ['AMOUNT'],
    differenceCents: 0,
  };
}

function match(row: number, level: MatchLevel, invoiceIds: number[]): BookingMatch {
  return {
    booking: { row, date: '2026-03-10', payer: 'Anna', purpose: '', amountCents: 5950 },
    level,
    candidates: invoiceIds.map(candidate),
  };
}

describe('initialRows', () => {
  it('preselects confident rows with one candidate only', () => {
    const rows = initialRows([
      match(1, 'CONFIDENT', [1]),
      match(2, 'AMOUNT_DIFFERS', [2]),
      match(3, 'AMOUNT_ONLY', [3]),
      match(4, 'CONFIDENT', [4, 5]),
    ]);
    expect(rows.map((r) => r.selected)).toEqual([true, false, false, false]);
    expect(rows.map((r) => r.invoiceId)).toEqual([1, 2, 3, null]);
    expect(selectedInvoiceIds(rows)).toEqual([1]);
  });

  it('preselects an invoice proposed twice only in the first row', () => {
    const rows = initialRows([match(1, 'CONFIDENT', [1]), match(2, 'CONFIDENT', [1])]);
    expect(rows.map((r) => r.selected)).toEqual([true, false]);
    expect(canSelect(rows, rows[1])).toBe(false);
  });
});

describe('selecting', () => {
  it('frees an invoice for other rows once it is unselected', () => {
    let rows = initialRows([match(1, 'CONFIDENT', [1]), match(2, 'AMOUNT_ONLY', [1])]);
    expect(setSelected(rows, 1, true)).toBe(rows);

    rows = setSelected(rows, 0, false);
    expect(canSelect(rows, rows[1])).toBe(true);
    rows = setSelected(rows, 1, true);
    expect(selectedInvoiceIds(rows)).toEqual([1]);
  });

  it('needs a chosen invoice before a row with several candidates can be selected', () => {
    let rows = initialRows([match(1, 'AMOUNT_ONLY', [1, 2])]);
    expect(canSelect(rows, rows[0])).toBe(false);

    rows = chooseInvoice(rows, 0, 2);
    expect(chosenCandidate(rows[0])?.invoiceId).toBe(2);
    rows = setSelected(rows, 0, true);
    expect(selectedInvoiceIds(rows)).toEqual([2]);

    rows = chooseInvoice(rows, 0, null);
    expect(rows[0]).toMatchObject({ invoiceId: null, selected: false });
  });

  it('does not let a row choose an invoice that another row has selected', () => {
    const rows = initialRows([match(1, 'CONFIDENT', [1]), match(2, 'AMOUNT_ONLY', [1, 2])]);
    expect(chooseInvoice(rows, 1, 1)).toBe(rows);
    expect(chooseInvoice(rows, 1, 2)[1].invoiceId).toBe(2);
  });
});

describe('removePaidInvoices', () => {
  it('drops the rows of the paid invoices and takes them out of the other proposals', () => {
    const rows = initialRows([
      match(1, 'CONFIDENT', [1]),
      match(2, 'CONFIDENT', [1]),
      match(3, 'AMOUNT_ONLY', [1, 2]),
      match(4, 'AMOUNT_ONLY', [1, 3, 4]),
      match(5, 'AMOUNT_ONLY', [1, 6]),
      match(6, 'AMOUNT_DIFFERS', [5]),
    ]);

    const left = removePaidInvoices(rows, [1, 6]);

    expect(left.map((r) => r.match.booking.row)).toEqual([3, 4, 6]);
    expect(left[0]).toMatchObject({ invoiceId: 2, selected: false });
    expect(left[0].match.candidates.map((c) => c.invoiceId)).toEqual([2]);
    expect(left[1]).toMatchObject({ invoiceId: null, selected: false });
    expect(left[1].match.candidates.map((c) => c.invoiceId)).toEqual([3, 4]);
    expect(left[2]).toBe(rows[5]);
    expect(rows[2].match.candidates).toHaveLength(2);
  });

  it('drops a row whose chosen invoice was paid, although other candidates are left', () => {
    let rows = initialRows([match(1, 'CONFIDENT', [1]), match(2, 'AMOUNT_ONLY', [1, 2])]);
    rows = setSelected(rows, 0, false);
    rows = chooseInvoice(rows, 1, 1);
    rows = setSelected(rows, 0, true);

    expect(removePaidInvoices(rows, [1])).toEqual([]);
  });

  it('keeps the rows unchanged when nothing they propose was paid', () => {
    const rows = initialRows([match(1, 'CONFIDENT', [1]), match(2, 'AMOUNT_ONLY', [2, 3])]);
    const left = removePaidInvoices(rows, [9]);
    expect(left).toEqual(rows);
    expect(left[1]).toBe(rows[1]);
  });
});

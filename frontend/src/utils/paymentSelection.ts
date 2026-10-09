import type { BookingMatch, MatchCandidate } from 'shared';

/** One proposal on the import page: the booking, the chosen invoice, and whether to mark it. */
export interface MatchRow {
  key: number;
  match: BookingMatch;
  /** The chosen candidate; preset when there is only one. */
  invoiceId: number | null;
  selected: boolean;
}

/**
 * Rows for a match result. Only confident proposals with a single candidate start selected,
 * and an invoice proposed for several bookings only in its first row.
 */
export function initialRows(matches: BookingMatch[]): MatchRow[] {
  const taken = new Set<number>();
  return matches.map((match, key) => {
    const only = match.candidates.length === 1 ? match.candidates[0].invoiceId : null;
    const selected = match.level === 'CONFIDENT' && only !== null && !taken.has(only);
    if (selected && only !== null) taken.add(only);
    return { key, match, invoiceId: only, selected };
  });
}

/** Invoices selected in rows other than `exceptKey`. */
export function takenInvoiceIds(rows: MatchRow[], exceptKey: number): Set<number> {
  const taken = new Set<number>();
  for (const row of rows) {
    if (row.selected && row.key !== exceptKey && row.invoiceId !== null) taken.add(row.invoiceId);
  }
  return taken;
}

/** A selected row can always be unselected; otherwise it needs a free, chosen invoice. */
export function canSelect(rows: MatchRow[], row: MatchRow): boolean {
  if (row.selected) return true;
  return row.invoiceId !== null && !takenInvoiceIds(rows, row.key).has(row.invoiceId);
}

export function setSelected(rows: MatchRow[], key: number, selected: boolean): MatchRow[] {
  const row = rows.find((r) => r.key === key);
  if (!row || row.selected === selected || (selected && !canSelect(rows, row))) return rows;
  return rows.map((r) => (r.key === key ? { ...r, selected } : r));
}

/** Choosing no invoice unselects the row; an invoice selected elsewhere cannot be chosen. */
export function chooseInvoice(rows: MatchRow[], key: number, invoiceId: number | null): MatchRow[] {
  if (invoiceId !== null && takenInvoiceIds(rows, key).has(invoiceId)) return rows;
  return rows.map((r) =>
    r.key === key ? { ...r, invoiceId, selected: invoiceId === null ? false : r.selected } : r,
  );
}

export function chosenCandidate(row: MatchRow): MatchCandidate | null {
  return row.match.candidates.find((c) => c.invoiceId === row.invoiceId) ?? null;
}

/**
 * The rows left after `paidIds` were marked as paid: rows with a paid invoice go, the other rows
 * no longer offer the paid invoices. A row left with one candidate gets it, unselected; a row
 * left with none goes.
 */
export function removePaidInvoices(rows: MatchRow[], paidIds: Iterable<number>): MatchRow[] {
  const paid = new Set(paidIds);
  return rows.flatMap((row) => {
    if (row.invoiceId !== null && paid.has(row.invoiceId)) return [];
    const candidates = row.match.candidates.filter((c) => !paid.has(c.invoiceId));
    if (candidates.length === row.match.candidates.length) return [row];
    if (candidates.length === 0) return [];
    const next: MatchRow = { ...row, match: { ...row.match, candidates } };
    if (candidates.length === 1) {
      next.invoiceId = candidates[0].invoiceId;
      next.selected = false;
    }
    return [next];
  });
}

export function selectedInvoiceIds(rows: MatchRow[]): number[] {
  return rows.flatMap((row) => (row.selected && row.invoiceId !== null ? [row.invoiceId] : []));
}

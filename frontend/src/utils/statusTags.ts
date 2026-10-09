export type TagSeverity = 'success' | 'secondary' | 'info' | 'warn' | 'danger';

export interface StatusTag {
  label: string;
  severity: TagSeverity;
}

function lookup(map: Record<string, StatusTag>, status: string): StatusTag {
  return map[status] ?? { label: status, severity: 'secondary' };
}

const DOCUMENT: Record<string, StatusTag> = {
  AKTIV: { label: 'Active', severity: 'success' },
  STORNIERT: { label: 'Cancelled', severity: 'secondary' },
};

const REVISION: Record<string, StatusTag> = {
  AKTIV: { label: 'Current', severity: 'info' },
  ERSETZT: { label: 'Superseded', severity: 'secondary' },
};

const PDF: Record<string, StatusTag> = {
  OK: { label: 'PDF ready', severity: 'success' },
  PENDING: { label: 'PDF pending', severity: 'secondary' },
  FAILED: { label: 'PDF failed', severity: 'danger' },
};

const EMAIL: Record<string, StatusTag> = {
  SENT: { label: 'Email sent', severity: 'success' },
  FAILED: { label: 'Email failed', severity: 'danger' },
  NOT_SENT: { label: 'Not sent', severity: 'secondary' },
};

export const documentStatusTag = (status: string) => lookup(DOCUMENT, status);
export const revisionStatusTag = (status: string) => lookup(REVISION, status);
export const pdfStatusTag = (status: string) => lookup(PDF, status);
export const emailStatusTag = (status: string) => lookup(EMAIL, status);

export const DOCUMENT_STATUS_OPTIONS = [
  { label: 'Active', value: 'AKTIV' },
  { label: 'Cancelled', value: 'STORNIERT' },
];

export const EMAIL_STATUS_OPTIONS = [
  { label: 'Not sent', value: 'NOT_SENT' },
  { label: 'Sent', value: 'SENT' },
  { label: 'Failed', value: 'FAILED' },
];

/** Toolbar status filter for list pages: the document states plus "All" (no filter). */
export const DOCUMENT_STATUS_FILTER_OPTIONS: { label: string; value: string | null }[] = [
  ...DOCUMENT_STATUS_OPTIONS,
  { label: 'All', value: null },
];

/** Paid, or Open while an active invoice is still owed; nothing for a cancelled unpaid one. */
export function paymentStatusTag(paid: boolean, status: string): StatusTag | null {
  if (paid) return { label: 'Paid', severity: 'success' };
  return status === 'AKTIV' ? { label: 'Open', severity: 'secondary' } : null;
}

/** Column filter of the invoice list; cleared means all. */
export const PAYMENT_FILTER_OPTIONS: { label: string; value: boolean }[] = [
  { label: 'Open', value: false },
  { label: 'Paid', value: true },
];

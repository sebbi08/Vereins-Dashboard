import type { InvoiceContent, InvoiceLineItem, ReceiptInputs } from 'shared';
import type { RecipientData, RecipientSelection } from './invoiceCreation.js';

/**
 * Request bodies are parsed into typed values before any business rule or database write sees
 * them. A body of the wrong shape gets one generic 400; business rules (required fields, amounts,
 * dates) keep their specific messages.
 */
export const INVALID_BODY = 'Invalid request body';

export type Parsed<T> = { value: T } | { error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

class BodyError extends Error {}

function text(record: Record<string, unknown>, key: string, fallback?: string): string {
  const value = record[key];
  if (typeof value === 'string') return value;
  if (value === undefined && fallback !== undefined) return fallback;
  throw new BodyError(INVALID_BODY);
}

function optionalText(record: Record<string, unknown>, key: string): string | null | undefined {
  const value = record[key];
  if (value === undefined || value === null || typeof value === 'string') return value;
  throw new BodyError(INVALID_BODY);
}

function flag(record: Record<string, unknown>, key: string, fallback?: boolean): boolean {
  const value = record[key];
  if (typeof value === 'boolean') return value;
  if (value === undefined && fallback !== undefined) return fallback;
  throw new BodyError(INVALID_BODY);
}

function integer(record: Record<string, unknown>, key: string, fallback?: number): number {
  const value = record[key];
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (value === undefined && fallback !== undefined) return fallback;
  throw new BodyError(INVALID_BODY);
}

function attempt<T>(parse: () => T): Parsed<T> {
  try {
    return { value: parse() };
  } catch (err) {
    if (err instanceof BodyError) return { error: err.message };
    throw err;
  }
}

/**
 * A calendar day as UTC midnight. Accepts "YYYY-MM-DD" and ISO timestamps starting with it
 * (revisions send back the stored value); rejects impossible days such as 2026-02-30.
 */
export function parseCalendarDay(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(T.*)?$/.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return valid ? date : null;
}

function lineItems(
  record: Record<string, unknown>,
  fallback?: InvoiceLineItem[],
): InvoiceLineItem[] {
  const value = record.lineItems;
  if (value === undefined && fallback !== undefined) return fallback;
  if (!Array.isArray(value)) throw new BodyError(INVALID_BODY);
  return value.map((item: unknown) => {
    if (!isRecord(item)) throw new BodyError(INVALID_BODY);
    return { text: text(item, 'text'), priceInCents: integer(item, 'priceInCents') };
  });
}

/**
 * Invoice content. `complete` (invoices and revisions) requires every field to be present with
 * the right type; drafts may omit fields, which default to empty values.
 */
function invoiceContent(raw: unknown, complete: boolean): InvoiceContent {
  if (!isRecord(raw)) throw new BodyError(INVALID_BODY);
  const d = complete ? undefined : '';
  return {
    salutation: text(raw, 'salutation', ''),
    name: text(raw, 'name'),
    street: text(raw, 'street', d),
    city: text(raw, 'city', d),
    title: text(raw, 'title', d),
    lineItems: lineItems(raw, complete ? undefined : []),
    vat: integer(raw, 'vat', complete ? undefined : 19),
    directDebit: flag(raw, 'directDebit', complete ? undefined : false),
    email: text(raw, 'email', ''),
    emailSalutation: text(raw, 'emailSalutation', ''),
  };
}

function recipientSelection(body: Record<string, unknown>): RecipientSelection {
  const selection: RecipientSelection = {};
  if (body.recipientId !== undefined && body.recipientId !== null) {
    selection.recipientId = integer(body, 'recipientId');
  }
  const data = body.recipientData;
  if (data !== undefined && data !== null) {
    if (!isRecord(data)) throw new BodyError(INVALID_BODY);
    const recipientData: RecipientData = {
      name: text(data, 'name'),
      street: text(data, 'street', ''),
      city: text(data, 'city', ''),
    };
    const email = optionalText(data, 'email');
    const salutation = optionalText(data, 'salutation');
    if (email) recipientData.email = email;
    if (salutation) recipientData.salutation = salutation;
    selection.recipientData = recipientData;
  }
  return selection;
}

/** The invoice date of a body: missing or empty means today. */
function invoiceDate(inputs: Record<string, unknown>, today: Date): Date {
  const raw = inputs.invoiceDate;
  const date = raw === undefined || raw === '' ? today : parseCalendarDay(raw);
  if (!date) throw new BodyError('Invalid invoice date');
  return date;
}

export interface InvoiceCreateBody extends RecipientSelection {
  inputs: InvoiceContent;
  invoiceDate: Date;
}

/** POST /api/invoice. A missing invoice date means today (UTC midnight of the server's day). */
export function parseInvoiceCreateBody(raw: unknown, today: Date): Parsed<InvoiceCreateBody> {
  return attempt(() => {
    if (!isRecord(raw) || !isRecord(raw.inputs)) throw new BodyError(INVALID_BODY);
    const inputs = invoiceContent(raw.inputs, true);
    return { ...recipientSelection(raw), inputs, invoiceDate: invoiceDate(raw.inputs, today) };
  });
}

/** POST /api/invoice/:id/revision: the revision needs its own invoice date. */
export function parseInvoiceRevisionBody(
  raw: unknown,
  today: Date,
): Parsed<{ inputs: InvoiceContent; invoiceDate: Date }> {
  return attempt(() => {
    if (!isRecord(raw) || !isRecord(raw.inputs)) throw new BodyError(INVALID_BODY);
    return {
      inputs: invoiceContent(raw.inputs, true),
      invoiceDate: invoiceDate(raw.inputs, today),
    };
  });
}

/** Today's calendar day on the server, as UTC midnight (the convention for stored dates). */
export function todayAsCalendarDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/** POST/PUT /api/invoice-draft: only the name is required. */
export function parseDraftBody(
  raw: unknown,
): Parsed<RecipientSelection & { inputs: InvoiceContent }> {
  return attempt(() => {
    if (!isRecord(raw) || !isRecord(raw.inputs)) throw new BodyError(INVALID_BODY);
    const name = raw.inputs.name;
    if (typeof name !== 'string' || !name.trim()) throw new BodyError('Name is required');
    return { ...recipientSelection(raw), inputs: invoiceContent(raw.inputs, false) };
  });
}

export interface DonorData {
  name: string;
  street: string;
  city: string;
}

export interface ReceiptBody {
  donorId?: number;
  donorData?: DonorData;
  inputs: ReceiptInputs;
  donationDate: Date;
}

function receiptInputs(raw: unknown): { inputs: ReceiptInputs; donationDate: Date } {
  if (!isRecord(raw)) throw new BodyError(INVALID_BODY);
  const inputs: ReceiptInputs = {
    name: text(raw, 'name'),
    street: text(raw, 'street'),
    city: text(raw, 'city'),
    letterSalutation: text(raw, 'letterSalutation', ''),
    addressSalutation: optionalText(raw, 'addressSalutation') ?? null,
    donationAmountCents: integer(raw, 'donationAmountCents'),
    donationDate: text(raw, 'donationDate', ''),
    withCoverLetter: flag(raw, 'withCoverLetter'),
    treasurer: text(raw, 'treasurer', ''),
    charitablePurpose: text(raw, 'charitablePurpose', ''),
    taxOfficeName: text(raw, 'taxOfficeName', ''),
    taxNumber: text(raw, 'taxNumber', ''),
    exemptionDate: text(raw, 'exemptionDate', ''),
    assessmentPeriod: text(raw, 'assessmentPeriod', ''),
  };
  if (inputs.donationAmountCents <= 0) {
    throw new BodyError('Donation amount must be greater than 0');
  }
  const donationDate = parseCalendarDay(inputs.donationDate);
  if (!donationDate) throw new BodyError('Invalid donation date');
  // Without these the Zuwendungsbestätigung is not valid for the tax office
  if (!inputs.taxOfficeName.trim()) throw new BodyError('Tax office is required');
  if (!inputs.taxNumber.trim()) throw new BodyError('Tax number is required');
  if (!inputs.exemptionDate.trim()) throw new BodyError('Exemption date is required');
  return { inputs, donationDate };
}

/** POST /api/donation-receipt */
export function parseReceiptCreateBody(raw: unknown): Parsed<ReceiptBody> {
  return attempt(() => {
    if (!isRecord(raw)) throw new BodyError(INVALID_BODY);
    const { inputs, donationDate } = receiptInputs(raw.inputs);
    const body: ReceiptBody = { inputs, donationDate };
    if (raw.donorId !== undefined && raw.donorId !== null) body.donorId = integer(raw, 'donorId');
    if (raw.donorData !== undefined && raw.donorData !== null) {
      if (!isRecord(raw.donorData)) throw new BodyError(INVALID_BODY);
      body.donorData = {
        name: text(raw.donorData, 'name'),
        street: text(raw.donorData, 'street', ''),
        city: text(raw.donorData, 'city', ''),
      };
    }
    return body;
  });
}

/** POST /api/donation-receipt/:id/revision */
export function parseReceiptRevisionBody(
  raw: unknown,
): Parsed<{ inputs: ReceiptInputs; donationDate: Date }> {
  return attempt(() => {
    if (!isRecord(raw)) throw new BodyError(INVALID_BODY);
    return receiptInputs(raw.inputs);
  });
}

/** Settings PUTs: only the known keys, and every given value must be text. */
export function parseTextSettings<K extends string>(
  raw: unknown,
  keys: readonly K[],
): Parsed<Partial<Record<K, string>>> {
  return attempt(() => {
    if (!isRecord(raw)) throw new BodyError(INVALID_BODY);
    const values: Partial<Record<K, string>> = {};
    for (const key of keys) {
      if (raw[key] === undefined) continue;
      values[key] = text(raw, key);
    }
    return values;
  });
}

/**
 * Master-data PATCHes. `required` fields may be omitted but, when given, must be non-blank
 * text; `nullable` fields may also be null.
 */
export function parseMasterDataPatch<R extends string, N extends string>(
  raw: unknown,
  required: readonly R[],
  nullable: readonly N[],
): Parsed<Partial<Record<R, string>> & Partial<Record<N, string | null>>> {
  return attempt(() => {
    if (!isRecord(raw)) throw new BodyError(INVALID_BODY);
    const values: Record<string, string | null> = {};
    for (const key of required) {
      if (raw[key] === undefined) continue;
      const value = text(raw, key);
      if (!value.trim()) throw new BodyError(`${capitalize(key)} is required`);
      values[key] = value;
    }
    for (const key of nullable) {
      const value = optionalText(raw, key);
      if (value !== undefined) values[key] = value;
    }
    return values as Partial<Record<R, string>> & Partial<Record<N, string | null>>;
  });
}

function capitalize(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** PATCH /api/invoice/:id/paid: `{ paid: boolean }`. */
export function parsePaidBody(raw: unknown): Parsed<boolean> {
  return attempt(() => {
    if (!isRecord(raw)) throw new BodyError(INVALID_BODY);
    return flag(raw, 'paid');
  });
}

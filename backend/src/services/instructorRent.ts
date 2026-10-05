import type {
  InstructorDto,
  InstructorInvoicePrefillDto,
  InstructorListItemDto,
  InstructorRentInputs,
  InvoiceRecipientDto,
  TimeBlock,
  TimeRange,
  Weekday,
} from 'shared';
import {
  calculateInstructorRent,
  DEFAULT_WEEKS_PER_MONTH,
} from '../../../shared/src/instructorRent.js';

export const WEEKS_PER_MONTH_KEY = 'instructorWeeksPerMonth';

export function parseWeeksPerMonth(value: string | undefined): number {
  const parsed = value === undefined || value.trim() === '' ? Number.NaN : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_WEEKS_PER_MONTH;
}

export interface RecipientData {
  name: string;
  street: string;
  city: string;
  email: string | null;
  salutation: string | null;
}

export interface InstructorSaveBody {
  recipientId?: number;
  recipientData?: RecipientData;
  inputs: InstructorRentInputs;
}

const INVALID_BODY = { error: 'Invalid request body' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string';
}

function parseTimeRange(value: unknown): TimeRange | null {
  if (!isRecord(value)) return null;
  const { start, end } = value;
  if (typeof start !== 'string' || typeof end !== 'string') return null;
  return { start, end };
}

function parseTimeBlock(value: unknown): TimeBlock | null {
  if (!isRecord(value)) return null;
  const range = parseTimeRange(value);
  const { weekday, breaks } = value;
  if (!range || typeof weekday !== 'string' || !Array.isArray(breaks)) return null;
  const parsedBreaks: TimeRange[] = [];
  for (const raw of breaks) {
    const parsed = parseTimeRange(raw);
    if (!parsed) return null;
    parsedBreaks.push(parsed);
  }
  // Unknown weekdays pass through here and are rejected by validateInstructorRent.
  return { weekday: weekday as Weekday, ...range, breaks: parsedBreaks };
}

function parseRecipientData(value: unknown): RecipientData | { error: string } {
  if (!isRecord(value)) return INVALID_BODY;
  const { name, street, city, email, salutation } = value;
  if (
    typeof name !== 'string' ||
    typeof street !== 'string' ||
    typeof city !== 'string' ||
    !isOptionalString(email) ||
    !isOptionalString(salutation)
  ) {
    return INVALID_BODY;
  }
  if (!name.trim()) return { error: 'Recipient name is required' };
  return { name, street, city, email: email || null, salutation: salutation || null };
}

/** Checks the request shape only; business rules are in validateInstructorRent. */
export function parseInstructorSaveBody(body: unknown): InstructorSaveBody | { error: string } {
  if (!isRecord(body)) return INVALID_BODY;
  const { recipientId, recipientData, hourlyRateCents, months, timeBlocks } = body;

  if (
    typeof hourlyRateCents !== 'number' ||
    typeof months !== 'number' ||
    !Array.isArray(timeBlocks)
  ) {
    return INVALID_BODY;
  }
  if (recipientId !== undefined && recipientId !== null && !Number.isInteger(recipientId)) {
    return INVALID_BODY;
  }

  const parsedBlocks: TimeBlock[] = [];
  for (const raw of timeBlocks) {
    const parsed = parseTimeBlock(raw);
    if (!parsed) return INVALID_BODY;
    parsedBlocks.push(parsed);
  }

  let parsedRecipient: RecipientData | undefined;
  if (recipientData !== undefined && recipientData !== null) {
    const result = parseRecipientData(recipientData);
    if ('error' in result) return result;
    parsedRecipient = result;
  }

  return {
    recipientId: typeof recipientId === 'number' ? recipientId : undefined,
    recipientData: parsedRecipient,
    inputs: { hourlyRateCents, months, timeBlocks: parsedBlocks },
  };
}

export interface InstructorRow {
  id: number;
  recipientId: number;
  hourlyRateCents: number;
  months: number;
  timeBlocks: string;
  createdAt: Date;
  updatedAt: Date;
  recipient: {
    id: number;
    name: string;
    street: string;
    city: string;
    email: string | null;
    salutation: string | null;
  };
}

export function toRecipientDto(recipient: InstructorRow['recipient']): InvoiceRecipientDto {
  return {
    id: recipient.id,
    name: recipient.name,
    street: recipient.street,
    city: recipient.city,
    email: recipient.email,
    salutation: recipient.salutation,
  };
}

export function toInputs(row: InstructorRow): InstructorRentInputs {
  return {
    hourlyRateCents: row.hourlyRateCents,
    months: row.months,
    timeBlocks: JSON.parse(row.timeBlocks) as TimeBlock[],
  };
}

export function toInstructorDto(row: InstructorRow, weeksPerMonth: number): InstructorDto {
  const inputs = toInputs(row);
  return {
    id: row.id,
    recipient: toRecipientDto(row.recipient),
    ...inputs,
    calculation: calculateInstructorRent(inputs, weeksPerMonth),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toListItem(row: InstructorRow, weeksPerMonth: number): InstructorListItemDto {
  const inputs = toInputs(row);
  return {
    id: row.id,
    name: row.recipient.name,
    hourlyRateCents: row.hourlyRateCents,
    months: row.months,
    calculation: calculateInstructorRent(inputs, weeksPerMonth),
  };
}

/** German decimal formatting without thousands separators (deterministic, no ICU dependency). */
export function formatDecimal(value: number, fractionDigits: number, trimZeros: boolean): string {
  let text = value.toFixed(fractionDigits);
  if (trimZeros && text.includes('.')) text = text.replace(/\.?0+$/, '');
  return text.replace('.', ',');
}

function monthsLabel(months: number): string {
  return months === 1 ? '1 Monat' : `${months} Monate`;
}

/**
 * Weekly hours, printed exactly so the line text reproduces the billed amount:
 * a trimmed decimal when it is exact with 2 decimals, otherwise hours and minutes.
 */
function formatWeeklyHours(netMinutesPerWeek: number): string {
  if (netMinutesPerWeek % 3 === 0) return `${formatDecimal(netMinutesPerWeek / 60, 2, true)} h`;
  return `${Math.floor(netMinutesPerWeek / 60)} h ${netMinutesPerWeek % 60} min`;
}

export function buildInvoiceLineText(inputs: InstructorRentInputs, weeksPerMonth: number): string {
  const { netMinutesPerWeek } = calculateInstructorRent(inputs, weeksPerMonth);
  const hours = formatWeeklyHours(netMinutesPerWeek);
  const weeks = formatDecimal(weeksPerMonth, 2, true);
  const rate = formatDecimal(inputs.hourlyRateCents / 100, 2, false);
  const label = monthsLabel(inputs.months);
  return `Raummiete ${label} (${hours}/Woche × ${weeks} Wochen × ${label} × ${rate} €)`;
}

export function buildInvoicePrefill(
  row: InstructorRow,
  weeksPerMonth: number,
): InstructorInvoicePrefillDto {
  const inputs = toInputs(row);
  return {
    recipient: toRecipientDto(row.recipient),
    title: 'Raummiete',
    lineItems: [
      {
        text: buildInvoiceLineText(inputs, weeksPerMonth),
        priceInCents: calculateInstructorRent(inputs, weeksPerMonth).totalCents,
      },
    ],
  };
}

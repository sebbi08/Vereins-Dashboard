/** Text encodings a bank export may use. */
export const BOOKING_ENCODINGS = ['utf-16le', 'utf-8', 'windows-1252'] as const;
export type BookingEncoding = (typeof BOOKING_ENCODINGS)[number];

export const BOOKING_DELIMITERS = [';', ',', '\t'] as const;
export type BookingDelimiter = (typeof BOOKING_DELIMITERS)[number];

/** The four columns the import needs, mapped to header names of the file. */
export const BOOKING_COLUMN_KEYS = ['date', 'payer', 'purpose', 'amount'] as const;
export type BookingColumnKey = (typeof BOOKING_COLUMN_KEYS)[number];
export type BookingColumns = Record<BookingColumnKey, string>;

export interface BookingImportSettings {
  encoding: BookingEncoding;
  delimiter: BookingDelimiter;
  /** Header names; '' when unset. */
  columns: BookingColumns;
}

/** The bank's export format; used until the user saves other values. */
export const DEFAULT_BOOKING_IMPORT_SETTINGS: BookingImportSettings = {
  encoding: 'utf-16le',
  delimiter: ';',
  columns: {
    date: 'Buchungstag',
    payer: 'Empfänger',
    purpose: 'Verwendungszweck',
    amount: 'Betrag',
  },
};

export const MAX_BOOKINGS_PER_MATCH = 10_000;
export const MAX_COLUMN_NAME_LENGTH = 200;

/** One incoming booking of the file. */
export interface Booking {
  /** 1-based data row in the file (the header is not counted). */
  row: number;
  /** YYYY-MM-DD */
  date: string;
  payer: string;
  purpose: string;
  /** Always positive: only incoming bookings are matched. */
  amountCents: number;
}

export type MatchLevel = 'CONFIDENT' | 'AMOUNT_ONLY' | 'AMOUNT_DIFFERS';
export type MatchReason = 'AMOUNT' | 'INVOICE_NUMBER' | 'NAME';

export interface MatchCandidate {
  invoiceId: number;
  invoiceNumber: string;
  recipientName: string;
  /** YYYY-MM-DD */
  invoiceDate: string;
  amountCents: number;
  reasons: MatchReason[];
  /** Booking amount minus invoice amount. */
  differenceCents: number;
}

export interface BookingMatch {
  booking: Booking;
  level: MatchLevel;
  candidates: MatchCandidate[];
}

export interface MatchResult {
  matches: BookingMatch[];
  unmatched: Booking[];
}

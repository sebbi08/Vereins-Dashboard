import type { BookingImportSettings, StoredBookingImportSettings } from 'shared';
import type { Prisma } from '../../prisma/generated/client.js';
import { DEFAULT_BOOKING_IMPORT_SETTINGS } from '../../../shared/src/invoicePayments.js';
import { prisma } from '../prismaClient.js';
import { parseBookingImportSettings, parseIsoDay } from './requestParsing.js';

const SETTINGS_KEY = 'bookingImport';
const LAST_DATE_KEY = 'bookingImportLastDate';

/** The stored import settings; the defaults when none are stored or they cannot be read. */
function readSettings(value: string | undefined): BookingImportSettings {
  if (value) {
    try {
      const parsed = parseBookingImportSettings(JSON.parse(value));
      if ('value' in parsed) return parsed.value;
    } catch {
      // unreadable JSON: fall back to the defaults
    }
  }
  return DEFAULT_BOOKING_IMPORT_SETTINGS;
}

/** How the last export was read, and the newest booking day of the import confirmed last. */
export async function loadBookingImportSettings(): Promise<StoredBookingImportSettings> {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: [SETTINGS_KEY, LAST_DATE_KEY] } },
  });
  const value = (key: string) => rows.find((row) => row.key === key)?.value;
  return {
    ...readSettings(value(SETTINGS_KEY)),
    lastBookingDate: parseIsoDay(value(LAST_DATE_KEY)),
  };
}

export async function saveBookingImportSettings(settings: BookingImportSettings): Promise<void> {
  const value = JSON.stringify(settings);
  await prisma.systemSetting.upsert({
    where: { key: SETTINGS_KEY },
    update: { value },
    create: { key: SETTINGS_KEY, value },
  });
}

/** Stored with the payments it belongs to, so both are saved or neither. */
export async function saveLastBookingDate(
  tx: Prisma.TransactionClient,
  date: string,
): Promise<void> {
  await tx.systemSetting.upsert({
    where: { key: LAST_DATE_KEY },
    update: { value: date },
    create: { key: LAST_DATE_KEY, value: date },
  });
}

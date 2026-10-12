import { createHash } from 'crypto';
import type { Booking } from 'shared';

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Identifies a bank booking across exports without storing it: a hash of its day, amount, payer
 * and purpose. The row is left out, it changes from file to file.
 */
export function bookingFingerprint(booking: Booking): string {
  const identity = JSON.stringify([
    booking.date,
    booking.amountCents,
    normalize(booking.payer),
    normalize(booking.purpose),
  ]);
  return createHash('sha256').update(identity).digest('hex');
}

/**
 * Sets aside the bookings that already paid an invoice. Identical bookings (same day, amount,
 * payer and purpose) are counted: two stored fingerprints set aside two of them, not more.
 */
export function splitUsedBookings(
  bookings: Booking[],
  storedFingerprints: string[],
): { open: Booking[]; used: Booking[] } {
  const left = new Map<string, number>();
  for (const fingerprint of storedFingerprints) {
    left.set(fingerprint, (left.get(fingerprint) ?? 0) + 1);
  }

  const open: Booking[] = [];
  const used: Booking[] = [];
  for (const booking of bookings) {
    const fingerprint = bookingFingerprint(booking);
    const count = left.get(fingerprint) ?? 0;
    if (count > 0) {
      left.set(fingerprint, count - 1);
      used.push(booking);
    } else {
      open.push(booking);
    }
  }
  return { open, used };
}

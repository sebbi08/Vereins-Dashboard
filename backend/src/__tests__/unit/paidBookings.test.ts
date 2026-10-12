import type { Booking } from 'shared';
import { describe, expect, it } from 'vitest';
import { bookingFingerprint, splitUsedBookings } from '../../services/paidBookings';

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    row: 1,
    date: '2026-09-10',
    payer: 'Meier, Thomas',
    purpose: 'Kursgebuehr Herbst',
    amountCents: 6000,
    ...overrides,
  };
}

describe('bookingFingerprint', () => {
  it('is the same for the same booking wherever it stands in a file', () => {
    expect(bookingFingerprint(booking({ row: 42 }))).toBe(bookingFingerprint(booking()));
  });

  it('ignores case and spacing differences in payer and purpose', () => {
    const again = booking({ payer: ' MEIER,  Thomas ', purpose: 'kursgebuehr   herbst' });
    expect(bookingFingerprint(again)).toBe(bookingFingerprint(booking()));
  });

  it('differs when the day, the amount, the payer or the purpose differs', () => {
    const fingerprints = [
      booking(),
      booking({ date: '2026-09-11' }),
      booking({ amountCents: 6001 }),
      booking({ payer: 'Meier, Tanja' }),
      booking({ purpose: 'Kursgebuehr Winter' }),
    ].map(bookingFingerprint);
    expect(new Set(fingerprints).size).toBe(5);
  });

  it('keeps payer and purpose apart', () => {
    const a = booking({ payer: 'Anna', purpose: 'Berta Carl' });
    const b = booking({ payer: 'Anna Berta', purpose: 'Carl' });
    expect(bookingFingerprint(a)).not.toBe(bookingFingerprint(b));
  });

  it('does not reveal the booking', () => {
    const fingerprint = bookingFingerprint(booking());
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('splitUsedBookings', () => {
  it('sets aside a booking whose fingerprint is stored', () => {
    const used = booking();
    const open = booking({ row: 2, payer: 'Petra Klein' });
    expect(splitUsedBookings([used, open], [bookingFingerprint(used)])).toEqual({
      open: [open],
      used: [used],
    });
  });

  it('sets aside only as many identical bookings as were used', () => {
    const first = booking();
    const second = booking({ row: 2 });
    const fingerprint = bookingFingerprint(first);

    expect(splitUsedBookings([first, second], [fingerprint])).toEqual({
      open: [second],
      used: [first],
    });
    expect(splitUsedBookings([first, second], [fingerprint, fingerprint])).toEqual({
      open: [],
      used: [first, second],
    });
  });

  it('keeps every booking when nothing is stored', () => {
    expect(splitUsedBookings([booking()], [])).toEqual({ open: [booking()], used: [] });
  });
});

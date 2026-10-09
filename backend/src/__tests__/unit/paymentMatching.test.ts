import type { Booking } from 'shared';
import { describe, expect, it } from 'vitest';
import {
  findInvoiceNumber,
  matchBookings,
  nameMatches,
  nameWords,
  type OpenInvoice,
} from '../../services/paymentMatching';

function invoice(overrides: Partial<OpenInvoice> = {}): OpenInvoice {
  return {
    id: 1,
    number: '12 / 2026',
    year: 2026,
    runningNumber: 12,
    invoiceDate: '2026-03-01',
    name: 'Musikschule Klangwelt GmbH',
    amountCents: 5950,
    ...overrides,
  };
}

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    row: 1,
    date: '2026-03-10',
    payer: 'Klangwelt Musikschule',
    purpose: 'Miete Maerz',
    amountCents: 5950,
    ...overrides,
  };
}

describe('findInvoiceNumber', () => {
  it.each([
    'RE 12 2026',
    'Nr. 012/2026',
    'ReNr. 12.26',
    'Rechnung 12_2026 Danke',
    'Rg.-Nr. 12/2026',
    'Rechnungs-Nr. 012/2026',
    'RE: 2026/12',
  ])('finds 12 / 2026 after a keyword in %j', (purpose) => {
    expect(findInvoiceNumber(purpose, 12, 2026)).toBe('STRONG');
  });

  it.each(['12/2026', '12 / 26', '12-2026', '2026/12'])(
    'reads 12 / 2026 without a keyword in %j as a weak hint',
    (purpose) => {
      expect(findInvoiceNumber(purpose, 12, 2026)).toBe('WEAK');
    },
  );

  it.each([
    ['Miete 03/2026', 3],
    ['Beitrag 2026/03', 3],
    ['Quartal 1/2026', 1],
    ['Halbjahr 2/2026', 2],
    ['KW 12 2026', 12],
    ['Beitrag Q2 2026', 2],
    ['Mitgliedsbeitrag 2026 2 Kinder', 2],
  ])('does not read the period in %j as invoice %i / 2026', (purpose, runningNumber) => {
    expect(findInvoiceNumber(purpose, runningNumber, 2026)).not.toBe('STRONG');
  });

  it.each([
    '112/2026',
    '12/2025',
    '1220 26',
    '202612',
    'DATUM 22.12.2026',
    '2026-12-05',
    'um 12.26 Uhr',
    'Weihnachtsfeier 26.12.',
    'Zeitraum 01.12.-26.12.',
  ])('finds no number 12 / 2026 in %j', (purpose) => {
    expect(findInvoiceNumber(purpose, 12, 2026)).toBeNull();
  });

  it('does not read the date or time of a card payment as an invoice number', () => {
    const purpose = 'ReNr 1011496 DATUM 22.03.2025, 12.21 UHR';
    expect(findInvoiceNumber(purpose, 3, 2025)).toBeNull();
    expect(findInvoiceNumber(purpose, 12, 2021)).toBeNull();
  });

  it('does not read a day-month date without a year as an invoice number', () => {
    expect(findInvoiceNumber('Kurs am 26.03. Danke', 3, 2026)).not.toBe('STRONG');
    expect(findInvoiceNumber('Rechnung vom 26.3.', 3, 2026)).not.toBe('STRONG');
  });

  it.each(['Rechnung 12', 'RE: 12', 'Rg. 12 Miete', 'Rechnungsnr. 012', 'Re-Nr 12'])(
    'reads %j as a weak hint',
    (purpose) => {
      expect(findInvoiceNumber(purpose, 12, 2026)).toBe('WEAK');
    },
  );

  it.each(['Mitgliedsnr 12', 'Rechnung 120', 'Rechnung 12/2025', 'Rechnung 12 2025', 'Kurs 12'])(
    'reads no hint in %j',
    (purpose) => {
      expect(findInvoiceNumber(purpose, 12, 2026)).toBeNull();
    },
  );
});

describe('nameWords', () => {
  it('normalises umlauts, case and punctuation and drops legal forms and short words', () => {
    expect(nameWords('Müller & Söhne GmbH & Co. KG')).toEqual(['mueller', 'soehne']);
    expect(nameWords('Turnverein Groß e.V.')).toEqual(['turnverein', 'gross']);
  });

  it('strips other accents and drops salutations and filler words', () => {
    expect(nameWords('René Roth')).toEqual(['rene', 'roth']);
    expect(nameWords('Familie Meier und Herr von der Linde')).toEqual(['meier', 'linde']);
    expect(nameWords('Frau Vom Das Die Verein Kahn')).toEqual(['kahn']);
  });
});

describe('nameMatches', () => {
  it('matches when the last word and at least half of the invoice name are in the payer', () => {
    expect(nameMatches('Musikschule Klangwelt GmbH', 'KLANGWELT MUSIKSCHULE')).toBe(true);
    expect(nameMatches('Anna Müller', 'Mueller, Anna')).toBe(true);
    expect(nameMatches('Anna Müller', 'A. Mueller')).toBe(true);
    expect(nameMatches('René Roth', 'RENE ROTH')).toBe(true);
    expect(nameMatches('Max Mustermann Peter Huber', 'Max Huber')).toBe(true);
  });

  it('does not match other names or names without usable words', () => {
    expect(nameMatches('Anna Müller', 'Stadtwerke Nord')).toBe(false);
    expect(nameMatches('Max Mustermann Peter Huber', 'Max Meier')).toBe(false);
    expect(nameMatches('AG', 'AG Nord')).toBe(false);
  });

  it('does not match on a shared first name or a shared generic word', () => {
    expect(nameMatches('Anna Müller', 'Anna Schmidt')).toBe(false);
    expect(nameMatches('Familie Meier', 'Familie Schulz')).toBe(false);
    expect(nameMatches('Musikschule Klangwelt GmbH', 'Musikschule am Park')).toBe(false);
  });
});

describe('matchBookings', () => {
  it('is confident when the amount and the name agree', () => {
    expect(matchBookings([booking()], [invoice()])).toEqual({
      matches: [
        {
          booking: booking(),
          level: 'CONFIDENT',
          candidates: [
            {
              invoiceId: 1,
              invoiceNumber: '12 / 2026',
              recipientName: 'Musikschule Klangwelt GmbH',
              invoiceDate: '2026-03-01',
              amountCents: 5950,
              reasons: ['AMOUNT', 'NAME'],
              differenceCents: 0,
            },
          ],
        },
      ],
      unmatched: [],
    });
  });

  it('is confident when the amount and the invoice number agree', () => {
    const result = matchBookings(
      [booking({ payer: 'Unbekannt', purpose: 'RE 12/2026' })],
      [invoice()],
    );
    expect(result.matches[0].level).toBe('CONFIDENT');
    expect(result.matches[0].candidates[0].reasons).toEqual(['AMOUNT', 'INVOICE_NUMBER']);
  });

  it('proposes an amount-only match, listing a weak number hint', () => {
    const result = matchBookings(
      [booking({ payer: 'Unbekannt', purpose: 'Rechnung 12' })],
      [invoice()],
    );
    expect(result.matches[0].level).toBe('AMOUNT_ONLY');
    expect(result.matches[0].candidates[0].reasons).toEqual(['AMOUNT', 'INVOICE_NUMBER']);
  });

  it('does not trust a period in the purpose that looks like an invoice number', () => {
    const march = invoice({
      id: 3,
      number: '3 / 2026',
      runningNumber: 3,
      name: 'Anna Schmidt',
      amountCents: 6000,
    });
    const yoga = invoice({
      id: 17,
      number: '17 / 2026',
      runningNumber: 17,
      name: 'Yoga Studio Sonne',
      amountCents: 6000,
    });
    const result = matchBookings(
      [booking({ payer: 'Petra Klein', purpose: 'Miete 03/2026 Yoga', amountCents: 6000 })],
      [march, yoga],
    );
    expect(result.matches[0].level).toBe('AMOUNT_ONLY');
    expect(result.matches[0].candidates.map((c) => c.invoiceId)).toEqual([3, 17]);
    expect(result.matches[0].candidates[0].reasons).toEqual(['AMOUNT', 'INVOICE_NUMBER']);
  });

  it('proposes nothing for a differing amount with a period that looks like the number', () => {
    const bare = booking({ payer: 'Unbekannt', purpose: 'Miete 12/2026', amountCents: 5850 });
    expect(matchBookings([bare], [invoice()]).unmatched).toEqual([bare]);
  });

  it('flags a differing amount when the invoice number is clearly given', () => {
    const result = matchBookings(
      [booking({ payer: 'Unbekannt', purpose: 'RE 12/2026', amountCents: 5850 })],
      [invoice()],
    );
    expect(result.matches[0].level).toBe('AMOUNT_DIFFERS');
    expect(result.matches[0].candidates[0]).toMatchObject({
      reasons: ['INVOICE_NUMBER'],
      differenceCents: -100,
    });
  });

  it('proposes nothing for a differing amount with only a name or a weak number', () => {
    const byName = booking({ amountCents: 5850 });
    const byWeakNumber = booking({ row: 2, payer: 'X', purpose: 'Rechnung 12', amountCents: 5850 });
    expect(matchBookings([byName, byWeakNumber], [invoice()])).toEqual({
      matches: [],
      unmatched: [byName, byWeakNumber],
    });
  });

  it('keeps only the best level of a booking', () => {
    const amountOnly = invoice({ id: 1, name: 'Ganz Anders' });
    const differs = invoice({ id: 2, number: '13 / 2026', runningNumber: 13, amountCents: 4000 });
    const result = matchBookings(
      [booking({ payer: 'Unbekannt', purpose: 'RE 13/2026' })],
      [amountOnly, differs],
    );
    expect(result.matches[0].level).toBe('AMOUNT_DIFFERS');
    expect(result.matches[0].candidates.map((c) => c.invoiceId)).toEqual([2]);

    const confident = invoice({ id: 3, number: '14 / 2026', runningNumber: 14 });
    const best = matchBookings([booking({ purpose: 'RE 13/2026' })], [differs, confident]);
    expect(best.matches[0].level).toBe('CONFIDENT');
    expect(best.matches[0].candidates.map((c) => c.invoiceId)).toEqual([3]);
  });

  it('lists every candidate of the best level, by invoice number', () => {
    const twelve = invoice({ id: 1, name: 'Erste Firma' });
    const three = invoice({ id: 2, number: '3 / 2026', runningNumber: 3, name: 'Zweite Firma' });
    const result = matchBookings([booking({ payer: 'Unbekannt' })], [twelve, three]);
    expect(result.matches[0].level).toBe('AMOUNT_ONLY');
    expect(result.matches[0].candidates.map((c) => c.invoiceId)).toEqual([2, 1]);
  });

  it('ignores invoices dated after the booking, but not on the same day', () => {
    const later = invoice({ invoiceDate: '2026-03-11' });
    expect(matchBookings([booking()], [later]).unmatched).toHaveLength(1);
    const sameDay = invoice({ invoiceDate: '2026-03-10' });
    expect(matchBookings([booking()], [sameDay]).matches).toHaveLength(1);
  });

  it('sorts confident first, then differing amounts, then amount only', () => {
    const result = matchBookings(
      [
        booking({ row: 1, payer: 'Unbekannt' }),
        booking({ row: 2 }),
        booking({ row: 3, payer: 'Unbekannt', purpose: 'RE 12/2026', amountCents: 100 }),
      ],
      [invoice()],
    );
    expect(result.matches.map((m) => m.booking.row)).toEqual([2, 3, 1]);
  });
});

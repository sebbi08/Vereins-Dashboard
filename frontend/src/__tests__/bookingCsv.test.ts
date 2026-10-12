import { describe, expect, it } from 'vitest';
import {
  decodeBookingFile,
  newestBookingDate,
  parseCsv,
  parseGermanAmount,
  parseGermanDate,
  readBookingTable,
  toBookings,
} from '../utils/bookingCsv';

function utf16le(text: string, bom = true): Uint8Array {
  const offset = bom ? 2 : 0;
  const bytes = new Uint8Array(offset + text.length * 2);
  if (bom) bytes.set([0xff, 0xfe]);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    bytes[offset + i * 2] = code & 0xff;
    bytes[offset + i * 2 + 1] = code >> 8;
  }
  return bytes;
}

describe('decodeBookingFile', () => {
  it('reads UTF-16 LE and drops the BOM', () => {
    expect(decodeBookingFile(utf16le('Empfänger;Betrag'), 'utf-16le')).toEqual({
      text: 'Empfänger;Betrag',
      encoding: 'utf-16le',
    });
  });

  it('lets a BOM win over the selected encoding', () => {
    expect(decodeBookingFile(utf16le('Grüße'), 'windows-1252')).toEqual({
      text: 'Grüße',
      encoding: 'utf-16le',
    });
    const utf8 = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('Grüße')]);
    expect(decodeBookingFile(utf8, 'utf-16le')).toEqual({ text: 'Grüße', encoding: 'utf-8' });
  });

  it('uses the selected encoding without a BOM', () => {
    const latin = new Uint8Array([0x4d, 0xfc, 0x6c, 0x6c, 0x65, 0x72]);
    expect(decodeBookingFile(latin, 'windows-1252')).toEqual({
      text: 'Müller',
      encoding: 'windows-1252',
    });
    expect(decodeBookingFile(utf16le('Ab', false), 'utf-16le').text).toBe('Ab');
  });
});

describe('parseCsv', () => {
  it('splits rows and fields with CRLF or LF', () => {
    expect(parseCsv('a;b\r\n1;2\r\n', ';')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(parseCsv('a,b\n1,2', ',')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(parseCsv('a\tb\n1\t2', '\t')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps delimiters, quotes and line breaks inside quoted fields', () => {
    expect(parseCsv('a;b\n"x;y";"he said ""hi"""\n"line 1\nline 2";2', ';')).toEqual([
      ['a', 'b'],
      ['x;y', 'he said "hi"'],
      ['line 1\nline 2', '2'],
    ]);
  });

  it('keeps empty fields and skips empty lines', () => {
    expect(parseCsv('a;;c\n\n1;2;3\n\n', ';')).toEqual([
      ['a', '', 'c'],
      ['1', '2', '3'],
    ]);
  });
});

describe('readBookingTable', () => {
  it('splits off the trimmed header', () => {
    expect(readBookingTable(' Buchungstag ;Betrag\n24.03.2025;1,00', ';')).toEqual({
      header: ['Buchungstag', 'Betrag'],
      rows: [['24.03.2025', '1,00']],
    });
    expect(readBookingTable('', ';')).toEqual({ header: [], rows: [] });
  });
});

describe('parseGermanAmount', () => {
  it.each([
    ['-1.284,00', -128400],
    ['53,55', 5355],
    ['1284', 128400],
    ['+5,5', 550],
    [' 59,50 € ', 5950],
    ['-0,00', 0],
    ['1.234.567,89', 123456789],
  ])('reads %j as %d cents', (value, cents) => {
    expect(parseGermanAmount(value)).toBe(cents);
  });

  it.each(['', 'abc', '12,345', '1,284.00', '12.34', '--5'])('cannot read %j', (value) => {
    expect(parseGermanAmount(value)).toBeNull();
  });
});

describe('parseGermanDate', () => {
  it.each([
    ['24.03.2025', '2025-03-24'],
    ['1.3.2025', '2025-03-01'],
    [' 05.06.2025 ', '2025-06-05'],
  ])('reads %j as %s', (value, iso) => {
    expect(parseGermanDate(value)).toBe(iso);
  });

  it.each(['31.02.2025', '2025-03-24', '24.03.25', ''])('cannot read %j', (value) => {
    expect(parseGermanDate(value)).toBeNull();
  });
});

describe('toBookings', () => {
  const header = ['Buchungstag', 'Empfänger', 'Verwendungszweck', 'Betrag'];
  const columns = {
    date: 'Buchungstag',
    payer: 'Empfänger',
    purpose: 'Verwendungszweck',
    amount: 'Betrag',
  };

  it('converts incoming bookings, drops outgoing ones and reports unreadable rows', () => {
    const rows = [
      ['24.03.2025', ' Verlag GmbH ', ' RE 12/2025 ', '59,50'],
      ['25.03.2025', 'Stadtwerke', 'Strom', '-120,00'],
      ['26.03.2025', 'Anna', 'Beitrag', 'zwölf'],
      ['32.03.2025', 'Bernd', 'Beitrag', '10,00'],
      ['27.03.2025', 'Kurz'],
    ];
    expect(toBookings(rows, header, columns)).toEqual({
      bookings: [
        {
          row: 1,
          date: '2025-03-24',
          payer: 'Verlag GmbH',
          purpose: 'RE 12/2025',
          amountCents: 5950,
        },
      ],
      skipped: [
        { row: 3, values: rows[2], reason: 'AMOUNT' },
        { row: 4, values: rows[3], reason: 'DATE' },
        { row: 5, values: rows[4], reason: 'AMOUNT' },
      ],
    });
  });

  it('reads the columns by name, whatever their order', () => {
    const reversed = [...header].reverse();
    const rows = [['10,00', 'Zweck', 'Zahler', '01.04.2025']];
    expect(toBookings(rows, reversed, columns).bookings).toEqual([
      { row: 1, date: '2025-04-01', payer: 'Zahler', purpose: 'Zweck', amountCents: 1000 },
    ]);
  });
});

describe('newestBookingDate', () => {
  const header = ['Buchungstag', 'Betrag'];

  it('finds the newest readable booking day of the file, outgoing bookings included', () => {
    const rows = [
      ['24.03.2025', '10,00'],
      ['31.03.2025', '-5,00'],
      ['kaputt', '1,00'],
      ['02.03.2025', 'abc'],
    ];
    expect(newestBookingDate(rows, header, 'Buchungstag')).toBe('2025-03-31');
  });

  it('is null when no row has a readable date', () => {
    expect(newestBookingDate([], header, 'Buchungstag')).toBeNull();
    expect(newestBookingDate([['kaputt', '1,00']], header, 'Buchungstag')).toBeNull();
    expect(newestBookingDate([['24.03.2025', '1,00']], header, 'Datum')).toBeNull();
  });
});

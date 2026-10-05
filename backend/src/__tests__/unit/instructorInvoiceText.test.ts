import { describe, expect, it } from 'vitest';
import {
  buildInstructorInvoiceTextValues,
  DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE,
  effectiveInstructorInvoiceTemplate,
  findUnknownPlaceholders,
  formatDecimal,
  formatEuro,
  formatSchedule,
  INSTRUCTOR_INVOICE_PLACEHOLDERS,
  renderInstructorInvoiceText,
  validateInstructorInvoiceTemplate,
} from '../../../../shared/src/instructorInvoiceText';
import type { InstructorRentInputs, TimeBlock } from '../../../../shared/src/instructorRent';

const example: InstructorRentInputs = {
  hourlyRateCents: 1250,
  months: 6,
  timeBlocks: [
    { weekday: 'MO', start: '14:00', end: '18:00', breaks: [{ start: '16:00', end: '16:30' }] },
    { weekday: 'DO', start: '09:00', end: '13:00', breaks: [] },
  ],
};

describe('INSTRUCTOR_INVOICE_PLACEHOLDERS', () => {
  it('lists the eight placeholders in order', () => {
    expect(INSTRUCTOR_INVOICE_PLACEHOLDERS.map((p) => p.key)).toEqual([
      'name',
      'monate',
      'stunden_pro_woche',
      'wochen_pro_monat',
      'stundensatz',
      'betrag_pro_monat',
      'betrag_gesamt',
      'zeiten',
    ]);
    expect(INSTRUCTOR_INVOICE_PLACEHOLDERS.every((p) => p.description.length > 0)).toBe(true);
  });
});

describe('formatDecimal', () => {
  it.each([
    [7.5, 2, true, '7,5'],
    [3.25, 2, true, '3,25'],
    [8, 2, true, '8'],
    [10, 2, true, '10'],
    [1 / 3, 2, true, '0,33'],
    [12, 2, false, '12,00'],
    [12.5, 2, false, '12,50'],
  ])('formats %s', (value, digits, trim, expected) => {
    expect(formatDecimal(value, digits, trim)).toBe(expected);
  });
});

describe('formatEuro', () => {
  it.each([
    [0, '0,00 €'],
    [1250, '12,50 €'],
    [30469, '304,69 €'],
    [182813, '1.828,13 €'],
    [123456789, '1.234.567,89 €'],
  ])('formats %s cents', (cents, expected) => {
    expect(formatEuro(cents)).toBe(expected);
  });
});

describe('formatSchedule', () => {
  it('sorts blocks by weekday and start, and breaks by start', () => {
    const blocks: TimeBlock[] = [
      { weekday: 'DO', start: '09:00', end: '13:00', breaks: [] },
      {
        weekday: 'MO',
        start: '14:00',
        end: '18:00',
        breaks: [
          { start: '17:00', end: '17:10' },
          { start: '16:00', end: '16:30' },
        ],
      },
      { weekday: 'MO', start: '08:00', end: '10:00', breaks: [] },
    ];
    expect(formatSchedule(blocks)).toBe(
      'Mo 08:00–10:00\nMo 14:00–18:00 (Pause 16:00–16:30, 17:00–17:10)\nDo 09:00–13:00',
    );
  });

  it('is empty for an empty schedule', () => {
    expect(formatSchedule([])).toBe('');
  });
});

describe('buildInstructorInvoiceTextValues', () => {
  it('formats every value for the example', () => {
    expect(buildInstructorInvoiceTextValues('Anna Alt', example, 3.25)).toEqual({
      name: 'Anna Alt',
      monate: '6 Monate',
      stunden_pro_woche: '7,5 h',
      wochen_pro_monat: '3,25',
      stundensatz: '12,50 €',
      betrag_pro_monat: '304,69 €',
      betrag_gesamt: '1.828,13 €',
      zeiten: 'Mo 14:00–18:00 (Pause 16:00–16:30)\nDo 09:00–13:00',
    });
  });

  it('uses the singular for one month and hours with minutes when not exact', () => {
    const values = buildInstructorInvoiceTextValues(
      'Anna Alt',
      {
        ...example,
        months: 1,
        timeBlocks: [
          {
            weekday: 'MO',
            start: '14:00',
            end: '18:00',
            breaks: [{ start: '16:00', end: '16:10' }],
          },
          { weekday: 'DO', start: '09:00', end: '13:00', breaks: [] },
        ],
      },
      4,
    );
    expect(values.monate).toBe('1 Monat');
    expect(values.stunden_pro_woche).toBe('7 h 50 min');
    expect(values.wochen_pro_monat).toBe('4');
  });

  it('gives an empty schedule text without blocks', () => {
    expect(buildInstructorInvoiceTextValues('A', { ...example, timeBlocks: [] }, 3.25).zeiten).toBe(
      '',
    );
  });
});

describe('renderInstructorInvoiceText', () => {
  const values = buildInstructorInvoiceTextValues('Anna Alt', example, 3.25);

  it('renders the default template as two lines', () => {
    expect(renderInstructorInvoiceText(DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE, values)).toBe(
      'Raummiete 6 Monate\n7,5 h/Woche × 3,25 Wochen × 6 Monate × 12,50 €',
    );
  });

  it('trims trailing whitespace of the rendered text', () => {
    const emptySchedule = buildInstructorInvoiceTextValues(
      'Anna Alt',
      { ...example, timeBlocks: [] },
      3.25,
    );
    expect(renderInstructorInvoiceText('Miete {name}\n{zeiten}\n', emptySchedule)).toBe(
      'Miete Anna Alt',
    );
    expect(renderInstructorInvoiceText('A  \n\n', values)).toBe('A');
  });

  it('replaces every placeholder, also repeated ones', () => {
    expect(
      renderInstructorInvoiceText(
        '{name}: {betrag_gesamt} ({betrag_pro_monat}/Monat, {name})\n{zeiten}',
        values,
      ),
    ).toBe(
      'Anna Alt: 1.828,13 € (304,69 €/Monat, Anna Alt)\nMo 14:00–18:00 (Pause 16:00–16:30)\nDo 09:00–13:00',
    );
  });

  it('keeps braces that are not placeholders', () => {
    expect(renderInstructorInvoiceText('{ } {12} {Name} {name}', values)).toBe(
      '{ } {12} {Name} Anna Alt',
    );
  });

  it('normalizes Windows line endings', () => {
    expect(renderInstructorInvoiceText('a\r\nb\rc', values)).toBe('a\nb\nc');
  });
});

describe('findUnknownPlaceholders', () => {
  it('lists unknown placeholders once, in order', () => {
    expect(findUnknownPlaceholders('{monat} {name} {xyz} {monat}')).toEqual(['{monat}', '{xyz}']);
  });

  it('ignores known placeholders and non-placeholder braces', () => {
    expect(findUnknownPlaceholders('{name} { } {12} {Name}')).toEqual([]);
  });
});

describe('validateInstructorInvoiceTemplate', () => {
  it('accepts the default template', () => {
    expect(validateInstructorInvoiceTemplate(DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE)).toBeNull();
  });

  it('reports unknown placeholders', () => {
    expect(validateInstructorInvoiceTemplate('Raummiete {monat} {xyz}')).toBe(
      'Unknown placeholders: {monat}, {xyz}',
    );
  });

  it('limits the length to 2000 characters after normalizing line endings', () => {
    expect(validateInstructorInvoiceTemplate('a'.repeat(2000))).toBeNull();
    expect(validateInstructorInvoiceTemplate('a'.repeat(2001))).toBe(
      'Invoice text must be at most 2000 characters',
    );
    expect(validateInstructorInvoiceTemplate('a\r\n'.repeat(1000))).toBeNull();
  });
});

describe('effectiveInstructorInvoiceTemplate', () => {
  it.each([null, undefined, '', '   \n  '])('falls back to the default for %j', (value) => {
    expect(effectiveInstructorInvoiceTemplate(value)).toBe(DEFAULT_INSTRUCTOR_INVOICE_TEMPLATE);
  });

  it('keeps a custom template', () => {
    expect(effectiveInstructorInvoiceTemplate('Miete {name}')).toBe('Miete {name}');
  });
});

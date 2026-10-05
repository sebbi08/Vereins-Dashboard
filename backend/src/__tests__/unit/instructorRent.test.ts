import { describe, expect, it } from 'vitest';
import {
  blockNetMinutes,
  calculateInstructorRent,
  DEFAULT_WEEKS_PER_MONTH,
  type InstructorRentInputs,
  type TimeBlock,
  validateInstructorRent,
  validateWeeksPerMonth,
  WEEKDAYS,
} from '../../../../shared/src/instructorRent';

function block(
  weekday: TimeBlock['weekday'],
  start: string,
  end: string,
  breaks: [string, string][] = [],
): TimeBlock {
  return { weekday, start, end, breaks: breaks.map(([s, e]) => ({ start: s, end: e })) };
}

describe('constants', () => {
  it('lists weekdays Monday to Sunday', () => {
    expect(WEEKDAYS).toEqual(['MO', 'DI', 'MI', 'DO', 'FR', 'SA', 'SO']);
  });

  it('defaults to 3.25 weeks per month', () => {
    expect(DEFAULT_WEEKS_PER_MONTH).toBe(3.25);
  });
});

describe('blockNetMinutes', () => {
  it('returns the block length when there are no breaks', () => {
    expect(blockNetMinutes(block('MO', '08:00', '12:00'))).toBe(240);
  });

  it('subtracts every break', () => {
    expect(
      blockNetMinutes(
        block('MO', '08:00', '16:00', [
          ['10:00', '10:15'],
          ['12:00', '12:45'],
        ]),
      ),
    ).toBe(420);
  });
});

describe('calculateInstructorRent', () => {
  it('sums net minutes across blocks and weekdays', () => {
    const result = calculateInstructorRent(
      {
        hourlyRateCents: 1200,
        months: 6,
        timeBlocks: [
          block('MO', '14:00', '18:00', [['16:00', '16:30']]),
          block('DO', '09:00', '13:00'),
        ],
      },
      3.25,
    );
    expect(result).toEqual({ netMinutesPerWeek: 450, monthlyCents: 29250, totalCents: 175500 });
  });

  it('returns zero for an empty schedule', () => {
    expect(
      calculateInstructorRent({ hourlyRateCents: 1200, months: 3, timeBlocks: [] }, 3.25),
    ).toEqual({ netMinutesPerWeek: 0, monthlyCents: 0, totalCents: 0 });
  });

  it('rounds only once at the end', () => {
    const result = calculateInstructorRent(
      { hourlyRateCents: 1234, months: 6, timeBlocks: [block('MO', '08:00', '15:30')] },
      3.25,
    );
    expect(result.netMinutesPerWeek).toBe(450);
    expect(result.monthlyCents).toBe(30079); // 30078.75
    expect(result.totalCents).toBe(180473); // 180472.5 — not 30079 × 6 = 180474
  });

  it('uses the given weeks per month', () => {
    const result = calculateInstructorRent(
      { hourlyRateCents: 1000, months: 2, timeBlocks: [block('SA', '10:00', '11:00')] },
      4,
    );
    expect(result.monthlyCents).toBe(4000);
    expect(result.totalCents).toBe(8000);
  });
});

function inputs(timeBlocks: TimeBlock[], overrides: Partial<InstructorRentInputs> = {}) {
  return { hourlyRateCents: 1200, months: 6, timeBlocks, ...overrides };
}

describe('validateInstructorRent', () => {
  it('accepts a valid schedule', () => {
    expect(
      validateInstructorRent(inputs([block('MO', '08:00', '12:00', [['10:00', '10:15']])])),
    ).toEqual([]);
  });

  it('accepts an empty schedule', () => {
    expect(validateInstructorRent(inputs([]))).toEqual([]);
  });

  it('accepts touching blocks and touching breaks', () => {
    expect(
      validateInstructorRent(
        inputs([
          block('MO', '08:00', '10:00', [
            ['08:00', '08:30'],
            ['08:30', '09:00'],
          ]),
          block('MO', '10:00', '12:00'),
        ]),
      ),
    ).toEqual([]);
  });

  it('allows the same times on different weekdays', () => {
    expect(
      validateInstructorRent(
        inputs([block('MO', '08:00', '12:00'), block('DI', '08:00', '12:00')]),
      ),
    ).toEqual([]);
  });

  it.each([
    ['8:00', '12:00', 'timeBlocks.0.start'],
    ['08:00', '24:00', 'timeBlocks.0.end'],
    ['', '12:00', 'timeBlocks.0.start'],
    ['08:60', '12:00', 'timeBlocks.0.start'],
  ])('rejects invalid time format %s–%s', (start, end, path) => {
    expect(validateInstructorRent(inputs([block('MO', start, end)]))).toEqual([
      { path, message: 'Invalid time format (HH:MM)' },
    ]);
  });

  it('rejects a block whose start is not before its end', () => {
    expect(validateInstructorRent(inputs([block('MO', '12:00', '12:00')]))).toEqual([
      { path: 'timeBlocks.0', message: 'Start must be before end' },
    ]);
  });

  it('rejects an unknown weekday', () => {
    const bad = { ...block('MO', '08:00', '09:00'), weekday: 'XX' } as unknown as TimeBlock;
    expect(validateInstructorRent(inputs([bad]))).toEqual([
      { path: 'timeBlocks.0.weekday', message: 'Invalid weekday' },
    ]);
  });

  it('rejects an invalid break time format', () => {
    expect(
      validateInstructorRent(inputs([block('MO', '08:00', '12:00', [['10:00', '']])])),
    ).toEqual([{ path: 'timeBlocks.0.breaks.0.end', message: 'Invalid time format (HH:MM)' }]);
  });

  it('rejects a break whose start is not before its end', () => {
    expect(
      validateInstructorRent(inputs([block('MO', '08:00', '12:00', [['10:30', '10:00']])])),
    ).toEqual([{ path: 'timeBlocks.0.breaks.0', message: 'Break start must be before break end' }]);
  });

  it('rejects a break outside its block', () => {
    expect(
      validateInstructorRent(inputs([block('MO', '08:00', '12:00', [['11:45', '12:15']])])),
    ).toEqual([{ path: 'timeBlocks.0.breaks.0', message: 'Break must be within the time block' }]);
  });

  it('rejects overlapping breaks on the later break', () => {
    expect(
      validateInstructorRent(
        inputs([
          block('MO', '08:00', '12:00', [
            ['10:00', '10:30'],
            ['10:15', '10:45'],
          ]),
        ]),
      ),
    ).toEqual([{ path: 'timeBlocks.0.breaks.1', message: 'Breaks must not overlap' }]);
  });

  it('rejects overlapping blocks on the same day on the later block', () => {
    expect(
      validateInstructorRent(
        inputs([
          block('MO', '08:00', '12:00'),
          block('DI', '08:00', '12:00'),
          block('MO', '11:00', '13:00'),
        ]),
      ),
    ).toEqual([{ path: 'timeBlocks.2', message: 'Time blocks on the same day must not overlap' }]);
  });

  it.each([0, -100, 12.5, Number.NaN])('rejects hourly rate %s', (hourlyRateCents) => {
    expect(validateInstructorRent(inputs([], { hourlyRateCents }))).toEqual([
      { path: 'hourlyRateCents', message: 'Hourly rate must be greater than 0' },
    ]);
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects months %s', (months) => {
    expect(validateInstructorRent(inputs([], { months }))).toEqual([
      { path: 'months', message: 'Months must be a whole number of at least 1' },
    ]);
  });
});

describe('validateWeeksPerMonth', () => {
  it('accepts positive numbers', () => {
    expect(validateWeeksPerMonth(3.25)).toBeNull();
    expect(validateWeeksPerMonth(4)).toBeNull();
    expect(validateWeeksPerMonth(4.33)).toBeNull();
  });

  it('rejects more than 2 decimals', () => {
    expect(validateWeeksPerMonth(4.333)).toBe('Weeks per month may have at most 2 decimals');
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects %s', (value) => {
    expect(validateWeeksPerMonth(value)).toBe('Weeks per month must be greater than 0');
  });
});

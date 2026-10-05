import { describe, expect, it } from 'vitest';
import {
  blockNetMinutes,
  calculateInstructorRent,
  DEFAULT_WEEKS_PER_MONTH,
  type TimeBlock,
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

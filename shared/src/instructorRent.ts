export type Weekday = 'MO' | 'DI' | 'MI' | 'DO' | 'FR' | 'SA' | 'SO';

export const WEEKDAYS: readonly Weekday[] = ['MO', 'DI', 'MI', 'DO', 'FR', 'SA', 'SO'];

export const DEFAULT_WEEKS_PER_MONTH = 3.25;

export interface TimeRange {
  start: string; // "HH:MM"
  end: string; // "HH:MM"
}

export interface TimeBlock extends TimeRange {
  weekday: Weekday;
  breaks: TimeRange[];
}

export interface InstructorRentInputs {
  hourlyRateCents: number;
  months: number;
  timeBlocks: TimeBlock[];
}

export interface InstructorRentResult {
  netMinutesPerWeek: number;
  monthlyCents: number;
  totalCents: number;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function rangeMinutes(range: TimeRange): number {
  return toMinutes(range.end) - toMinutes(range.start);
}

export function blockNetMinutes(block: TimeBlock): number {
  const breakMinutes = block.breaks.reduce((sum, b) => sum + rangeMinutes(b), 0);
  return rangeMinutes(block) - breakMinutes;
}

/** Rounds once at the end so totalCents is exact, not monthlyCents × months. */
export function calculateInstructorRent(
  inputs: InstructorRentInputs,
  weeksPerMonth: number,
): InstructorRentResult {
  const netMinutesPerWeek = inputs.timeBlocks.reduce((sum, b) => sum + blockNetMinutes(b), 0);
  const monthlyCentsExact = (netMinutesPerWeek * inputs.hourlyRateCents * weeksPerMonth) / 60;
  const totalCentsExact =
    (netMinutesPerWeek * inputs.hourlyRateCents * weeksPerMonth * inputs.months) / 60;
  return {
    netMinutesPerWeek,
    monthlyCents: Math.round(monthlyCentsExact),
    totalCents: Math.round(totalCentsExact),
  };
}

export interface ValidationIssue {
  path: string;
  message: string;
}

const INVALID_TIME = 'Invalid time format (HH:MM)';

function overlaps(a: TimeRange, b: TimeRange): boolean {
  return toMinutes(a.start) < toMinutes(b.end) && toMinutes(b.start) < toMinutes(a.end);
}

function rangeIssues(range: TimeRange, path: string, orderMessage: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isValidTime(range.start)) issues.push({ path: `${path}.start`, message: INVALID_TIME });
  if (!isValidTime(range.end)) issues.push({ path: `${path}.end`, message: INVALID_TIME });
  if (issues.length === 0 && toMinutes(range.start) >= toMinutes(range.end)) {
    issues.push({ path, message: orderMessage });
  }
  return issues;
}

function breakIssues(block: TimeBlock, blockPath: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const validBreaks: TimeRange[] = [];
  block.breaks.forEach((brk, j) => {
    const path = `${blockPath}.breaks.${j}`;
    const own = rangeIssues(brk, path, 'Break start must be before break end');
    if (own.length > 0) {
      issues.push(...own);
      return;
    }
    if (
      toMinutes(brk.start) < toMinutes(block.start) ||
      toMinutes(brk.end) > toMinutes(block.end)
    ) {
      issues.push({ path, message: 'Break must be within the time block' });
      return;
    }
    if (validBreaks.some((other) => overlaps(other, brk))) {
      issues.push({ path, message: 'Breaks must not overlap' });
      return;
    }
    validBreaks.push(brk);
  });
  return issues;
}

export function validateInstructorRent(inputs: InstructorRentInputs): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!Number.isInteger(inputs.hourlyRateCents) || inputs.hourlyRateCents <= 0) {
    issues.push({ path: 'hourlyRateCents', message: 'Hourly rate must be greater than 0' });
  }
  if (!Number.isInteger(inputs.months) || inputs.months < 1) {
    issues.push({ path: 'months', message: 'Months must be a whole number of at least 1' });
  }

  const validBlocks: { index: number; block: TimeBlock }[] = [];
  inputs.timeBlocks.forEach((block, i) => {
    const path = `timeBlocks.${i}`;
    if (!WEEKDAYS.includes(block.weekday)) {
      issues.push({ path: `${path}.weekday`, message: 'Invalid weekday' });
    }
    const own = rangeIssues(block, path, 'Start must be before end');
    if (own.length > 0) {
      issues.push(...own);
      return;
    }
    issues.push(...breakIssues(block, path));
    validBlocks.push({ index: i, block });
  });

  validBlocks.forEach(({ index, block }, k) => {
    const clash = validBlocks
      .slice(0, k)
      .some((other) => other.block.weekday === block.weekday && overlaps(other.block, block));
    if (clash) {
      issues.push({
        path: `timeBlocks.${index}`,
        message: 'Time blocks on the same day must not overlap',
      });
    }
  });

  return issues;
}

export function validateWeeksPerMonth(value: number): string | null {
  if (!Number.isFinite(value) || value <= 0) return 'Weeks per month must be greater than 0';
  if (Math.abs(value * 100 - Math.round(value * 100)) >= 1e-9) {
    return 'Weeks per month may have at most 2 decimals';
  }
  return null;
}

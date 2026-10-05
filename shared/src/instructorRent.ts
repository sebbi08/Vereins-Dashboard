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

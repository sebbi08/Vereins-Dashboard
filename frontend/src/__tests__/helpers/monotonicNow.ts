/**
 * A Date.now that never goes backwards.
 *
 * WSL2 and VMs step the wall clock backwards during time sync. Vue drops an event whose
 * `_vts` timestamp is not after its listener's attach time, and Vue Test Utils stamps triggered
 * events with Date.now() + 1, so a backward step between mount and trigger silently swallowed
 * clicks and inputs and made random tests fail. Freezing the clock for the length of the step
 * keeps every stamp at or after the previous one.
 *
 * `vi.useFakeTimers({ toFake: ['Date'] })` swaps the whole Date object and restores this one
 * afterwards, so tests with a fake date are unaffected.
 */
const realNow = Date.now.bind(Date);
let last = 0;
/** Test-only simulated clock step, in milliseconds. */
let offset = 0;

function monotonicNow(): number {
  last = Math.max(last, realNow() + offset);
  return last;
}

export function installMonotonicNow(): void {
  Date.now = monotonicNow;
}

export function isMonotonicNowInstalled(): boolean {
  return Date.now === monotonicNow;
}

/** Pretends the wall clock stepped by `ms` (negative = backwards). */
export function stepWallClock(ms: number): void {
  offset += ms;
}

export function resetWallClock(): void {
  offset = 0;
}

// Sim time: one tick is one in-game minute. At 1x speed a day lasts about 6 real minutes
// (spec section 3), so the presentation layer will advance 4 ticks per real second.

export const TICKS_PER_HOUR = 60;
export const TICKS_PER_DAY = 1440;
export const DAYS_PER_SEASON = 7;
export const DAWN_MINUTE = 7 * 60;

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Season = (typeof SEASONS)[number];

/** Day number, starting at 1. */
export function dayOf(tick: number): number {
  return Math.floor(tick / TICKS_PER_DAY) + 1;
}

export function minuteOf(tick: number): number {
  return ((tick % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY;
}

export function seasonOf(tick: number): Season {
  const idx = Math.floor((dayOf(tick) - 1) / DAYS_PER_SEASON) % SEASONS.length;
  return SEASONS[idx] as Season;
}

/** Tick for a given day (1-based) and clock time. */
export function at(day: number, hour: number, minute = 0): number {
  return (day - 1) * TICKS_PER_DAY + hour * 60 + minute;
}

export function clock(tick: number): string {
  const m = minuteOf(tick);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Is minute-of-day m inside [start, end), where the window may wrap past midnight? */
export function inWindow(m: number, start: number, end: number): boolean {
  return start <= end ? m >= start && m < end : m >= start || m < end;
}

/** The next tick at or after `from` whose minute-of-day is `minute`. */
export function nextAt(from: number, minute: number): number {
  const m = minuteOf(from);
  const delta = (minute - m + TICKS_PER_DAY) % TICKS_PER_DAY;
  return from + (delta === 0 ? TICKS_PER_DAY : delta);
}

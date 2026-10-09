// How a town going short feels (bar round 3).
import { dayOf } from './time.js';
import type { SimState } from './types.js';

/**
 * A town going short weighs on everyone, fed or not, more each day it goes on (bar round 3: eight
 * nights of an empty larder left mean mood at 0.8). Gone a day after the last short meal.
 */
export function townHunger(state: SimState): number {
  const run = state.shortRun ?? 0;
  if (run === 0 || state.lastShortageDay < dayOf(state.tick) - 1) return 0;
  // Past ten days it is how things are: resignation, at half the weight (the year soak's neglected
  // towns otherwise emptied under a famine that never ends).
  return Math.min(0.14, 0.035 * run) * (run > 10 ? 0.5 : 1);
}


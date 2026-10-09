// How a town going short feels (bar round 3).
import { dayOf, seasonOf } from './time.js';
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


/**
 * Being ignored weighs a little every day (bar round 4: a neglected town went from 0.75 to 0.70 in
 * three weeks while people left): each ask of theirs left waiting over a day, and each that lapsed
 * in the last fortnight. Up to 0.15 together.
 */
export function waitingOnYou(state: SimState, who: string): number {
  let waiting = 0;
  let lapsed = 0;
  for (const q of state.requests) {
    if (q.by !== who) continue;
    if (q.status === 'open' && state.tick - q.postedTick > 1440) waiting++;
    else if (q.status === 'lapsed' && state.tick - (q.closedTick ?? 0) < 14 * 1440) lapsed++;
  }
  return Math.min(0.06, 0.02 * waiting) + Math.min(0.09, 0.03 * lapsed);
}

/** A day's meals for the town: two each (four in winter, when appetites double). */
export function dayOfMeals(state: SimState): number {
  let n = 0;
  for (const id of state.order) if (!state.residents[id]?.departed) n++;
  const winter = seasonOf(state.tick) === 'winter';
  return n * 2 * 0.5 * (winter ? 2 : 1);
}

/**
 * A larder below a day's meals is a worry everyone shares (bar round 4: six food for eleven people
 * and "A quiet night. Nothing needs you."). Up to 0.06, nothing once there is a day's meals put by.
 */
export function lowLarder(state: SimState): number {
  const need = dayOfMeals(state);
  if (need <= 0) return 0;
  const have = state.stock.food + (state.granary ?? 0);
  return have >= need ? 0 : 0.06 * (1 - have / need);
}

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
 * and "A quiet night. Nothing needs you."). Up to LOW_LARDER_WEIGHT (bar round 6: 0.1, was 0.06), nothing once there is a day's meals put by.
 */
/** Bar round 6: a bare larder weighs more once a steward's new bakery answers the asks (a hungry week moved mood 0.009 on one seed). */
export const LOW_LARDER_WEIGHT = 0.1;

export function lowLarder(state: SimState): number {
  const need = dayOfMeals(state);
  if (need <= 0) return 0;
  const larder = state.stock.food;
  if (larder >= need) return 0;
  const short = LOW_LARDER_WEIGHT * (1 - larder / need);
  const granary = state.granary ?? 0;
  // In winter the granary is the larder. Before it, a town living off the winter stores worries at
  // half weight (bar round 7: with every food place gone in autumn, nobody minded).
  if (seasonOf(state.tick) === 'winter') return larder + granary >= need ? 0 : LOW_LARDER_WEIGHT * (1 - (larder + granary) / need);
  return granary >= need - larder ? EARLY_STORES_SHARE * short : short;
}

/** Bar round 7: eating the winter stores before winter weighs this share of a low larder. */
export const EARLY_STORES_SHARE = 0.5;

/** A larder below a day's meals with nothing in the granary to cover it: the low-larder cap on standing and smaller thanks key on this. */
export function bareLarder(state: SimState): boolean {
  const need = dayOfMeals(state);
  return need > 0 && state.stock.food + (state.granary ?? 0) < need;
}

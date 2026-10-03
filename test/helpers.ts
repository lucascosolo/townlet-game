import { residentDef } from '../src/content/residents.js';
import type { MindContext } from '../src/sim/mind/mind.js';
import type { SimEvent, SimState } from '../src/sim/types.js';

/** A bare mind context over a state, collecting events, for unit tests of mind functions. */
export function testContext(state: SimState, tick = 0): MindContext & { events: SimEvent[]; at(t: number): void } {
  const events: SimEvent[] = [];
  const ctx = {
    state,
    tick,
    worked: new Set<number>(),
    events,
    emit: (e: SimEvent) => events.push(e),
    def: residentDef,
    at(t: number) {
      ctx.tick = t;
    },
  };
  return ctx;
}

export const SEEDS = [1, 2, 3, 4, 5];

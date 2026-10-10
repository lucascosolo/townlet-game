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

/**
 * Audit 2026-10-10: favours asked the way a player asks, of a different resident each morning,
 * rather than the favours steward's "whoever is likeliest to say yes" (which is never refused).
 * Returns each answer's reason, or 'yes'.
 */
export function askLikeAPlayer(sim: import('../src/sim/sim.js').Simulation, seed: number, days = 30): string[] {
  const answers: string[] = [];
  for (let d = 2; d <= days; d++) {
    sim.runUntil(d * 1440 - 1440 + 10 * 60);
    const here = sim.state.order.filter((id) => !sim.resident(id).departed && sim.resident(id).activity?.id !== 'sleep');
    if (here.length === 0) continue;
    const who = here[(d * 7 + seed) % here.length]!;
    const v = sim.askFavour(who, (['timber', 'catch', 'garden'] as const)[d % 3]!);
    if (v.reason === 'nowhere' || v.reason === 'asleep' || v.reason === 'gone') continue;
    answers.push(v.yes ? 'yes' : (v.reason ?? 'no'));
  }
  return answers;
}

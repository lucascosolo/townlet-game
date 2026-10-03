// Stand-in stewards for headless runs: they answer dilemmas and requests the way a player of a
// given temperament might. The real player replaces this in M2.

import { buildingDef } from '../content/buildings.js';
import { chance, deriveSeed, type RngHolder } from '../sim/rng.js';
import type { Simulation } from '../sim/sim.js';
import { active } from '../sim/story/director.js';
import { dilemmaDef, stanceScore } from '../sim/story/dilemmas.js';
import { TICKS_PER_DAY } from '../sim/time.js';
import type { Dilemma, Request } from '../sim/types.js';
import { canPlace, distanceTo, getBuilding } from '../sim/world.js';

export type StewardPolicy = 'none' | 'considerate' | 'approve' | 'decline' | 'neglectful' | 'random';
export const STEWARD_POLICIES: StewardPolicy[] = ['none', 'considerate', 'approve', 'decline', 'neglectful', 'random'];

const REPLY_DELAY = 3 * 60;

/** Would the town as a whole welcome this proposal? The proposer counts double. */
export function townSupports(sim: Simulation, d: Dilemma): boolean {
  const def = dilemmaDef(d.type);
  let total = 1;
  for (const r of active(sim.state)) if (r.id !== d.proposer) total += stanceScore(r, def);
  return total > 0;
}

/** Hedges on the free tiles around a home that sit closest to the noise. */
export function hedgesFor(sim: Simulation, q: Request): Array<[number, number]> {
  const state = sim.state;
  const home = getBuilding(state, sim.resident(q.by).homeId);
  const source = state.buildings.find((b) => `b:${b.id}` === q.subject);
  if (!source) return [];
  const [w, h] = buildingDef(home.type).size;
  const ring: Array<[number, number]> = [];
  for (let x = home.x - 1; x <= home.x + w; x++) {
    for (let y = home.y - 1; y <= home.y + h; y++) {
      if (x >= home.x && x < home.x + w && y >= home.y && y < home.y + h) continue;
      if (canPlace(state, 'hedge', x, y) === null) ring.push([x, y]);
    }
  }
  ring.sort((a, b) => distanceTo(source, a[0], a[1]) - distanceTo(source, b[0], b[1]));
  return ring.slice(0, 2);
}

export function attachSteward(sim: Simulation, policy: StewardPolicy): void {
  if (policy === 'none') return;
  const rng: RngHolder = { rng: deriveSeed(sim.state.seed, `steward:${policy}`) };
  sim.on((e) => {
    if (e.type === 'dilemma_posted') {
      const d = e.dilemma;
      let option: 'approve' | 'decline' | null;
      switch (policy) {
        case 'considerate':
          option = townSupports(sim, d) ? 'approve' : 'decline';
          break;
        case 'approve':
          option = 'approve';
          break;
        case 'decline':
          option = 'decline';
          break;
        case 'neglectful':
          option = null;
          break;
        case 'random':
          option = chance(rng, 0.2) ? null : chance(rng, 0.5) ? 'approve' : 'decline';
          break;
      }
      if (option) sim.schedule([{ at: e.t + REPLY_DELAY, kind: 'decide', dilemma: d.type, option }]);
    }
    if (e.type === 'request_posted' && (policy === 'considerate' || (policy === 'random' && chance(rng, 0.5)))) {
      const at = e.t + (policy === 'considerate' ? REPLY_DELAY : TICKS_PER_DAY);
      sim.schedule(hedgesFor(sim, e.request).map(([x, y]) => ({ at, kind: 'build' as const, type: 'hedge', x, y })));
    }
  });
}

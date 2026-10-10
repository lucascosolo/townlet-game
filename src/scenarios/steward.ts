// Stand-in stewards for headless runs: they answer dilemmas and requests the way a player of a
// given temperament might. The real player replaces this in M2.

import { buildingDef } from '../content/buildings.js';
import { chance, deriveSeed, type RngHolder } from '../sim/rng.js';
import { knownFacts, residentCap, unlocked, type Goal } from '../sim/progress.js';
import { MAX_RESIDENTS, type Command, type Simulation } from '../sim/sim.js';
import { active } from '../sim/story/director.js';
import { dilemmaDef, stanceScore } from '../sim/story/dilemmas.js';
import { TICKS_PER_DAY } from '../sim/time.js';
import { considerFavour, openPlots } from '../sim/favours.js';
import { at as atTime, dayOf } from '../sim/time.js';
import type { Dilemma, FavourKind, Request, TalkQuestion } from '../sim/types.js';
import { canPlace, distanceTo, getBuilding, liveBuildings, sizeOf } from '../sim/world.js';

export type StewardPolicy = 'none' | 'considerate' | 'approve' | 'decline' | 'neglectful' | 'random' | 'favours' | 'goals';
export const STEWARD_POLICIES: StewardPolicy[] = ['none', 'considerate', 'approve', 'decline', 'neglectful', 'random', 'favours', 'goals'];

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
  const [w, h] = sizeOf(home);
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

/** The nearest free spot for a building around a point, searching outward. */
export function spotNear(sim: Simulation, type: string, cx: number, cy: number, maxR = 6): [number, number] | null {
  for (let r = 1; r <= maxR; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (canPlace(sim.state, type, cx + dx, cy + dy) === null) return [cx + dx, cy + dy];
      }
    }
  }
  return null;
}

/** The heart of town: the commons, or the middle of the map. */
function townCentre(sim: Simulation): [number, number] {
  const c = sim.state.buildings.find((b) => !b.removed && b.type === 'commons');
  return c ? [c.x + 1, c.y + 1] : [Math.floor(sim.state.width / 2), Math.floor(sim.state.height / 2)];
}

/** What a considerate steward would build in answer to an ask, if anything. */
export function answerFor(sim: Simulation, q: Request): Array<{ type: string; x: number; y: number }> {
  const home = getBuilding(sim.state, sim.resident(q.by).homeId);
  const [hx, hy] = [home.x, home.y];
  const one = (type: string, at: [number, number] | null) => (at && sim.canAfford(type) ? [{ type, x: at[0], y: at[1] }] : []);
  switch (q.kind) {
    case 'quieter_home':
      return hedgesFor(sim, q).map(([x, y]) => ({ type: 'hedge', x, y }));
    case 'somewhere_to_sit':
      return one('bench', spotNear(sim, 'bench', hx, hy, 4));
    case 'more_green':
      return one('flowerbed', spotNear(sim, 'flowerbed', hx, hy, 2));
    case 'place_to_gather':
      return one('bench', spotNear(sim, 'bench', ...townCentre(sim), 6));
    case 'workplace':
      return q.wants ? one(q.wants, spotNear(sim, q.wants, ...townCentre(sim), 8)) : [];
    case 'more_food':
      return one('garden', spotNear(sim, 'garden', ...townCentre(sim), 8));
    case 'home_for_kin':
      return one('cottage', spotNear(sim, 'cottage', hx, hy, 8));
    case 'aspiration':
      // Dreams go near the dreamer's home, except the banner, which belongs on the green.
      if (!q.wants) return [];
      return one(q.wants, spotNear(sim, q.wants, ...(q.wants === 'banner' ? townCentre(sim) : ([hx, hy] as [number, number])), 8));
  }
}

export function attachSteward(sim: Simulation, policy: StewardPolicy): void {
  if (policy === 'none') return;
  const rng: RngHolder = { rng: deriveSeed(sim.state.seed, `steward:${policy}`) };
  const wanted: number[] = [];
  const tried = new Map<number, { at: number; types: string[] }>();
  sim.on((e) => {
    if (e.type === 'dilemma_posted') {
      const d = e.dilemma;
      let option: 'approve' | 'decline' | null;
      switch (policy) {
        case 'considerate':
        case 'favours':
        case 'goals':
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
    if (e.type === 'request_posted' && (policy === 'considerate' || policy === 'favours' || policy === 'goals' || (policy === 'random' && chance(rng, 0.5)))) wanted.push(e.request.id);
    // Each morning, act on the asks still waiting, as far as the stores allow.
    if (e.type === 'dawn' && wanted.length > 0) {
      const still: number[] = [];
      for (const id of wanted) {
        const q = sim.state.requests.find((x) => x.id === id);
        if (!q || q.status !== 'open') continue;
        const plan = answerFor(sim, q);
        if (plan.length === 0) {
          still.push(id);
          continue;
        }
        const at = e.t + (policy === 'considerate' || policy === 'favours' || policy === 'goals' ? REPLY_DELAY : TICKS_PER_DAY);
        sim.schedule(plan.map((p) => ({ at, kind: 'build' as const, ...p })));
        // A build the stores couldn't pay for is tried again tomorrow, as a player would (M4:
        // with dearer buildings, a dropped build used to mean a lapsed ask).
        if (policy === 'considerate' || policy === 'favours' || policy === 'goals') tried.set(id, { at, types: plan.map((p) => p.type) });
      }
      for (const [id, t] of tried) {
        const q = sim.state.requests.find((x) => x.id === id);
        if (!q || q.status !== 'open') {
          tried.delete(id);
          continue;
        }
        const built = sim.state.buildings.some((b) => b.placedBy === 'steward' && b.placedTick >= t.at && t.types.includes(b.type));
        if (built) tried.delete(id);
        else if (e.t > t.at && !still.includes(id)) still.push(id);
      }
      wanted.splice(0, wanted.length, ...still);
    }
    if ((policy === 'favours' || policy === 'goals') && e.type === 'dawn') favourMorning(sim, dayOf(e.t));
    if (policy === 'goals' && e.type === 'goal' && e.phase === 'new') goalMorning(sim, dayOf(e.t), e.goals ?? []);
  });
}

/** What the town needs most from people's hands today. */
export function neededFavour(sim: Simulation): FavourKind {
  const s = sim.state.stock;
  if (s.timber < 30) return 'timber';
  if (s.food < 25) return 'catch';
  if (openPlots(sim.state).length > 0) return 'clear';
  return 'timber';
}

/**
 * The favour-asking steward (M3c tests): one favour a day, at 8:00, of whoever is likeliest to
 * agree; and a cottage whenever a newcomer could come but no home is empty.
 */
function favourMorning(sim: Simulation, day: number): void {
  const kind = neededFavour(sim);
  const people = active(sim.state)
    .map((r) => ({ r, v: considerFavour(sim.state, r, kind) }))
    .filter((x) => x.v.reason !== 'nowhere')
    .sort((a, b) => b.v.score - a.v.score || a.r.id.localeCompare(b.r.id));
  const who = people[0]?.r.id;
  if (who) sim.schedule([{ at: atTime(day, 8), kind: 'favour', who, favour: kind }]);
  const moreToCome = active(sim.state).length < Math.min(MAX_RESIDENTS, residentCap(sim.state));
  if (moreToCome && sim.emptyHomes().length === 0 && sim.canAfford('cottage')) {
    const spot = cottageSpot(sim);
    if (spot) sim.schedule([{ at: atTime(day, 10), kind: 'build', type: 'cottage', x: spot[0], y: spot[1] }]);
  }
}

/** Somewhere for a new cottage: near the town centre if there's room, else anywhere cleared. */
export function cottageSpot(sim: Simulation): [number, number] | null {
  const near = spotNear(sim, 'cottage', ...townCentre(sim), 14);
  if (near) return near;
  for (let y = 0; y < sim.state.height - 1; y++) for (let x = 0; x < sim.state.width - 1; x++) if (canPlace(sim.state, 'cottage', x, y) === null) return [x, y];
  return null;
}

/**
 * The goal-keeping steward (M4 tests): everything the favour-asker does, plus each morning it talks
 * properly with three people (those it hasn't met first, all five questions) and takes on the
 * day's goals, as a diligent player would.
 */
function goalMorning(sim: Simulation, day: number, goals: Goal[]): void {
  const state = sim.state;
  const people = active(state);
  const byKnown = [...people].sort((a, b) => knownFacts(state, a.id).length - knownFacts(state, b.id).length || a.id.localeCompare(b.id));
  const talks: Command[] = [];
  byKnown.slice(0, 3).forEach((r, i) => {
    const at = atTime(day, 9, 10 * i);
    const friend = Object.entries(r.rel).find(([id]) => id !== 'steward' && state.residents[id] && !state.residents[id]?.departed)?.[0];
    for (const question of ['how', 'mind', 'hope', 'me'] as TalkQuestion[]) talks.push({ at, kind: 'talk', who: r.id, question });
    if (friend) talks.push({ at, kind: 'talk', who: r.id, question: 'opinion', about: `r:${friend}` });
  });
  sim.schedule(talks);
  if (goals.some((g) => g.kind === 'green') && sim.canAfford('flowerbed')) {
    const home = state.buildings.find((b) => b.id === byKnown[0]?.homeId);
    const spot = home ? spotNear(sim, 'flowerbed', home.x, home.y, 4) : null;
    if (spot) sim.schedule([{ at: atTime(day, 10, 30), kind: 'build', type: 'flowerbed', x: spot[0], y: spot[1] }]);
  }
  // Build what a tier has opened up, once.
  for (const type of ['beehives', 'coop', 'fountain']) {
    if (!unlocked(state, type) || liveBuildings(state).some((b) => b.type === type) || !sim.canAfford(type)) continue;
    const spot = spotNear(sim, type, ...townCentre(sim), 10);
    if (spot) sim.schedule([{ at: atTime(day, 11), kind: 'build', type, x: spot[0], y: spot[1] }]);
  }
}

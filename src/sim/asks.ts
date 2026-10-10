// What residents ask the steward for (M2.5, "being needed"). Each kind of ask has a want (does
// this resident want it now?) and a met test (has it been dealt with?). Requests and seasonal
// Town Wishes are both built from these.

import { buildingDef } from '../content/buildings.js';
import { residentDef } from '../content/residents.js';
import { sleepNoiseThreshold, urgency } from './needs.js';
import { residentCap } from './progress.js';
import { dayOf } from './time.js';
import type { RequestKind, ResidentState, SimState, SubjectId } from './types.js';
import { ambientAt, distanceTo, getBuilding, greenAroundHome, liveBuildings, placeTile } from './world.js';

export const ASK_KINDS = ['quieter_home', 'workplace', 'more_food', 'somewhere_to_sit', 'more_green', 'place_to_gather', 'home_for_kin'] as const;
export type AskKind = (typeof ASK_KINDS)[number];

/** Days before an unanswered ask lapses. */
export const ASK_LAPSE_DAYS: Record<RequestKind, number> = {
  aspiration: 10,
  quieter_home: 5,
  workplace: 7,
  more_food: 7,
  somewhere_to_sit: 7,
  more_green: 7,
  place_to_gather: 7,
  home_for_kin: 10,
};

const NEAR_HOME = 6;
/** Green around a home that satisfies someone who asked for more (one flower bed or hedge right beside it). */
export const GREEN_ENOUGH = 0.3;
const DREAM_BUILDINGS = new Set(['orchard', 'glasshouse', 'banner']);

export interface AskAssessment {
  want: boolean;
  met: boolean;
  subject: SubjectId;
  /** For a workplace ask: the building type they want. */
  wants?: string;
}

// Bar round 8: a well is somewhere to stop and talk too (the tray said so; the ask did not count it).
function isGatheringPlace(type: string): boolean {
  return buildingDef(type).kind === 'social' || type === 'bench' || type === 'oak' || type === 'well';
}

function homeTile(state: SimState, r: ResidentState): [number, number] {
  return placeTile(getBuilding(state, r.homeId));
}

/** Built by the steward since a tick, and still standing. */
function builtSince(state: SimState, since: number, pred: (type: string) => boolean): boolean {
  return state.buildings.some((b) => !b.removed && b.placedBy === 'steward' && b.placedTick >= since && pred(b.type));
}

export function assess(state: SimState, r: ResidentState, kind: RequestKind, since = -1, wants?: string): AskAssessment {
  const def = residentDef(r.id);
  const [hx, hy] = homeTile(state, r);
  const self: SubjectId = `r:${r.id}`;
  switch (kind) {
    case 'aspiration': {
      // Asked for by the aspiration engine, not by this loop: met once the dream is built. A
      // bench to remember by has to be a new one; a dream building only needs to stand.
      const met = !!wants && liveBuildings(state).some((b) => b.type === wants && (DREAM_BUILDINGS.has(wants) || b.placedTick >= since));
      return { want: false, met, subject: self, ...(wants ? { wants } : {}) };
    }
    case 'quieter_home': {
      const bel = Object.values(r.beliefs).find((b) => b.aspect === 'noisy_at_night' && b.subject.startsWith('b:') && b.strength >= 0.35);
      const b = bel ? state.buildings.find((x) => `b:${x.id}` === bel.subject) : undefined;
      const want = !!b && !b.removed && r.disturbedBy.includes(b.id);
      return { want, met: !want && r.sleepNoiseMax <= sleepNoiseThreshold(def), subject: bel?.subject ?? self };
    }
    case 'workplace': {
      const job = def.job;
      if (!job) return { want: false, met: true, subject: self };
      const current = r.jobId !== null ? state.buildings.find((b) => b.id === r.jobId) : undefined;
      const has = current?.type === job;
      // Nowhere of that kind with a free place: none built yet, or all taken (newcomers, M3c).
      const capacity = buildingDef(job).capacity ?? 0;
      const free = liveBuildings(state).some((b) => b.type === job && Object.values(state.residents).filter((x) => !x.departed && x.jobId === b.id).length < capacity);
      return { want: !has && !free, met: has, subject: self, wants: job };
    }
    case 'more_food': {
      const want = state.lastShortageDay > 0 && dayOf(state.tick) - state.lastShortageDay <= 1;
      // Bar round 6: building a food place answers the ask, whatever the larder holds (a winter
      // rescue lapsed because the larder could not refill in two days); the larder only decides the worry.
      const met = builtSince(state, since, (t) => !!buildingDef(t).produces?.food);
      return { want, met, subject: self };
    }
    case 'somewhere_to_sit': {
      const near = liveBuildings(state).some((b) => isGatheringPlace(b.type) && distanceTo(b, hx, hy) <= NEAR_HOME);
      const lonely = urgency(r.needs.company, r.setpoints.company) > 0.25 || def.traits.sociable > 0.3 || def.values.community >= 0.6;
      return { want: !near && lonely, met: near, subject: self };
    }
    case 'more_green': {
      const green = greenAroundHome(state, getBuilding(state, r.homeId));
      const cares = def.values.nature >= 0.6 || def.values.beauty >= 0.6;
      return { want: cares && green < 0.2, met: green >= GREEN_ENOUGH - 1e-9, subject: self };
    }
    case 'home_for_kin': {
      // Bar round 8: once the town may grow and has no empty home, the most neighbourly resident
      // has someone who would like to come ("no newcomer in 30 days, and nothing said why").
      const lived = new Set(Object.values(state.residents).filter((x) => !x.departed).map((x) => x.homeId));
      const empty = liveBuildings(state).some((b) => buildingDef(b.type).kind === 'home' && !lived.has(b.id));
      const here = Object.values(state.residents).filter((x) => !x.departed);
      const room = here.length < residentCap(state);
      const asker = [...here].sort((a, b) => residentDef(b.id).values.community - residentDef(a.id).values.community || (a.id < b.id ? -1 : 1))[0];
      // Audit 2026-10-10: met by a home built since it was asked, not by someone leaving (which
      // thanked you for a departure).
      const built = liveBuildings(state).some((b) => buildingDef(b.type).kind === 'home' && !lived.has(b.id) && b.placedTick >= since);
      return { want: room && !empty && asker?.id === r.id, met: built, subject: self, wants: 'cottage' };
    }
    case 'place_to_gather': {
      const crowded = [...Object.values(r.beliefs), ...Object.values(r.traces)].some(
        (b) => b.aspect === 'too_crowded' && ('strength' in b ? b.strength >= 0.3 : (b as { evidence: number }).evidence <= -0.3),
      );
      return { want: crowded, met: builtSince(state, since, isGatheringPlace), subject: self };
    }
  }
}

export const WISH_LABELS: Record<RequestKind, string> = {
  aspiration: 'A dream come true',
  quieter_home: 'Quieter nights',
  workplace: 'Proper places to work',
  more_food: 'A fuller larder',
  somewhere_to_sit: 'Somewhere to sit near home',
  more_green: 'More green about the place',
  place_to_gather: 'Another place to gather',
  home_for_kin: 'A cottage for someone who wants to come',
};

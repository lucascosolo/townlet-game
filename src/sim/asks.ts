// What residents ask the steward for (M2.5, "being needed"). Each kind of ask has a want (does
// this resident want it now?) and a met test (has it been dealt with?). Requests and seasonal
// Town Wishes are both built from these.

import { buildingDef } from '../content/buildings.js';
import { residentDef } from '../content/residents.js';
import { sleepNoiseThreshold, urgency } from './needs.js';
import { dayOf } from './time.js';
import type { RequestKind, ResidentState, SimState, SubjectId } from './types.js';
import { ambientAt, distanceTo, getBuilding, liveBuildings, placeTile } from './world.js';

export const ASK_KINDS = ['quieter_home', 'workplace', 'more_food', 'somewhere_to_sit', 'more_green', 'place_to_gather'] as const;
export type AskKind = (typeof ASK_KINDS)[number];

/** Days before an unanswered ask lapses. */
export const ASK_LAPSE_DAYS: Record<RequestKind, number> = {
  aspiration: 10,
  quieter_home: 5,
  workplace: 7,
  more_food: 4,
  somewhere_to_sit: 7,
  more_green: 7,
  place_to_gather: 7,
};

const NEAR_HOME = 6;
const DREAM_BUILDINGS = new Set(['orchard', 'glasshouse', 'banner']);

export interface AskAssessment {
  want: boolean;
  met: boolean;
  subject: SubjectId;
  /** For a workplace ask: the building type they want. */
  wants?: string;
}

function isGatheringPlace(type: string): boolean {
  return buildingDef(type).kind === 'social' || type === 'bench' || type === 'oak';
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
      const exists = liveBuildings(state).some((b) => b.type === job);
      return { want: !has && !exists, met: has, subject: self, wants: job };
    }
    case 'more_food': {
      const want = state.lastShortageDay > 0 && dayOf(state.tick) - state.lastShortageDay <= 1;
      const met = state.stock.food >= 15 && builtSince(state, since, (t) => !!buildingDef(t).produces?.food);
      return { want, met, subject: self };
    }
    case 'somewhere_to_sit': {
      const near = liveBuildings(state).some((b) => isGatheringPlace(b.type) && distanceTo(b, hx, hy) <= NEAR_HOME);
      const lonely = urgency(r.needs.company, r.setpoints.company) > 0.25 || def.traits.sociable > 0.3 || def.values.community >= 0.6;
      return { want: !near && lonely, met: near, subject: self };
    }
    case 'more_green': {
      const green = ambientAt(state, hx, hy, new Set(), { weather: false }).green;
      const cares = def.values.nature >= 0.6 || def.values.beauty >= 0.6;
      return { want: cares && green < 0.2, met: green >= 0.3, subject: self };
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
};

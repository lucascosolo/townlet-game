// Dilemmas (spec 4.4): a resident proposes something, the steward approves or declines, and
// everyone judges the decision by their own values. Ignoring a proposal for two days is a
// decision too.

import { residentDef } from '../../content/residents.js';
import { clamp } from '../needs.js';
import { TICKS_PER_DAY, at, dayOf, nextAt } from '../time.js';
import { STEWARD, type Dilemma, type DilemmaType, type ResidentState, type SimState, type Value } from '../types.js';
import { liveBuildings } from '../world.js';
import type { StoryHost } from './director.js';
import { active, addGathering, placeFor } from './director.js';

export interface DilemmaDef {
  type: DilemmaType;
  /** Values the proposal serves (positive) or offends (negative). */
  stance: Partial<Record<Value, number>>;
  proposer(state: SimState): string | null;
  eligible(state: SimState): boolean;
  approve(host: StoryHost, d: Dilemma): void;
}

function mostBy(state: SimState, score: (r: ResidentState) => number, min: number): string | null {
  let best: ResidentState | null = null;
  for (const r of active(state)) if (score(r) >= min && (!best || score(r) > score(best))) best = r;
  return best ? best.id : null;
}

function upcomingFestival(state: SimState): number | null {
  const g = state.story.gatherings.find((x) => x.kind === 'festival' && x.from > state.tick && x.from - state.tick < 2 * TICKS_PER_DAY);
  return g ? g.from : null;
}

export const DILEMMAS: DilemmaDef[] = [
  {
    type: 'market_day',
    stance: { prosperity: 1, community: 0.5, quiet: -1 },
    proposer: (state) => mostBy(state, (r) => residentDef(r.id).values.prosperity, 0.6),
    eligible: (state) => !state.story.marketDay && liveBuildings(state).some((b) => b.type === 'commons'),
    approve: (host) => {
      host.state.story.marketDay = true;
    },
  },
  {
    type: 'night_baking',
    stance: { community: 0.6, craft: 0.6, quiet: -1 },
    proposer: (state) => {
      const bakery = liveBuildings(state).find((b) => b.type === 'bakery');
      if (!bakery) return null;
      return active(state).find((r) => r.jobId === bakery.id)?.id ?? null;
    },
    eligible: (state) => upcomingFestival(state) !== null,
    approve: (host) => {
      const state = host.state;
      const bakery = liveBuildings(state).find((b) => b.type === 'bakery');
      const festival = upcomingFestival(state);
      if (!bakery || festival === null) return;
      // The ovens run through the night before the festival.
      const eve = at(dayOf(festival) - 1, 23);
      state.story.extraShifts.push([bakery.id, Math.max(eve, state.tick), nextAt(Math.max(eve, state.tick), 4 * 60)]);
    },
  },
  {
    type: 'contraption',
    stance: { craft: 1, prosperity: 0.3, quiet: -0.8 },
    proposer: (state) => mostBy(state, (r) => residentDef(r.id).values.craft + residentDef(r.id).traits.curious, 1.6),
    eligible: (state) => liveBuildings(state).some((b) => b.type === 'commons'),
    approve: (host, d) => {
      const place = placeFor(host.state, ['commons']);
      if (place === null) return;
      const day = dayOf(host.state.tick) + 1;
      addGathering(host, {
        kind: 'contraption',
        label: `${residentDef(d.proposer).name}'s contraption`,
        placeId: place,
        from: at(day, 14),
        until: at(day, 15, 30),
        pull: 0.5,
        appeal: { craft: 0.6, prosperity: 0.2 },
        emits: { noise: 0.5, bustle: 0.4 },
        radius: 3,
      });
    },
  },
];

export function dilemmaDef(type: DilemmaType): DilemmaDef {
  const d = DILEMMAS.find((x) => x.type === type);
  if (!d) throw new Error(`unknown dilemma ${type}`);
  return d;
}

/** How much a resident's values agree with a proposal, roughly [-1.5, 1.5]. */
export function stanceScore(r: ResidentState, def: DilemmaDef): number {
  const values = residentDef(r.id).values;
  let s = 0;
  for (const [v, w] of Object.entries(def.stance)) s += (w ?? 0) * (values[v as Value] - 0.4) * 2;
  return s;
}

export function closeDilemma(host: StoryHost, d: Dilemma, outcome: 'approved' | 'declined' | 'lapsed'): void {
  const state = host.state;
  const def = dilemmaDef(d.type);
  d.status = outcome;
  d.closedTick = state.tick;
  if (outcome === 'approved') def.approve(host, d);
  const ctx = host.mindContext();
  const reactions: Array<{ who: string; valence: number }> = [];
  for (const r of active(state)) {
    if (r.id === d.proposer) {
      const p =
        outcome === 'approved'
          ? { aspect: 'listens_to_me', valence: 0.9, base: 0.9, note: 'said yes to my idea' }
          : outcome === 'declined'
            ? { aspect: 'turned_me_down', valence: -0.5, base: 0.5, note: 'said no to my idea' }
            : { aspect: 'ignores_me', valence: -0.7, base: 0.6, note: 'never answered my idea' };
      host.mind.perceive(ctx, r, { subject: STEWARD, ...p, source: 'witnessed' });
      reactions.push({ who: r.id, valence: p.valence });
      continue;
    }
    const score = stanceScore(r, def);
    const v = outcome === 'approved' ? score : outcome === 'declined' ? -0.6 * score : -0.3 * Math.abs(score) - 0.1;
    if (Math.abs(v) < 0.15) continue;
    const sign = Math.sign(v);
    host.mind.perceive(ctx, r, {
      subject: STEWARD,
      aspect: sign > 0 ? 'decided_well' : 'decided_badly',
      valence: 0.6 * sign,
      base: clamp(Math.abs(v)) * 0.7,
      source: 'witnessed',
      note: `${outcome} ${residentDef(d.proposer).name}'s ${d.type.replace('_', ' ')}`,
    });
    reactions.push({ who: r.id, valence: sign });
  }
  host.emitEvent({ t: state.tick, type: 'dilemma_closed', dilemma: { ...d }, reactions });
}

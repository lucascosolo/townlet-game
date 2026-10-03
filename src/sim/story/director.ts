// The storyteller (spec 4.4): a calendar of festivals and visitors, a paced daily draw of
// small events, weather, and dilemmas for the steward. Tuned for coziness: quiet stretches are
// allowed, negative events never come within 48 hours of each other, and events prefer
// residents with unresolved threads.

import { buildingDef } from '../../content/buildings.js';
import { residentDef } from '../../content/residents.js';
import type { Mind, MindContext } from '../mind/mind.js';
import { opinion } from '../mind/memory.js';
import { adjust, compatibility, rel, warmth } from '../mind/relationships.js';
import { clamp, unit } from '../needs.js';
import { chance, deriveSeed, pick, weighted } from '../rng.js';
import { DAYS_PER_SEASON, TICKS_PER_DAY, at, dayOf, minuteOf, seasonOf, type Season } from '../time.js';
import {
  type Dilemma,
  type DilemmaType,
  type ExchangeKind,
  type Gathering,
  type ResidentState,
  type SimEvent,
  type SimState,
  type StoryState,
  type SubjectId,
  type Tone,
  type TownMemory,
} from '../types.js';
import { liveBuildings } from '../world.js';
import { DILEMMAS, closeDilemma } from './dilemmas.js';

/** What the director needs from the simulation. */
export interface StoryHost {
  readonly state: SimState;
  readonly mind: Mind;
  mindContext(): MindContext;
  emitEvent(e: SimEvent): void;
  forceExchange(a: ResidentState, b: ResidentState, kind: ExchangeKind, placeId: number | null, topic?: SubjectId): void;
}

export const FESTIVALS: Record<Season, string> = {
  spring: 'Blossom Day',
  summer: 'Midsummer Lanterns',
  autumn: 'Harvest Supper',
  winter: 'Long Night',
};

/** Where each season's festival is held, in order of preference. */
const FESTIVAL_VENUES: Record<Season, string[]> = {
  spring: ['commons', 'oak', 'teahouse'],
  summer: ['oak', 'commons', 'teahouse'],
  autumn: ['teahouse', 'commons', 'oak'],
  winter: ['teahouse', 'commons', 'oak'],
};

const NEGATIVE_GAP = 2 * TICKS_PER_DAY;
const DILEMMA_LAPSE = 2 * TICKS_PER_DAY;

export function newStoryState(seed: number): StoryState {
  return {
    rng: deriveSeed(seed, 'story'),
    nextId: 1,
    history: [],
    gatherings: [],
    weather: { kind: 'clear', until: 0 },
    sparks: [],
    dilemmas: [],
    memories: [],
    marketDay: false,
    extraShifts: [],
  };
}

// ------------------------------------------------------------------ helpers

export function active(state: SimState): ResidentState[] {
  return state.order.map((id) => state.residents[id] as ResidentState).filter((r) => !r.departed);
}

export function activeGatherings(state: SimState, tick = state.tick): Gathering[] {
  return state.story.gatherings.filter((g) => tick >= g.from && tick < g.until);
}

/** The first live building of the preferred types, in order of preference. */
export function placeFor(state: SimState, types: string[]): number | null {
  for (const t of types) {
    const b = liveBuildings(state).find((x) => x.type === t);
    if (b) return b.id;
  }
  const social = liveBuildings(state).find((x) => buildingDef(x.type).activities.includes('socialize'));
  return social ? social.id : null;
}

/** A random live place among the given types, so visitors don't always pick the same spot. */
export function pickPlace(host: StoryHost, types: string[]): number | null {
  const options = liveBuildings(host.state).filter((b) => types.includes(b.type));
  return options.length > 0 ? pick(host.state.story, options).id : placeFor(host.state, types);
}

/** Unresolved threads a resident carries: an open request, a recent quarrel, low spirits, thoughts of leaving. */
export function threads(state: SimState, r: ResidentState): number {
  let n = 0;
  if (state.requests.some((q) => q.by === r.id && q.status === 'open')) n++;
  if (Object.values(r.rel).some((x) => x.lastArgue >= 0 && state.tick - x.lastArgue < 3 * TICKS_PER_DAY)) n++;
  if (r.mood < 0.5) n++;
  if (r.leaving) n++;
  return n;
}

function record(story: StoryState, id: string, tick: number, tone: Tone): void {
  story.history.push({ id, tick, tone });
  if (story.history.length > 200) story.history.splice(0, story.history.length - 200);
}

function lastOf(story: StoryState, pred: (h: StoryState['history'][number]) => boolean): number {
  for (let i = story.history.length - 1; i >= 0; i--) {
    const h = story.history[i] as StoryState['history'][number];
    if (pred(h)) return h.tick;
  }
  return -Infinity;
}

export function addGathering(host: StoryHost, g: Omit<Gathering, 'id' | 'attendees'>): Gathering {
  const story = host.state.story;
  const full: Gathering = { ...g, id: story.nextId++, attendees: [] };
  story.gatherings.push(full);
  host.emitEvent({ t: host.state.tick, type: 'gathering', phase: 'announced', gathering: structuredClone(full) });
  return full;
}

export function addMemory(host: StoryHost, m: Omit<TownMemory, 'id'>): TownMemory {
  const story = host.state.story;
  const full: TownMemory = { ...m, id: story.nextId++ };
  story.memories.push(full);
  host.emitEvent({ t: host.state.tick, type: 'town_memory', memory: structuredClone(full) });
  return full;
}

// ------------------------------------------------------------------ per tick

export function storyStep(host: StoryHost): void {
  const state = host.state;
  const story = state.story;
  const t = state.tick;
  const m = minuteOf(t);

  for (const g of story.gatherings) {
    if (t === g.from) host.emitEvent({ t, type: 'gathering', phase: 'start', gathering: structuredClone(g) });
    if (t >= g.from && t < g.until) {
      for (const r of active(state)) if (r.at === g.placeId && !g.attendees.includes(r.id)) g.attendees.push(r.id);
    }
    if (t === g.until) endGathering(host, g);
  }
  story.gatherings = story.gatherings.filter((g) => t <= g.until + TICKS_PER_DAY);
  story.sparks = story.sparks.filter((s) => t < s.until);
  story.extraShifts = story.extraShifts.filter(([, , until]) => t < until);

  if (story.weather.kind !== 'clear' && t >= story.weather.until) {
    const was = story.weather.kind;
    story.weather = { kind: 'clear', until: t };
    if (was === 'storm') stormPassed(host);
  }

  for (const d of story.dilemmas) {
    if (d.status === 'open' && t - d.postedTick >= DILEMMA_LAPSE) closeDilemma(host, d, 'lapsed');
  }

  if (m === 6 * 60) morning(host);
  if (m === 15 * 60) afternoon(host);
}

// ------------------------------------------------------------------ calendar

function morning(host: StoryHost): void {
  const state = host.state;
  const story = state.story;
  const t = state.tick;
  const day = dayOf(t);
  const dayInSeason = ((day - 1) % DAYS_PER_SEASON) + 1;
  const commons = placeFor(state, ['commons', 'teahouse']);

  const festivalPlace = placeFor(state, FESTIVAL_VENUES[seasonOf(t)]);
  if (dayInSeason === 4 && festivalPlace !== null) {
    addGathering(host, {
      kind: 'festival',
      label: FESTIVALS[seasonOf(t)],
      placeId: festivalPlace,
      from: at(day + 1, 17),
      until: at(day + 1, 22),
      pull: 1.6,
      appeal: { community: 0.8, beauty: 0.3 },
      emits: { bustle: 0.5 },
      radius: 2,
    });
  }
  // Pip stops somewhere different each week.
  const cartStop = dayInSeason === 2 ? pickPlace(host, ['teahouse', 'commons', 'oak', 'bench']) : null;
  if (cartStop !== null) {
    record(story, 'trade_cart', t, 'good');
    addGathering(host, { kind: 'trade_cart', label: "Pip's trade cart", placeId: cartStop, from: at(day, 9), until: at(day, 13), pull: 0.5, appeal: { prosperity: 0.8, craft: 0.3 } });
  }
  if (story.marketDay && dayInSeason === 6 && commons !== null) {
    addGathering(host, { kind: 'market', label: 'market day', placeId: commons, from: at(day, 9), until: at(day, 14), pull: 0.6, appeal: { prosperity: 0.8, community: 0.4 }, emits: { bustle: 0.6, noise: 0.35 }, radius: 3 });
  }

  const dayOfYear = ((day - 1) % (DAYS_PER_SEASON * 4)) + 1;
  for (const r of active(state)) if (residentDef(r.id).birthday === dayOfYear) birthday(host, r);

  // Weather for the day.
  if (story.weather.kind === 'clear') {
    const rainChance: Record<Season, number> = { spring: 0.25, summer: 0.12, autumn: 0.3, winter: 0.2 };
    if (chance(story, rainChance[seasonOf(t)]) && lastOf(story, (h) => h.id === 'rain') < t - 2 * TICKS_PER_DAY) {
      story.weather = { kind: 'rain', until: at(day, 19) };
      record(story, 'rain', t, 'neutral');
      host.emitEvent({ t, type: 'weather', kind: 'rain' });
    }
  }

  draw(host, 'morning', day <= 3 ? 1 : 0.55);
}

function afternoon(host: StoryHost): void {
  const state = host.state;
  const t = state.tick;
  // Friends visit whoever is ill.
  for (const r of active(state)) {
    if (r.coldUntil > t && r.coldUntil - t < 1.5 * TICKS_PER_DAY) visitTheSick(host, r);
  }
  draw(host, 'afternoon', dayOf(t) <= 3 ? 0.8 : 0.4);
}

// ------------------------------------------------------------------ the draw

interface StoryEventDef {
  id: string;
  slot: 'morning' | 'afternoon';
  tone: Tone;
  weight: number;
  cooldownDays: number;
  /** Allowed in the first three days, when the town is still being introduced. */
  early: boolean;
  cast(host: StoryHost): string[] | null;
  fire(host: StoryHost, cast: string[]): void;
}

function draw(host: StoryHost, slot: 'morning' | 'afternoon', p: number): void {
  const state = host.state;
  const story = state.story;
  const t = state.tick;
  if (!chance(story, p)) return;
  const early = dayOf(t) <= 3;
  const lastBad = lastOf(story, (h) => h.tone === 'bad');
  const options: Array<{ def: StoryEventDef; cast: string[] }> = [];
  for (const def of EVENTS) {
    if (def.slot !== slot || (early && !def.early)) continue;
    if (def.tone === 'bad' && t - lastBad < NEGATIVE_GAP) continue;
    if (t - lastOf(story, (h) => h.id === def.id) < def.cooldownDays * TICKS_PER_DAY) continue;
    const cast = def.cast(host);
    if (cast) options.push({ def, cast });
  }
  const choice = weighted(story, options, ({ def, cast }) => {
    const th = cast.reduce((s, id) => s + (state.residents[id] ? threads(state, state.residents[id] as ResidentState) : 0), 0);
    return def.weight * (1 + 0.5 * th);
  });
  if (!choice) return;
  record(story, choice.def.id, t, choice.def.tone);
  choice.def.fire(host, choice.cast);
}

function byId(state: SimState, id: string): ResidentState {
  return state.residents[id] as ResidentState;
}

const FAVOURS = ['mend a fence', 'carry a heavy crate', 'find a lost hen', 'fix a sticking door', 'patch a leaking roof', 'sort out a tangle of netting'];

const EVENTS: StoryEventDef[] = [
  {
    id: 'musician',
    slot: 'afternoon',
    tone: 'good',
    weight: 1,
    cooldownDays: 5,
    early: true,
    cast: (host) => (placeFor(host.state, ['teahouse', 'commons']) !== null ? [] : null),
    fire: (host) => {
      const place = pickPlace(host, ['teahouse', 'oak', 'commons']) as number;
      const day = dayOf(host.state.tick);
      addGathering(host, { kind: 'musician', label: 'a travelling fiddler', placeId: place, from: at(day, 18), until: at(day, 21, 30), pull: 0.7, appeal: { beauty: 0.5, community: 0.5 }, emits: { bustle: 0.3 }, radius: 2 });
    },
  },
  {
    id: 'favour',
    slot: 'morning',
    tone: 'good',
    weight: 1.2,
    cooldownDays: 2,
    early: true,
    cast: (host) => {
      const people = active(host.state).filter((r) => r.coldUntil < host.state.tick);
      if (people.length < 2) return null;
      const asker = pick(host.state.story, people);
      const helpers = people.filter((r) => r.id !== asker.id);
      const helper = weighted(host.state.story, helpers, (h) => 0.2 + unit(residentDef(h.id).traits.generous) + Math.max(0, rel(asker, h.id).affinity));
      return helper ? [asker.id, helper.id] : null;
    },
    fire: (host, [askerId, helperId]) => {
      const state = host.state;
      const asker = byId(state, askerId as string);
      const helper = byId(state, helperId as string);
      const gen = unit(residentDef(helper.id).traits.generous);
      const ok = chance(state.story, clamp(0.45 + 0.4 * gen + 0.3 * rel(helper, asker.id).affinity));
      const ctx = host.mindContext();
      const what = pick(state.story, FAVOURS);
      if (ok) {
        host.mind.perceive(ctx, asker, { subject: `r:${helper.id}`, aspect: 'kind_to_me', valence: 0.7, base: 0.5, source: 'witnessed', note: `helped ${residentDef(asker.id).pronouns.obj} ${what}` });
        adjust(asker, helper.id, { affinity: 0.05, trust: 0.05 }, state.tick);
        adjust(helper, asker.id, { affinity: 0.03 }, state.tick);
        helper.needs.purpose = clamp(helper.needs.purpose + 0.1);
      } else {
        host.mind.perceive(ctx, asker, { subject: `r:${helper.id}`, aspect: 'let_me_down', valence: -0.5, base: 0.4, source: 'witnessed', note: `wouldn't help ${residentDef(asker.id).pronouns.obj} ${what}` });
        adjust(asker, helper.id, { affinity: -0.05, trust: -0.05 }, state.tick);
      }
      host.emitEvent({ t: state.tick, type: 'story', id: 'favour', tone: ok ? 'good' : 'bad', cast: [asker.id, helper.id], ok, topic: what });
    },
  },
  {
    id: 'squabble',
    slot: 'afternoon',
    tone: 'bad',
    weight: 1.8,
    cooldownDays: 2,
    early: true,
    cast: (host) => {
      const state = host.state;
      const people = active(state);
      const pairs: Array<[ResidentState, ResidentState, number]> = [];
      for (let i = 0; i < people.length; i++) {
        for (let j = i + 1; j < people.length; j++) {
          const a = people[i] as ResidentState;
          const b = people[j] as ResidentState;
          const fit = compatibility(residentDef(a.id), residentDef(b.id));
          const x = rel(a, b.id);
          if (x.familiarity < 0.3 || (x.lastArgue >= 0 && state.tick - x.lastArgue < 4 * TICKS_PER_DAY)) continue;
          // Poor fits squabble; pairs already on bad terms squabble more (a simmering rivalry).
          const meanAffinity = (x.affinity + rel(b, a.id).affinity) / 2;
          const friction = 0.68 - fit - 0.6 * meanAffinity;
          if (friction > 0.05) pairs.push([a, b, friction * friction]);
        }
      }
      const p = weighted(state.story, pairs, ([, , f]) => f);
      return p ? [p[0].id, p[1].id] : null;
    },
    fire: (host, [aId, bId]) => {
      const state = host.state;
      const a = byId(state, aId as string);
      const b = byId(state, bId as string);
      // What they disagree about most, if anything; otherwise a small thing.
      let topic: SubjectId | null = null;
      let gap = 0.3;
      const subjects = new Set([...Object.values(a.beliefs), ...Object.values(b.beliefs)].map((x) => x.subject));
      for (const s of subjects) {
        if (s === `r:${a.id}` || s === `r:${b.id}`) continue;
        const d = Math.abs(opinion(a, s) - opinion(b, s));
        if (d > gap) {
          gap = d;
          topic = s;
        }
      }
      state.story.sparks.push({ a: a.id, b: b.id, topic, until: state.tick + 2 * TICKS_PER_DAY });
    },
  },
  {
    id: 'cold',
    slot: 'morning',
    tone: 'bad',
    weight: 0.6,
    cooldownDays: 5,
    early: false,
    cast: (host) => {
      const people = active(host.state).filter((r) => r.coldUntil < host.state.tick);
      return people.length > 0 ? [pick(host.state.story, people).id] : null;
    },
    fire: (host, [id]) => {
      const r = byId(host.state, id as string);
      r.coldUntil = host.state.tick + 2 * TICKS_PER_DAY;
      r.needs.comfort = clamp(r.needs.comfort - 0.2);
      host.emitEvent({ t: host.state.tick, type: 'story', id: 'cold', tone: 'bad', cast: [r.id] });
    },
  },
  {
    id: 'storm',
    slot: 'afternoon',
    tone: 'bad',
    weight: 0.5,
    cooldownDays: 9,
    early: false,
    cast: () => [],
    fire: (host) => {
      const state = host.state;
      const day = dayOf(state.tick);
      state.story.weather = { kind: 'storm', until: at(day + 1, 5) };
      addMemory(host, { tick: state.tick, kind: 'storm', label: 'the night of the storm', placeId: null, attendees: active(state).map((r) => r.id) });
      host.emitEvent({ t: state.tick, type: 'weather', kind: 'storm' });
    },
  },
  {
    id: 'dilemma',
    slot: 'morning',
    tone: 'neutral',
    weight: 0.9,
    cooldownDays: 4,
    early: true,
    cast: (host) => {
      const state = host.state;
      if (state.story.dilemmas.some((d) => d.status === 'open')) return null;
      const options = DILEMMAS.filter((d) => {
        const lastSame = [...state.story.dilemmas].reverse().find((x) => x.type === d.type);
        if (lastSame && state.tick - lastSame.postedTick < 10 * TICKS_PER_DAY) return false;
        return d.eligible(state) && d.proposer(state) !== null;
      });
      const d = options.length > 0 ? pick(state.story, options) : undefined;
      return d ? [d.proposer(state) as string, d.type] : null;
    },
    fire: (host, [proposer, type]) => {
      const state = host.state;
      const d: Dilemma = { id: state.story.nextId++, type: type as DilemmaType, proposer: proposer as string, postedTick: state.tick, status: 'open' };
      state.story.dilemmas.push(d);
      host.emitEvent({ t: state.tick, type: 'dilemma_posted', dilemma: { ...d } });
    },
  },
];

// ------------------------------------------------------------------ personal beats

function birthday(host: StoryHost, r: ResidentState): void {
  const state = host.state;
  const ctx = host.mindContext();
  const givers = active(state).filter((o) => o.id !== r.id && rel(o, r.id).affinity >= 0.2 && rel(o, r.id).familiarity >= 0.4);
  for (const g of givers) {
    host.mind.perceive(ctx, r, { subject: `r:${g.id}`, aspect: 'kind_to_me', valence: 0.7, base: 0.4, source: 'witnessed', note: 'remembered my birthday' });
    adjust(r, g.id, { affinity: 0.04 }, state.tick);
  }
  r.needs.delight = clamp(r.needs.delight + 0.15 + 0.05 * givers.length);
  record(state.story, 'birthday', state.tick, 'good');
  host.emitEvent({ t: state.tick, type: 'story', id: 'birthday', tone: 'good', cast: [r.id, ...givers.map((g) => g.id)] });
}

function visitTheSick(host: StoryHost, r: ResidentState): void {
  const state = host.state;
  const friend = active(state)
    .filter((o) => o.id !== r.id && o.coldUntil < state.tick)
    .sort((a, b) => rel(a, r.id).affinity - rel(b, r.id).affinity)
    .pop();
  if (!friend || rel(friend, r.id).affinity < 0.15) {
    host.emitEvent({ t: state.tick, type: 'story', id: 'sick_alone', tone: 'bad', cast: [r.id] });
    return;
  }
  host.mind.perceive(host.mindContext(), r, { subject: `r:${friend.id}`, aspect: 'kind_to_me', valence: 0.8, base: 0.55, source: 'witnessed', note: `looked after ${residentDef(r.id).pronouns.obj} when ${residentDef(r.id).pronouns.subj} was ill` });
  adjust(r, friend.id, { affinity: 0.06, trust: 0.04 }, state.tick);
  r.needs.company = clamp(r.needs.company + 0.2);
  r.needs.comfort = clamp(r.needs.comfort + 0.1);
  host.emitEvent({ t: state.tick, type: 'story', id: 'sick_visit', tone: 'good', cast: [r.id, friend.id] });
}

function stormPassed(host: StoryHost): void {
  const state = host.state;
  const memory = [...state.story.memories].reverse().find((m) => m.kind === 'storm');
  const ctx = host.mindContext();
  for (const r of active(state)) {
    if (!memory) break;
    host.mind.perceive(ctx, r, { subject: `m:${memory.id}`, aspect: 'weathered_together', valence: 0.5, base: 0.35, source: 'witnessed', note: 'we came through the storm' });
  }
  // Neighbours check on one another in the morning.
  const people = active(state);
  for (const r of people) {
    const neighbour = people.filter((o) => o.id !== r.id).sort((a, b) => rel(r, a.id).affinity - rel(r, b.id).affinity).pop();
    if (neighbour) {
      adjust(r, neighbour.id, { affinity: 0.03 }, state.tick);
      adjust(neighbour, r.id, { affinity: 0.03 }, state.tick);
    }
  }
  host.emitEvent({ t: state.tick, type: 'story', id: 'storm_passed', tone: 'neutral', cast: [] });
}

function endGathering(host: StoryHost, g: Gathering): void {
  const state = host.state;
  const ctx = host.mindContext();
  const attendees = g.attendees.map((id) => byId(state, id)).filter((r) => !r.departed);
  if (g.kind === 'festival' || g.kind === 'contraption') {
    const success = g.kind === 'festival' || chance(state.story, 0.6);
    const memory = addMemory(host, { tick: state.tick, kind: g.kind, label: g.label, placeId: g.placeId, attendees: attendees.map((r) => r.id) });
    g.memoryId = memory.id;
    for (const r of attendees) {
      const def = residentDef(r.id);
      if (success) {
        host.mind.perceive(ctx, r, { subject: `m:${memory.id}`, aspect: 'wonderful_time', valence: 0.8, base: 0.45 + 0.3 * def.values.community, source: 'witnessed', placeId: g.placeId, note: `${g.label} with everyone` });
        r.needs.delight = clamp(r.needs.delight + 0.2);
      } else {
        const v = def.values.craft > 0.6 || def.traits.curious > 0.5 ? 0.4 : -0.4;
        host.mind.perceive(ctx, r, { subject: `m:${memory.id}`, aspect: v > 0 ? 'glorious_failure' : 'too_noisy', valence: v, base: 0.35, source: 'witnessed', placeId: g.placeId, note: `${g.label} went bang` });
      }
    }
    // Shared evenings bring people closer, whether or not they are well matched.
    for (const a of attendees) {
      for (const b of attendees) {
        if (a === b) continue;
        const fit = Math.max(0, warmth(residentDef(a.id), residentDef(b.id)));
        adjust(a, b.id, { affinity: (g.kind === 'festival' ? 0.015 : 0.01) + 0.03 * fit, familiarity: 0.03 }, state.tick);
      }
    }
    host.emitEvent({ t: state.tick, type: 'story', id: success ? `${g.kind}_success` : `${g.kind}_failure`, tone: success ? 'good' : 'neutral', cast: attendees.map((r) => r.id), place: g.placeId, topic: `m:${memory.id}` });
  } else {
    for (const r of attendees) r.needs.delight = clamp(r.needs.delight + 0.1);
  }
  host.emitEvent({ t: state.tick, type: 'gathering', phase: 'end', gathering: structuredClone(g) });
}

/** How strongly a gathering draws a particular resident, before distance and needs. */
export function gatheringPull(g: Gathering, r: ResidentState): number {
  const def = residentDef(r.id);
  let appeal = 0;
  for (const [v, w] of Object.entries(g.appeal)) appeal += (w ?? 0) * def.values[v as keyof typeof def.values];
  const reserved = 1 - unit(def.traits.sociable);
  return g.pull * (0.5 + appeal) - (g.kind === 'festival' ? 0.2 : 0.4) * reserved;
}


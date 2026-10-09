// Aspirations as plans (M3a, spec 4.2.8): each resident's hope is an authored chain of stages
// whose conditions are on the sim's state, so the simulation decides when, whether and with whom
// each one happens. Some stages need the steward (a building, timber, a festival going ahead).

import { buildingDef } from '../../content/buildings.js';
import { residentDef } from '../../content/residents.js';
import type { Perception } from '../mind/mind.js';
import { addEmotion, opinion } from '../mind/memory.js';
import { adjust, rel } from '../mind/relationships.js';
import { clamp, unit } from '../needs.js';
import { TICKS_PER_DAY, dayOf, seasonOf } from '../time.js';
import { STEWARD, type Request, type ResidentState, type SimState, type SubjectId } from '../types.js';
import { liveBuildings } from '../world.js';
import type { StoryHost } from './director.js';
import { active, addMemory } from './director.js';
import { chooseDream, templateDream } from './dreams.js';

/** What the aspiration engine needs beyond the storyteller's host. */
export interface AspirationHost extends StoryHost {
  ask(r: ResidentState, kind: Request['kind'], wants?: string): Request;
  depart(r: ResidentState): void;
}

export interface Stage {
  id: string;
  /** The next step, as the journal shows it: "Ask the steward for an orchard". */
  next: string;
  /** Has this stage been reached? Checked each morning. */
  check(h: AspirationHost, r: ResidentState): boolean;
  /** What happens when it is reached. */
  enter?(h: AspirationHost, r: ResidentState): void;
  /** Where working on this stage happens; time there counts, and the place pulls them. 'home' is their own home. */
  place?: string;
  /** A particular building of that type, when it matters which. */
  placeId?: number;
  /** Time at the place counts only with the partner there too. */
  together?: boolean;
  /**
   * Only needed until this building stands: designing it, asking for it. If the steward has already
   * built it, the step is skipped (owner playtest: Juniper drew and asked for a glasshouse that was
   * already there).
   */
  until?: string;
}

export interface AspirationDef {
  who: string;
  title: string;
  stages: Stage[];
}

const exists = (state: SimState, type: string) => liveBuildings(state).some((b) => b.type === type);
const days = (h: AspirationHost, r: ResidentState) => (h.state.tick - r.aspiration.since) / TICKS_PER_DAY;
const feel = (h: AspirationHost, r: ResidentState, p: Omit<Perception, 'source'>) => h.mind.perceive(h.mindContext(), r, { ...p, source: 'witnessed' });

/** Ask the steward for a dream building, unless already asked and still waiting, or refused twice. */
function askFor(h: AspirationHost, r: ResidentState, wants: string): void {
  if ((r.gaveUpUntil ?? -1) > h.state.tick) return;
  const mine = h.state.requests.filter((q) => q.by === r.id && q.kind === 'aspiration' && q.wants === wants);
  if (mine.some((q) => q.status === 'open')) return;
  if (mine.filter((q) => q.status === 'lapsed').length >= 2) return;
  const last = mine[mine.length - 1];
  if (last && h.state.tick - (last.closedTick ?? 0) < 5 * TICKS_PER_DAY) return;
  h.ask(r, 'aspiration', wants);
}

function friendsOf(r: ResidentState): string[] {
  return Object.entries(r.rel)
    .filter(([id, x]) => id !== 'steward' && x.tags.includes('friend'))
    .map(([id]) => id);
}

function attendedFestival(state: SimState, id: string): boolean {
  return state.story.memories.some((m) => m.kind === 'festival' && m.attendees.includes(id));
}

export const ASPIRATIONS: Record<string, AspirationDef> = {
  ada: {
    who: 'ada',
    title: "Plant the orchard her sister planned",
    stages: [
      {
        id: 'confide',
        next: 'Tell a close friend about her sister\'s orchard',
        check: (_h, r) => friendsOf(r).length > 0,
        enter: (h, r) => {
          const friend = friendsOf(r).sort((a, b) => rel(r, b).affinity - rel(r, a).affinity)[0] as string;
          r.aspiration.partner = friend;
          adjust(r, friend, { affinity: 0.05, trust: 0.05 }, h.state.tick);
          adjust(h.state.residents[friend] as ResidentState, r.id, { affinity: 0.05 }, h.state.tick);
        },
      },
      {
        id: 'ask',
        next: 'Ask the steward for an orchard',
        until: 'orchard',
        check: (h, r) => days(h, r) >= 1,
        enter: (h, r) => {
          if (!exists(h.state, 'orchard')) askFor(h, r, 'orchard');
        },
      },
      {
        id: 'planted',
        next: 'Wait for the orchard to be planted',
        check: (h, r) => {
          if (!exists(h.state, 'orchard')) askFor(h, r, 'orchard');
          return exists(h.state, 'orchard');
        },
        enter: (h, r) => feel(h, r, { subject: 'steward', aspect: 'granted_wish', valence: 1, base: 1.2, note: 'planted my sister\'s orchard' }),
      },
      {
        id: 'tend',
        next: 'Tend the young trees',
        place: 'orchard',
        check: (_h, r) => r.aspiration.minutes >= 6 * 60,
      },
      {
        id: 'harvest',
        next: 'Bring in the first apples at harvest',
        place: 'orchard',
        check: (h) => seasonOf(h.state.tick) === 'autumn' || seasonOf(h.state.tick) === 'winter',
        enter: (h, r) => {
          h.state.stock.food += 10;
          const m = addMemory(h, { tick: h.state.tick, kind: 'festival', label: "the first apples from Ada's orchard", placeId: null, attendees: active(h.state).map((x) => x.id) });
          for (const x of active(h.state)) feel(h, x, { subject: `m:${m.id}`, aspect: 'wonderful_time', valence: 0.7, base: x === r ? 0.9 : 0.35, note: 'the first apples' });
        },
      },
    ],
  },
  bram: {
    who: 'bram',
    title: 'Bake for the whole valley at the Harvest Supper',
    stages: [
      {
        id: 'ovens',
        next: 'Find a bakery to work in',
        check: (h, r) => {
          const job = r.jobId !== null ? h.state.buildings.find((b) => b.id === r.jobId) : undefined;
          return job?.type === 'bakery';
        },
      },
      {
        id: 'win',
        next: 'Win the town over with his bread',
        place: 'bakery',
        check: (h, r) => {
          const bakery = liveBuildings(h.state).find((b) => b.type === 'bakery');
          const fans = bakery ? active(h.state).filter((x) => x !== r && opinion(x, `b:${bakery.id}`) > 0.1).length : 0;
          return fans >= 2 || r.aspiration.minutes >= 20 * 60;
        },
      },
      {
        id: 'plan',
        next: 'Plan a feast for the Harvest Supper',
        check: (h) => seasonOf(h.state.tick) === 'autumn',
      },
      {
        id: 'feast',
        next: 'Bake for everyone at the Harvest Supper',
        check: (h, r) => {
          const supper = h.state.story.memories.find((m) => m.label === 'Harvest Supper' && m.tick >= r.aspiration.since);
          return !!supper && exists(h.state, 'bakery') && h.state.stock.food >= 5;
        },
        enter: (h, r) => {
          h.state.stock.food = Math.max(0, h.state.stock.food - 5);
          for (const x of active(h.state)) if (x !== r) feel(h, x, { subject: `r:${r.id}`, aspect: 'kind_to_me', valence: 0.8, base: 0.5, note: 'fed the whole valley at the Harvest Supper' });
        },
      },
    ],
  },
  fen: {
    who: 'fen',
    title: 'Teach someone to fish properly',
    stages: [
      {
        id: 'student',
        next: 'Find someone willing to learn',
        check: (h, r) => {
          const keen = active(h.state)
            .filter((x) => x !== r && unit(residentDef(x.id).traits.curious) > 0.6 && rel(r, x.id).affinity >= 0.2 && rel(x, r.id).affinity >= 0.15)
            .sort((a, b) => rel(r, b.id).affinity - rel(r, a.id).affinity)[0];
          if (keen) r.aspiration.partner = keen.id;
          return !!keen;
        },
      },
      {
        id: 'lessons',
        next: 'Teach {partner} at the jetty',
        place: 'jetty',
        together: true,
        check: (_h, r) => r.aspiration.minutes >= 4 * 60,
        enter: (h, r) => {
          const p = r.aspiration.partner && (h.state.residents[r.aspiration.partner] as ResidentState | undefined);
          if (p) {
            adjust(r, p.id, { affinity: 0.12, trust: 0.1 }, h.state.tick);
            adjust(p, r.id, { affinity: 0.12, trust: 0.1 }, h.state.tick);
            p.needs.purpose = clamp(p.needs.purpose + 0.3);
          }
        },
      },
      {
        id: 'proud',
        next: 'See {partner} land a fish alone',
        check: (h, r) => days(h, r) >= 2,
        enter: (h, r) => {
          h.state.stock.food += 3;
          const p = r.aspiration.partner && (h.state.residents[r.aspiration.partner] as ResidentState | undefined);
          if (p) feel(h, p, { subject: `r:${r.id}`, aspect: 'kind_to_me', valence: 0.8, base: 0.6, note: 'taught me to fish' });
        },
      },
    ],
  },
  juniper: {
    who: 'juniper',
    title: 'Build a glasshouse the town can use all winter',
    stages: [
      {
        id: 'design',
        next: 'Sketch a glasshouse at the workshop',
        until: 'glasshouse',
        place: 'workshop',
        check: (_h, r) => r.aspiration.minutes >= 10 * 60,
      },
      {
        id: 'ask',
        next: 'Ask the steward for a glasshouse',
        until: 'glasshouse',
        check: () => true,
        enter: (h, r) => {
          if (!exists(h.state, 'glasshouse')) askFor(h, r, 'glasshouse');
        },
      },
      {
        id: 'built',
        next: 'Wait for the glasshouse to go up',
        check: (h, r) => {
          if (!exists(h.state, 'glasshouse')) askFor(h, r, 'glasshouse');
          return exists(h.state, 'glasshouse');
        },
        enter: (h, r) => feel(h, r, { subject: 'steward', aspect: 'granted_wish', valence: 1, base: 1.2, note: 'built my glasshouse' }),
      },
      {
        id: 'winter',
        next: 'Keep the town fed through winter',
        place: 'glasshouse',
        check: (h) => seasonOf(h.state.tick) === 'winter',
        enter: (h) => {
          for (const x of active(h.state)) feel(h, x, { subject: 'r:juniper', aspect: 'kind_to_me', valence: 0.6, base: 0.35, note: 'greens from the glasshouse in winter' });
        },
      },
    ],
  },
  wren: {
    who: 'wren',
    title: "Paint the town's banner",
    stages: [
      {
        id: 'love',
        next: 'Find three things to love about the town',
        check: (_h, r) => Object.values(r.beliefs).filter((b) => (b.subject.startsWith('b:') || b.subject.startsWith('m:')) && b.valence > 0).length >= 3,
      },
      {
        id: 'sketch',
        next: 'Sketch the banner at a festival',
        check: (h, r) => attendedFestival(h.state, r.id),
      },
      {
        id: 'ask',
        next: 'Ask the steward for a banner pole',
        until: 'banner',
        check: () => true,
        enter: (h, r) => {
          if (!exists(h.state, 'banner')) askFor(h, r, 'banner');
        },
      },
      {
        id: 'paint',
        next: 'Paint the banner',
        check: (h, r) => {
          if (!exists(h.state, 'banner')) askFor(h, r, 'banner');
          return exists(h.state, 'banner');
        },
        enter: (h, r) => {
          const m = addMemory(h, { tick: h.state.tick, kind: 'festival', label: "the day Wren's banner went up", placeId: null, attendees: active(h.state).map((x) => x.id) });
          for (const x of active(h.state)) feel(h, x, { subject: `m:${m.id}`, aspect: 'wonderful_time', valence: 0.7, base: x === r ? 0.9 : 0.3, note: "Wren's banner" });
        },
      },
    ],
  },
  marlow: {
    who: 'marlow',
    title: 'Decide whether to stay, or follow the trade cart',
    stages: [
      {
        id: 'restless',
        next: 'Watch the trade cart come and go',
        check: (h, r) => h.state.story.gatherings.filter((g) => g.kind === 'trade_cart' && g.attendees.includes(r.id)).length >= 2 || dayOf(h.state.tick) >= 10,
      },
      {
        id: 'decide',
        next: "Make up his mind before the cart's last visit of the year",
        check: (h) => dayOf(h.state.tick) >= 23,
        enter: (h, r) => {
          // What he has here: friends, how settled he feels, how the steward treats him.
          const friends = friendsOf(r).length;
          const score = 0.3 * Math.min(friends, 3) + 0.9 * r.disposition + 0.4 * (rel(r, 'steward').affinity) - 1.05;
          r.aspiration.outcome = score > 0 ? 'stay' : 'leave';
          // Going is said before it is done (bar round 2): the week's notice the town gets from anyone else.
          if (score <= 0 && !r.leaving) {
            r.leaving = { sinceDay: dayOf(h.state.tick), dream: true };
            h.emitEvent({ t: h.state.tick, type: 'thinking_of_leaving', who: r.id });
          }
          if (score > 0) {
            for (const f of friendsOf(r)) {
              const x = h.state.residents[f] as ResidentState | undefined;
              if (x && !x.departed) feel(h, x, { subject: `r:${r.id}`, aspect: 'kind_to_me', valence: 0.7, base: 0.5, note: 'decided to stay' });
            }
          }
        },
      },
    ],
  },
};

/** The dream a resident is living now: their authored first dream, or one formed since (M3b). */
export function dreamOf(state: SimState, r: ResidentState): AspirationDef | undefined {
  return r.aspiration.kind ? templateDream(state, r) : ASPIRATIONS[r.id];
}

/** The stage a resident is working towards now, if any. */
export function currentStage(state: SimState, r: ResidentState): Stage | undefined {
  if (r.aspiration.done) return undefined;
  return dreamOf(state, r)?.stages[r.aspiration.stage];
}

/** A dream's subject, as words: "Wren", "the old oak", "Blossom Day", "the steward". */
export function subjectWords(state: SimState, s: SubjectId | undefined): string {
  if (!s || s === STEWARD) return 'the steward';
  if (s.startsWith('r:')) return residentDef(s.slice(2)).name;
  if (s.startsWith('m:')) return state.story.memories.find((m) => `m:${m.id}` === s)?.label ?? 'that day';
  const b = state.buildings.find((x) => `b:${x.id}` === s);
  return b ? `the ${b.type === 'oak' ? 'old oak' : buildingDef(b.type).name.toLowerCase()}` : 'that place';
}

function fillDream(state: SimState, r: ResidentState, text: string): string {
  const partner = r.aspiration.partner ? residentDef(r.aspiration.partner).name : 'someone';
  return text.replace(/\{partner\}/g, partner).replace(/\{x\}/g, subjectWords(state, r.aspiration.subject));
}

/** The dream's title, with its subject filled in. */
export function dreamTitle(state: SimState, r: ResidentState): string | null {
  const d = dreamOf(state, r);
  return d ? fillDream(state, r, d.title) : null;
}

/** The journal's "next step", with the partner's name filled in. */
export function nextStep(state: SimState, r: ResidentState): string | null {
  const s = currentStage(state, r);
  if (!s) return null;
  return fillDream(state, r, s.next);
}

/** A few days after a dream is done, a new one forms from what they have lived through. */
const DREAM_REST_DAYS = 4;

function formNewDream(h: AspirationHost, r: ResidentState): void {
  const a = r.aspiration;
  if (!a.done || a.outcome === 'leave') return;
  if (h.state.tick - (a.doneTick ?? a.since) < DREAM_REST_DAYS * TICKS_PER_DAY) return;
  const choice = chooseDream(h.state, r);
  if (!choice) return;
  const past = [...(a.past ?? []), a.kind ?? 'authored'];
  r.aspiration = {
    stage: 0,
    since: h.state.tick,
    minutes: 0,
    done: false,
    kind: choice.kind,
    subject: choice.subject,
    completed: a.completed ?? 0,
    past: past.slice(-6),
  };
  addEmotion(r, { kind: 'joy', intensity: 0.3, tick: h.state.tick });
  h.emitEvent({ t: h.state.tick, type: 'dream_formed', who: r.id, kind: choice.kind, subject: choice.subject, title: dreamTitle(h.state, r) ?? '' });
}

/** Each morning: advance whoever's next stage has come about, and let new dreams form. */
export function aspirationMorning(h: AspirationHost): void {
  for (const r of active(h.state)) {
    formNewDream(h, r);
    advanceStage(h, r);
  }
}

/** Days a step may wait on the steward before the dreamer lets it go. */
export const LET_GO_DAYS = 8;

function letGo(h: AspirationHost, r: ResidentState): boolean {
  const state = h.state;
  if (state.tick - r.aspiration.since < LET_GO_DAYS * TICKS_PER_DAY) return false;
  // Only a building this dream asks for counts: not, say, Juniper's granary for the winter stores.
  const def = dreamOf(state, r);
  if (!def) return false;
  const refs = new Set(def.stages.flatMap((st) => [st.until, st.place]).filter((x): x is string => !!x && x !== 'home'));
  const ask = state.requests.find((q) => q.by === r.id && q.kind === 'aspiration' && (q.status === 'open' || q.status === 'lapsed') && !!q.wants && refs.has(q.wants) && !exists(state, q.wants));
  if (!ask || !ask.wants) return false;
  if (ask.status === 'open') {
    // Never answered: that is a lapse, and it counts towards giving up on the steward.
    ask.status = 'lapsed';
    ask.closedTick = state.tick;
    h.emitEvent({ t: state.tick, type: 'request_closed', request: { ...ask } });
  }
  r.aspiration.done = true;
  r.aspiration.outcome = 'let_go';
  r.aspiration.doneTick = state.tick;
  addEmotion(r, { kind: 'worry', intensity: 0.3, tick: state.tick });
  h.emitEvent({ t: state.tick, type: 'dream_let_go', who: r.id, wants: ask.wants });
  return true;
}

/** Residents whose current step is not yet reached: checked again after the steward builds something. */
export function waitingOnStage(h: AspirationHost): Set<string> {
  const out = new Set<string>();
  for (const r of active(h.state)) {
    const stage = currentStage(h.state, r);
    if (dreamOf(h.state, r) && stage && !stage.check(h, r)) out.add(r.id);
  }
  return out;
}

/**
 * Right after a build (review: "I'm going to find a bakery to work in!" an hour after the bakery
 * went up): a step that was waiting and is now met advances at once, not at the next dawn.
 */
export function aspirationsAfterBuild(h: AspirationHost, waiting: Set<string>): void {
  for (const r of active(h.state)) if (waiting.has(r.id)) advanceStage(h, r);
}

/** Move a resident on to the next step of their dream if this one is reached. */
function advanceStage(h: AspirationHost, r: ResidentState): void {
  const def = dreamOf(h.state, r);
  if (!def) return;
  // Steps made moot by a building that already stands are passed over quietly; the step that
  // waits for the building then lands at once, and they know you got there first.
  let skipped = false;
  for (let s = currentStage(h.state, r); s?.until && exists(h.state, s.until); s = currentStage(h.state, r)) {
    r.aspiration.stage++;
    skipped = true;
  }
  if (skipped) {
    r.aspiration.since = h.state.tick;
    r.aspiration.minutes = 0;
  }
  const stage = currentStage(h.state, r);
  if (!stage) return;
  // A step that has waited on the steward for over a week is let go (bar round 2): the dreamer
  // makes do, says so, and in time dreams something else, rather than parking an ask for a month.
  if (letGo(h, r)) return;
  if (!stage.check(h, r)) return;
  stage.enter?.(h, r);
  r.aspiration.stage++;
  r.aspiration.since = h.state.tick;
  r.aspiration.minutes = 0;
  r.aspiration.done = r.aspiration.stage >= def.stages.length;
  if (r.aspiration.done) {
    r.aspiration.completed = (r.aspiration.completed ?? 0) + 1;
    r.aspiration.doneTick = h.state.tick;
  }
  // Every step forward feels like something.
  addEmotion(r, { kind: r.aspiration.done ? 'pride' : 'joy', intensity: r.aspiration.done ? 0.8 : 0.4, tick: h.state.tick });
  r.needs.purpose = clamp(r.needs.purpose + (r.aspiration.done ? 0.4 : 0.15));
  h.emitEvent({
    t: h.state.tick,
    type: 'aspiration',
    who: r.id,
    stage: stage.id,
    index: r.aspiration.stage,
    done: r.aspiration.done,
    ...(skipped ? { early: true } : {}),
    ...(r.aspiration.partner ? { partner: r.aspiration.partner } : {}),
    ...(r.aspiration.outcome ? { outcome: r.aspiration.outcome } : {}),
    ...(r.aspiration.kind ? { kind: r.aspiration.kind } : {}),
    ...(r.aspiration.subject ? { subject: r.aspiration.subject } : {}),
  });
  // Leaving itself follows the usual week of thinking about it (see the leaving countdown in sim.ts).
}

function atStagePlace(state: SimState, r: ResidentState, stage: Stage): boolean {
  if (r.at === null || !stage.place) return false;
  if (stage.place === 'home') return r.at === r.homeId;
  if (stage.placeId !== undefined) return r.at === stage.placeId;
  return state.buildings.find((x) => x.id === r.at)?.type === stage.place;
}

/** Each minute: time spent where the current stage happens counts towards it. */
export function aspirationMinute(state: SimState, r: ResidentState): void {
  const stage = currentStage(state, r);
  if (!stage || !atStagePlace(state, r, stage)) return;
  if (stage.together) {
    const p = r.aspiration.partner ? state.residents[r.aspiration.partner] : undefined;
    if (!p || p.at !== r.at) return;
  }
  r.aspiration.minutes++;
}

/** Where a resident's dream pulls them now, and how strongly (also pulls a partner along). */
export function aspirationPull(state: SimState, r: ResidentState): { type: string; placeId?: number; weight: number } | null {
  const mine = currentStage(state, r);
  if (mine?.place && mine.place !== 'home') return { type: mine.place, ...(mine.placeId !== undefined ? { placeId: mine.placeId } : {}), weight: 0.9 };
  // A partner is drawn to where the dreamer is waiting.
  for (const other of active(state)) {
    const s = currentStage(state, other);
    if (s?.together && other.aspiration.partner === r.id && s.place && atStagePlace(state, other, s)) {
      return { type: s.place, ...(s.placeId !== undefined ? { placeId: s.placeId } : {}), weight: 1.1 };
    }
  }
  return null;
}

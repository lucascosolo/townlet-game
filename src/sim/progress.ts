// Goals, renown, tiers and the Folk album (M4, DECISIONS.md 2026-10-04). Each morning brings three
// small goals drawn from what the town needs; completing them, granting asks and wishes, seeing
// dreams through, filling the stores and welcoming newcomers earn renown, and renown raises the
// town through the spec's tiers. Talking to residents reveals facts about them for the album.
// Everything here follows from sim events and steward commands, so a replay reaches the same place.

import { buildingDef, singularName } from '../content/buildings.js';
import { residentDef } from '../content/residents.js';
import { ambientPrefs } from './needs.js';
import { deriveSeed, weighted, type RngHolder } from './rng.js';
import { dreamTitle } from './story/aspirations.js';
import { active } from './story/director.js';
import { hasGranary, WINTER_DAY, dayOfYear } from './stores.js';
import { dayOf } from './time.js';
import type { Quality, ResidentState, SimEvent, SimState, TalkQuestion } from './types.js';

export const TIERS = ['Clearing', 'Hamlet', 'Village', 'Townlet'] as const;
/** Renown needed to reach each tier. */
/** Slower than it was (bar round 2: Hamlet on day 2). */
export const TIER_RENOWN = [0, 100, 300, 650];
/** How many may live in the valley at each tier. */
export const TIER_RESIDENTS = [8, 12, 16, 20];
/** Timber the neighbouring towns send when the town moves up a tier. */
export const TIER_GIFT = 8;

export const RENOWN = {
  goal: 3,
  allGoals: 5,
  request: 2,
  wish: 5,
  dream: 6,
  stores: 15,
  newcomer: 2,
  fact: 1,
} as const;

export type GoalKind = 'answer' | 'meet' | 'talk' | 'favour' | 'learn' | 'stores' | 'green';

export interface Goal {
  kind: GoalKind;
  target: number;
  count: number;
  done: boolean;
  /** For the stores goal: the granary's count at dawn. */
  from?: number;
}

export interface Progress {
  renown: number;
  tier: number;
  goals: { day: number; list: Goal[]; bonus: boolean };
  /** Facts revealed about each resident, by key, in the order learned. */
  known: Record<string, string[]>;
  /** Who has been talked to today (counted talks), for the talk goal. */
  talkedToday: string[];
  /** Question asked of whom on which day, so each question reveals one fact a day. */
  asked: Record<string, number>;
}

export function progressOf(state: SimState): Progress {
  return (state.progress ??= { renown: 0, tier: 0, goals: { day: 0, list: [], bonus: false }, known: {}, talkedToday: [], asked: {} });
}

export function residentCap(state: SimState): number {
  return TIER_RESIDENTS[progressOf(state).tier] ?? TIER_RESIDENTS[0]!;
}

/** Is this building available at the town's tier? Buildings from before M4 have no tier and always are. */
export function unlocked(state: SimState, type: string): boolean {
  return (buildingDef(type).tier ?? 0) <= progressOf(state).tier;
}

// ---------------------------------------------------------------- the Folk album

/** The facts there are to learn about anyone, and which question reveals each (one per question per day). */
export const FACTS: Record<TalkQuestion, string[]> = {
  how: ['job', 'lifts'],
  mind: ['needs', 'quirk', 'dislikes'],
  hope: ['dream', 'values'],
  me: [],
  opinion: ['friend', 'favourite'],
};
/** Learned by reading their page, not by asking (bar round 2: the bio recited inside "what do you think of me"). */
export const PAGE_FACTS = ['background'];
export const ALL_FACTS = [...Object.values(FACTS).flat(), ...PAGE_FACTS];

const QUALITY_LIKES: Record<Quality, [string, string]> = {
  noise: ['a bit of noise', 'peace and quiet'],
  bustle: ['a busy lane', 'calm, empty lanes'],
  green: ['growing things', 'bare ground'],
  scent: ['a good smell on the air', 'plain air'],
  water: ['being near water', 'staying dry'],
};

const QUIRK_WORDS: Record<string, string> = {
  // One whole sentence each (bar round 4: the page split this on its semicolon into "any noise at night wakes them").
  light_sleeper: 'Sleeps lightly, and wakes at the least noise',
  early_riser: 'Up before everyone else',
  homebody: 'Happiest at home',
  restless: "Can't sit still for long",
};

const VALUE_WORDS: Record<string, string> = {
  community: 'the town pulling together',
  nature: 'the valley as it is',
  craft: 'good work, well made',
  prosperity: 'getting on in the world',
  beauty: 'beautiful things',
  quiet: 'peace and quiet',
};

/** The town's average of something about each resident still here. */
function castMean(state: SimState, of: (d: ReturnType<typeof residentDef>, r: ResidentState) => Record<string, number>): Record<string, number> {
  const sum: Record<string, number> = {};
  let n = 0;
  for (const id of state.order) {
    const x = state.residents[id];
    if (!x || x.departed) continue;
    n++;
    for (const [k, v] of Object.entries(of(residentDef(id), x))) sum[k] = (sum[k] ?? 0) + v;
  }
  for (const k of Object.keys(sum)) sum[k] = (sum[k] as number) / Math.max(1, n);
  return sum;
}

/** A fact about a resident, in words, read from their current state (so it is always true). */
export function factValue(state: SimState, r: ResidentState, key: string): string {
  const def = residentDef(r.id);
  const prefs = ambientPrefs(def);
  const ranked = (Object.entries(prefs) as Array<[Quality, number]>).map(([q, v]) => ({ q, v })).sort((a, b) => b.v - a.v);
  switch (key) {
    case 'job': {
      const job = r.jobId !== null ? state.buildings.find((b) => b.id === r.jobId) : undefined;
      if (job) return `Works at the ${buildingDef(job.type).name.toLowerCase()}`;
      if (def.job) {
        const one = singularName(def.job);
        return `Wants to work at ${/^[aeiou]/i.test(one) ? 'an' : 'a'} ${one}`;
      }
      return 'Keeps house and helps where needed';
    }
    case 'lifts': {
      // What they love more than the rest of the town does (bar round 5: four of six founders "love
      // growing things"); noise they love is the noise they mind least.
      const mean = castMean(state, (d) => ambientPrefs(d) as unknown as Record<string, number>);
      const top = [...ranked].filter((x) => x.q !== 'noise' || x.v > 0).map((x) => ({ ...x, rel: x.v - (mean[x.q] ?? 0) })).sort((a, b) => b.rel - a.rel)[0] as { q: Quality; v: number; rel: number };
      return `Loves ${top.q === 'noise' ? QUALITY_LIKES.noise[top.v > 0 ? 0 : 1] : QUALITY_LIKES[top.q][0]}`;
    }
    case 'dislikes': {
      // What they mind more than the rest of the town does (bar round 4: every founder "can't abide
      // noise", Bram included): their liking set against the town's average.
      const mean = castMean(state, (d) => ambientPrefs(d) as unknown as Record<string, number>);
      const worst = [...ranked].map((x) => ({ ...x, rel: x.v - (mean[x.q] ?? 0) })).sort((a, b) => a.rel - b.rel)[0] as { q: Quality; v: number; rel: number };
      return worst.v < 0 && worst.rel < -0.05 ? `Can't abide ${worst.q === 'noise' ? 'noise, especially at night' : QUALITY_LIKES[worst.q][0]}` : `Not much bothers ${def.pronouns.obj}`;
    }
    case 'quirk':
      return def.quirks.length ? def.quirks.map((q) => QUIRK_WORDS[q] ?? q).join('; ') : 'No odd habits to speak of';
    case 'needs': {
      // The need they feel more than most (bar round 4: rest is highest for everyone, so all six
      // founders "need plenty of rest").
      const mean = castMean(state, (_d, x) => x.setpoints as unknown as Record<string, number>);
      const most = (Object.entries(r.setpoints) as Array<[string, number]>).map(([k, v]) => [k, v - (mean[k] ?? v)] as const).sort((a, b) => b[1] - a[1])[0];
      return most && most[1] > 0.02 ? `Needs more ${most[0]} than most` : 'Easy to please';
    }
    case 'dream':
      return dreamTitle(state, r) ?? `Still working out what ${def.pronouns.subj} ${def.pronouns.subj === 'they' ? 'want' : 'wants'}`;
    case 'values': {
      const top = (Object.entries(def.values) as Array<[string, number]>).sort((a, b) => b[1] - a[1]).slice(0, 2);
      return `Cares about ${top.map(([v]) => VALUE_WORDS[v] ?? v).join(' and ')}`;
    }
    case 'background':
      return def.background;
    case 'friend': {
      const best = Object.entries(r.rel)
        .filter(([id]) => id !== 'steward' && state.residents[id] && !state.residents[id]?.departed)
        .sort((a, b) => b[1].affinity - a[1].affinity)[0];
      return best && best[1].affinity > 0.1 ? `Closest to ${residentDef(best[0]).name}` : 'No close friend yet';
    }
    case 'favourite': {
      const fav = Object.values(r.beliefs)
        .filter((b) => b.subject.startsWith('b:') && b.valence > 0)
        .sort((a, b) => b.strength - a.strength)[0];
      const b = fav ? state.buildings.find((x) => `b:${x.id}` === fav.subject && !x.removed) : undefined;
      return b ? `Favourite spot: the ${buildingDef(b.type).name.toLowerCase()}` : 'No favourite spot yet';
    }
    default:
      return '';
  }
}

export function knownFacts(state: SimState, id: string): string[] {
  return progressOf(state).known[id] ?? [];
}

// ---------------------------------------------------------------- events in, renown out

export interface ProgressHost {
  readonly state: SimState;
  emitEvent(e: SimEvent): void;
}

function addRenown(h: ProgressHost, amount: number, why: string): void {
  const p = progressOf(h.state);
  p.renown += amount;
  h.emitEvent({ t: h.state.tick, type: 'renown', amount, total: p.renown, why });
  while (p.tier < TIERS.length - 1 && p.renown >= (TIER_RENOWN[p.tier + 1] as number)) {
    p.tier++;
    h.state.stock.timber = Math.min(100, h.state.stock.timber + TIER_GIFT);
    h.emitEvent({ t: h.state.tick, type: 'tier', tier: p.tier, name: TIERS[p.tier] as string, unlocks: tierUnlocks(p.tier), cap: residentCap(h.state) });
  }
}

/** Buildings that open up at a tier. */
export function tierUnlocks(tier: number): string[] {
  return TIER_BUILDINGS[tier] ?? [];
}
// Bar round 7: the fountain opens at Hamlet, so mid-game timber has somewhere to go (it piled to 74).
const TIER_BUILDINGS: Record<number, string[]> = { 1: ['beehives', 'fountain'], 2: ['coop'] };

function bump(h: ProgressHost, kind: GoalKind, by = 1): void {
  const p = progressOf(h.state);
  if (p.goals.day !== dayOf(h.state.tick)) return;
  for (const g of p.goals.list) {
    if (g.kind !== kind || g.done) continue;
    g.count = Math.min(g.target, g.count + by);
    if (g.count >= g.target) {
      g.done = true;
      h.emitEvent({ t: h.state.tick, type: 'goal', phase: 'done', goal: { ...g } });
      addRenown(h, RENOWN.goal, `a goal: ${kind}`);
    }
  }
  if (!p.goals.bonus && p.goals.list.length > 0 && p.goals.list.every((g) => g.done)) {
    p.goals.bonus = true;
    h.emitEvent({ t: h.state.tick, type: 'goal', phase: 'all' });
    addRenown(h, RENOWN.allGoals, "all of today's goals");
  }
}

const GREEN = new Set(['hedge', 'flowerbed', 'orchard', 'beehives']);

/** Each sim event that matters to goals, renown or the album. */
export function progressEvent(h: ProgressHost, e: SimEvent): void {
  const state = h.state;
  switch (e.type) {
    case 'request_closed':
      if (e.request.status === 'fulfilled') {
        addRenown(h, RENOWN.request, 'an ask granted');
        bump(h, 'answer');
      }
      break;
    case 'wish':
      if (e.phase === 'granted') addRenown(h, RENOWN.wish, 'a Town Wish granted');
      break;
    case 'aspiration':
      if (e.done) addRenown(h, RENOWN.dream, 'a dream come true');
      break;
    case 'stores':
      if (e.phase === 'met') addRenown(h, RENOWN.stores, 'the winter stores');
      break;
    case 'arrived':
      addRenown(h, RENOWN.newcomer, 'a newcomer');
      break;
    case 'built':
      if (GREEN.has(e.btype)) bump(h, 'green');
      break;
    case 'favour':
      if (e.phase === 'agreed') bump(h, 'favour');
      break;
    case 'talk':
      onTalk(h, e.who, e.answer.question, e.counted, e.answer.about);
      break;
    default:
  }
}

const QUIRK_SAID: Record<string, string> = {
  light_sleeper: 'I sleep lightly. The least noise at night and I am awake.',
  early_riser: 'I am up before anyone else, most days.',
  homebody: 'I am happiest at home, truth be told.',
  restless: "I can't sit still for long.",
};

const NEED_SAID: Record<string, string> = {
  rest: 'a good long sleep',
  food: 'a full plate',
  comfort: 'my comforts',
  company: 'company',
  purpose: 'something useful to do',
  delight: 'a little fun',
};

/** Bar round 6: facts that say there is nothing to tell; they do not close an answer that already said something. */
export const NOTHING_SAID = new Set(['Not much bothers me, truly.', 'I have no odd habits to speak of.', 'I am easy to please.', "I haven't a close friend here yet.", "I haven't found a favourite spot yet."]);

/**
 * The same fact as the resident says it, so what you learn is what you were told (owner playtest:
 * "Getting to know Ada: can't abide noise at night" followed a reply about something else).
 */
/** Bar round 7: a fact in one of several wordings, fixed per resident ("What matters to me is" eight times in a month). */
function said(state: SimState, r: ResidentState, ways: string[]): string {
  const i = Math.max(0, state.order.indexOf(r.id));
  return ways[i % ways.length] as string;
}

export function factSaid(state: SimState, r: ResidentState, key: string): string {
  const def = residentDef(r.id);
  const value = factValue(state, r, key);
  switch (key) {
    case 'job': {
      const job = r.jobId !== null ? state.buildings.find((b) => b.id === r.jobId) : undefined;
      if (job) return said(state, r, [`I work at the ${buildingDef(job.type).name.toLowerCase()}.`, `You'll find me at the ${buildingDef(job.type).name.toLowerCase()} most days.`, `My days go to the ${buildingDef(job.type).name.toLowerCase()}.`, `I'm at the ${buildingDef(job.type).name.toLowerCase()} most of the day.`, `The ${buildingDef(job.type).name.toLowerCase()} is where I earn my keep.`, `Mornings, I'm off to the ${buildingDef(job.type).name.toLowerCase()}.`]);
      if (def.job) {
        const one = singularName(def.job);
        return `I'd love to work at ${/^[aeiou]/i.test(one) ? 'an' : 'a'} ${one}.`;
      }
      return 'I keep house and help where I can.';
    }
    case 'lifts':
      return said(state, r, [`Nothing lifts me like ${lowerFirst(value.replace(/^Loves /, ''))}.`, `Give me ${lowerFirst(value.replace(/^Loves /, ''))} and I'm happy.`, `I'm never better than with ${lowerFirst(value.replace(/^Loves /, ''))}.`, `${value.replace(/^Loves /, '').replace(/^./, (c) => c.toUpperCase())} always cheers me.`, `If I'm low, ${lowerFirst(value.replace(/^Loves /, ''))} sets me right.`, `There's no better tonic for me than ${lowerFirst(value.replace(/^Loves /, ''))}.`]);
    case 'dislikes':
      return value.startsWith("Can't abide") ? `I can't abide ${value.replace(/^Can't abide /, '')}.` : 'Not much bothers me, truly.';
    case 'quirk':
      return def.quirks.length ? def.quirks.map((q) => QUIRK_SAID[q] ?? '').filter(Boolean).join(' ') || 'I have my habits, like anyone.' : 'I have no odd habits to speak of.';
    case 'needs': {
      const need = value.match(/^Needs more (\w+) than most$/)?.[1];
      return need ? said(state, r, [`I need ${NEED_SAID[need] ?? need}, more than most.`, `Without ${NEED_SAID[need] ?? need} I'm no good to anyone.`, `More than most, I need ${NEED_SAID[need] ?? need}.`, `I go to pieces without ${NEED_SAID[need] ?? need}.`, `Give me ${NEED_SAID[need] ?? need} and I'm no trouble.`, `${(NEED_SAID[need] ?? need).replace(/^./, (c) => c.toUpperCase())}: I can't do without it.`]) : 'I am easy to please.';
    }
    case 'dream':
      // The dream is the answer to "what are you hoping for" itself; it is learned, not said twice (bar round 1).
      return '';
    case 'values':
      return said(state, r, [`What matters to me is ${value.replace(/^Cares about /, '')}.`, `I care about ${value.replace(/^Cares about /, '')}, above most things.`, `If you want to know me, I set great store by ${value.replace(/^Cares about /, '')}.`, `${value.replace(/^Cares about /, '').replace(/^./, (c) => c.toUpperCase())}: that's what I care about.`, `For me it all comes down to ${value.replace(/^Cares about /, '')}.`, `I hold ${value.replace(/^Cares about /, '')} dear, and always have.`]);
    case 'background':
      // In their own words (bar round 1: a bare lead-in with nothing after it).
      return def.bio ?? `I came to the valley for my own reasons. Ask me again some time.`;
    case 'friend':
      return value.startsWith('Closest to ') ? `${value.replace(/^Closest to /, '')} is my closest friend here.` : "I haven't a close friend here yet.";
    case 'favourite':
      return value.startsWith('Favourite spot: ') ? `My favourite spot is ${value.replace(/^Favourite spot: /, '')}.` : "I haven't found a favourite spot yet.";
  }
  return '';
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** The fact a question would reveal now, if any: one per question per resident per day, the next not yet known. */
export function nextFact(state: SimState, who: string, question: TalkQuestion, about?: string): string | null {
  const p = progressOf(state);
  if (p.asked[`${who}|${question}`] === dayOf(state.tick)) return null;
  const known = p.known[who] ?? [];
  // "What do you think of…" reveals the closest friend only when asked about a person, and the
  // favourite spot only when asked about a place (bar round 1: a friend bolted onto any opinion).
  const pool = question === 'opinion' ? (about?.startsWith('r:') ? ['friend'] : about?.startsWith('b:') ? ['favourite'] : []) : (FACTS[question] ?? []);
  // Each resident gives the facts in their own order (bar round 2: a town's first "what's on your
  // mind" answers all ended "I need a good long sleep").
  const k = pool.length ? Math.max(0, state.order.indexOf(who)) % pool.length : 0;
  const turned = [...pool.slice(k), ...pool.slice(0, k)];
  // Bar round 8: the dream is learned only while there is one ("No big plans" as the album revealed the banner).
  const r = state.residents[who];
  const dreaming = !!r && !r.aspiration.done && dreamTitle(state, r) !== null;
  return turned.find((f) => !known.includes(f) && (f !== 'dream' || dreaming)) ?? null;
}

/** Learn a fact outright, as reading their page does for the background (bar round 2). */
export function learnFact(h: ProgressHost, who: string, fact: string): boolean {
  const state = h.state;
  const p = progressOf(state);
  const known = (p.known[who] ??= []);
  if (known.includes(fact)) return false;
  const first = known.length === 0;
  known.push(fact);
  h.emitEvent({ t: state.tick, type: 'fact', who, key: fact, first });
  addRenown(h, RENOWN.fact, 'getting to know someone');
  bump(h, 'learn');
  if (first) bump(h, 'meet');
  return true;
}

function onTalk(h: ProgressHost, who: string, question: TalkQuestion, counted: boolean, about?: string): void {
  const state = h.state;
  const p = progressOf(state);
  const day = dayOf(state.tick);
  if (counted && !p.talkedToday.includes(who)) {
    p.talkedToday.push(who);
    bump(h, 'talk');
  }
  const fact = nextFact(state, who, question, about);
  p.asked[`${who}|${question}`] = day;
  if (fact) learnFact(h, who, fact);
}

/** Each dawn: new goals for the day. */
export function progressDawn(h: ProgressHost): void {
  const state = h.state;
  const p = progressOf(state);
  const day = dayOf(state.tick);
  p.talkedToday = [];
  const people = active(state);
  const unmet = people.filter((r) => knownFacts(state, r.id).length === 0);
  const open = state.requests.filter((q) => q.status === 'open');
  const q = state.stores;
  const storesOn = !!q?.asked && !q.outcome && hasGranary(state) && dayOfYear(state.tick) < WINTER_DAY;
  const candidates: Array<{ goal: Goal; weight: number }> = [
    { goal: { kind: 'talk', target: Math.min(3, people.length), count: 0, done: false }, weight: 1 },
    { goal: { kind: 'favour', target: 1, count: 0, done: false }, weight: 1 },
    { goal: { kind: 'learn', target: 2, count: 0, done: false }, weight: 1 },
    { goal: { kind: 'green', target: 1, count: 0, done: false }, weight: 0.6 },
  ];
  // Only asks a build can grant today: a quieter night is judged after the night.
  if (open.some((q) => q.kind !== 'quieter_home')) candidates.push({ goal: { kind: 'answer', target: 1, count: 0, done: false }, weight: 3 });
  if (unmet.length) candidates.push({ goal: { kind: 'meet', target: 1, count: 0, done: false }, weight: 2.5 });
  if (storesOn) candidates.push({ goal: { kind: 'stores', target: 15, count: 0, done: false, from: Math.floor(state.granary ?? 0) }, weight: 2 });
  const rng: RngHolder = { rng: deriveSeed(state.seed, `goals:${day}`) };
  const list: Goal[] = [];
  while (list.length < 3 && candidates.length) {
    const c = weighted(rng, candidates, (x) => x.weight);
    if (!c) break;
    list.push(c.goal);
    candidates.splice(candidates.indexOf(c), 1);
  }
  p.goals = { day, list, bonus: false };
  h.emitEvent({ t: state.tick, type: 'goal', phase: 'new', goals: list.map((g) => ({ ...g })) });
}

/** Each hour: progress on the stores goal. */
export function progressHourly(h: ProgressHost): void {
  const p = progressOf(h.state);
  const g = p.goals.list.find((x) => x.kind === 'stores' && !x.done);
  if (!g || p.goals.day !== dayOf(h.state.tick)) return;
  const gained = Math.max(0, Math.floor(h.state.granary ?? 0) - (g.from ?? 0));
  if (gained > g.count) bump(h, 'stores', gained - g.count);
}

/** Which of today's goals are open, for the scripted goal-keeping steward and the UI. */
export function todaysGoals(state: SimState): Goal[] {
  const p = progressOf(state);
  return p.goals.day === dayOf(state.tick) ? p.goals.list : [];
}

/** Every unlockable building, with the tier it needs. */
export function lockedBuildings(state: SimState): string[] {
  return Object.values(TIER_BUILDINGS)
    .flat()
    .filter((t) => !unlocked(state, t));
}


/** A goal in words, for the board and the Goals panel. */
export function goalLabel(g: Goal): string {
  switch (g.kind) {
    case 'answer':
      return 'Grant something someone has asked for';
    case 'meet':
      return "Talk to someone you haven't met yet";
    case 'talk':
      return `Talk with ${g.target} different people`;
    case 'favour':
      return 'Ask someone a favour (and get a yes)';
    case 'learn':
      return `Learn ${g.target} new things about people (talk to them)`;
    case 'stores':
      return `Put ${g.target} more food by in the granary`;
    case 'green':
      return 'Plant something green (a hedge or flower bed)';
  }
}

/** Renown still needed for the next tier, or null at the top. */
export function nextTier(state: SimState): { name: string; need: number; from: number; to: number } | null {
  const p = progressOf(state);
  if (p.tier >= TIERS.length - 1) return null;
  return { name: TIERS[p.tier + 1] as string, need: (TIER_RENOWN[p.tier + 1] as number) - p.renown, from: TIER_RENOWN[p.tier] as number, to: TIER_RENOWN[p.tier + 1] as number };
}

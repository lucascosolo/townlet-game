// The simulation loop. Owns the body and the world; delegates cognition to a Mind.

import { recallFor, storyKey } from './recall.js';
import { applyReply, offersFor, offersForCut, type AnswerCut, type ReplyKind, type ReplyResult } from './replies.js';
import { buildingDef } from '../content/buildings.js';
import { generateNewcomer } from '../content/newcomers.js';
import { registerResident, residentDef } from '../content/residents.js';
import { chance, deriveSeed } from './rng.js';
import {
  ACTIVITY_EFFECTS,
  BASE_DECAY,
  ambientPrefs,
  clamp,
  needsWellbeing,
  prefScore,
  setpointsFor,
  sleepNoiseThreshold,
  unit,
} from './needs.js';
import type { Mind, MindContext, Perception } from './mind/mind.js';
import { attachment, decayEmotions, emotionBalance, opinion } from './mind/memory.js';
import { adjust, newRelationship, rel } from './mind/relationships.js';
import { StructuredMind } from './mind/structured.js';
import { ASK_KINDS, ASK_LAPSE_DAYS, WISH_LABELS, assess } from './asks.js';
import { voiceTopic } from './mind/thoughts.js';
import { runExchange } from './social.js';
import { memoryFits, reconcile, talkAnswer, memoryAgrees } from './talk.js';
import { bareLarder, lowLarder, townHunger, waitingOnYou } from './hunger.js';
import {
  ASKS_BEFORE_GRATING,
  CLEAR_MINUTES,
  FAVOUR_EXPIRES,
  FAVOUR_MINUTES,
  considerFavour,
  favourActivity,
  favourPlace,
  favourSatisfaction,
  favourYield,
  inFavourHours,
  recentAsks,
  type FavourVerdict,
} from './favours.js';
import { aspirationMinute, aspirationMorning, aspirationsAfterBuild, dreamTitle, waitingOnStage, type AspirationHost } from './story/aspirations.js';
import { activeGatherings, newStoryState, storyStep } from './story/director.js';
import { closeDilemma } from './story/dilemmas.js';
import { progressDawn, progressEvent, progressHourly, residentCap, learnFact } from './progress.js';
import { LARDER_CAP, drawFromGranary, overflowToGranary, storesDawn, storesHourly } from './stores.js';
import { DAWN_MINUTE, TICKS_PER_DAY, dayOf, minuteOf, seasonOf, type Season } from './time.js';
import {
  NEEDS,
  QUALITIES,
  STEWARD,
  type ActivityState,
  type FavourKind,
  type TalkAnswer,
  type TalkQuestion,
  type Quality,
  type Request,
  type Resource,
  type Unseen,
  type BuildingState,
  type DilemmaType,
  type ExchangeKind,
  type SubjectId,
  type Need,
  type ResidentDef,
  type ResidentState,
  type SimEvent,
  type SimState,
} from './types.js';
import { ambientAt, canPlace, distanceTo, emptyQualities, footprint, getBuilding, liveBuildings, mainSource, nearestOpen, onFootprint, placeTile, route, seedWear, sizeOf, wearDawn, wearStep } from './world.js';

export type Command =
  | { at: number; kind: 'build'; type: string; x: number; y: number; rot?: number }
  | { at: number; kind: 'remove'; x: number; y: number }
  /** Answer the open dilemma of this type, if there is one. */
  | { at: number; kind: 'decide'; dilemma: DilemmaType; option: 'approve' | 'decline' }
  /** Talk with a resident: ask one of the fixed questions (M3b). */
  | { at: number; kind: 'talk'; who: string; question: TalkQuestion; about?: SubjectId }
  /** Ask a resident a favour (M3c). */
  | { at: number; kind: 'favour'; who: string; favour: FavourKind; other?: string; plot?: number }
  /** A trader's cart stops by with a gift: the reward for a watched ad, at most once a day (2026-10-08). */
  | { at: number; kind: 'gift'; from: 'trader' }
  /** Talk back after an answer: agree, push back, say sorry or explain (bar round 1). */
  | { at: number; kind: 'reply'; who: string; reply: ReplyKind; cut?: AnswerCut }
  /** The steward reads a resident's page (bar round 2): their background is learned there, not recited in talk. */
  | { at: number; kind: 'look'; who: string };

export interface Scenario {
  name: string;
  width: number;
  height: number;
  buildings: Array<{ type: string; x: number; y: number }>;
  /** Resident id -> index into `buildings` of their home. */
  residents: Record<string, number>;
  relationships?: Array<{ a: string; b: string; affinity: number; familiarity: number; trust: number }>;
  commands?: Command[];
  /** Tiles of wild land beyond the settled valley to the east and south, in 8x8 plots (M3c). Default 24; 0 for none. */
  wild?: number;
}

/** The size of a wild plot, in tiles. */
export const PLOT = 8;
const DEFAULT_WILD = 24;
/** Someone moves into an empty home this long after it is built. */
const NEWCOMER_DELAY = 2 * 60;
/** The valley's limit, for now: the sim and the screen stay comfortable. */
/** The most the valley ever holds; each tier allows fewer (progress.ts residentCap). */
export const MAX_RESIDENTS = 20;

const REQUEST_LAPSE_TICKS = 5 * TICKS_PER_DAY;
/** How far a resident can see a change to the town, in tiles. */
export /** Chance per waking hour of a passing thought. */
const THOUGHT_CHANCE = 0.35;
const SIGHT = 6;
/** News of a change reaches anyone awake this long after it happened. */
export const WORD_OF_MOUTH = 8 * 60;
/** Food one meal takes from the town's stores. */
export const MEAL = 0.5;
/** How much of a meal a meagre one is worth. */
export const MEAGRE_FILL = 0.1;
/** Foraging (bar round 2): a hungry resident with nothing in the larder goes to the brook or the wild edge. */
export const FORAGE_MINUTES = 90;
export const FORAGE_YIELD: Record<Season, number> = { spring: 1, summer: 1.6, autumn: 1.6, winter: 0.5 };
/** Meals take this much more in winter. */
export const WINTER_APPETITE = 2;
export const STOCK_CAP: Record<Resource, number> = { food: LARDER_CAP, timber: 100 };
/** What mood is made of (bar round 1): the day's needs, feelings, the home, a place to be fond of, and standing with the steward. */
export const MOOD_MIX = { needs: 0.5, feelings: 0.15, home: 0.12, fond: 0.03, standing: 0.2 } as const;
/** Bar round 4: a loved place lost weighs on mood (at most this much) for this many days. */
export const LOSS_WEIGHT = 0.09;
export const LOSS_DAYS = 4;
/** Bar round 4: below zero standing, mood falls this much more per unit (so −1 costs 0.15 more). */
export const LOW_STANDING = 0.15;
/** Bar round 4: the most the town's troubles take off mood together. */
export const FELT_CAP = 0.25;
/** Bar round 4: the most anyone thinks of you while the larder has been low two dawns running. */
export const LOW_LARDER_TOP = 0.85;
/** Bar round 7: standing after a loss you caused (workplace, dream building, a place held dear), for HURT_DAYS.
 * Bar round 8: 0.5 for a fortnight (was 0.6 for ten days), so the You tab never says "thinks the world of you" of them. */
export const HURT_TOP = 0.5;
export const HURT_DAYS = 14;
/** Bar round 7: nobody holding something against you from the last week thinks the world of you. */
export const FRESH_GRIEVANCE_TOP = 0.85;
export const FRESH_GRIEVANCE_DAYS = 7;
/** Bar round 5: 30 timber to start (was 25): seventeen builds were refused for timber in the first fortnight. */
/** Bar round 6: the woodlot yields this much more in the first fortnight (16 builds were refused for timber on days 3 to 14). */
export const EARLY_TIMBER = 2.5;
/** ...while the store is low: a full woodyard needs no help. */
export const EARLY_TIMBER_BELOW = 20;
export const EARLY_TIMBER_DAYS = 14;
export const START_STOCK: Record<Resource, number> = { food: 20, timber: 30 };
/** What the trader's cart brings (the rewarded bonus): less than a cottage costs. */
/** How much telling a memory rehearses it: about as much as reminiscing with a friend. */
export const RECALL_REHEARSAL = 0.15;
export const TRADER_GIFT: Record<Resource, number> = { timber: 8, food: 6 };
/** Seasonal yield of buildings that grow food on their own. */
const PASSIVE_SEASON: Record<string, Record<ReturnType<typeof seasonOf>, number>> = {
  orchard: { spring: 0.2, summer: 0.6, autumn: 2, winter: 0 },
  glasshouse: { spring: 0.5, summer: 0.5, autumn: 0.7, winter: 0.7 },
  beehives: { spring: 1, summer: 1.3, autumn: 0.6, winter: 0 },
};
/**
 * Food work by season: gardens grow little in winter and plenty at harvest; flour runs short and
 * the brook ices over in winter (M4: the winter stores have to matter).
 */
const FOOD_SEASON: Record<string, Record<ReturnType<typeof seasonOf>, number>> = {
  garden: { spring: 0.8, summer: 1.1, autumn: 1.3, winter: 0.25 },
  bakery: { spring: 1, summer: 1, autumn: 1.1, winter: 0.5 },
  jetty: { spring: 1, summer: 1.1, autumn: 1, winter: 0.35 },
};

/** What a change in one ambient quality means to the person noticing it. */
function detailFor(q: Quality, change: number): string {
  switch (q) {
    case 'noise':
      return change < 0 ? 'quieter' : 'noisier';
    case 'green':
      return change > 0 ? 'greener' : 'barer';
    case 'bustle':
      return change > 0 ? 'busier' : 'calmer';
    case 'scent':
      return change > 0 ? 'scent' : 'scentless';
    case 'water':
      return change > 0 ? 'water' : 'dry';
  }
}

/** How often a resident's asks of this kind went ignored in the last fortnight. */
/** Every ask of theirs lapsed in the last fortnight. */
function allLapses(state: SimState, who: string, tick: number): number {
  return state.requests.filter((q) => q.by === who && q.status === 'lapsed' && (q.closedTick ?? 0) > tick - 14 * TICKS_PER_DAY).length;
}

function lapsesOf(state: SimState, who: string, kind: Request['kind'], tick: number): number {
  return state.requests.filter((q) => q.by === who && q.kind === kind && q.status === 'lapsed' && (q.closedTick ?? 0) > tick - 14 * TICKS_PER_DAY).length;
}

const ASK_THANKS: Record<Request['kind'], string> = {
  aspiration: 'helped me with my dream',
  quieter_home: 'a quiet night at last',
  workplace: 'a proper place to work',
  more_food: 'food on the table again',
  somewhere_to_sit: 'somewhere to sit near home',
  more_green: 'green by my door',
  place_to_gather: 'another place to gather',
  home_for_kin: 'a cottage for my cousin',
};

export const DETAIL_NOTES: Record<string, string> = {
  quieter: 'quieter at home now',
  noisier: 'noisier at home now',
  greener: 'greener by my door',
  barer: 'barer by my door',
  busier: 'busier round my way',
  calmer: 'calmer round my way',
  scent: 'smells lovely by my door',
  scentless: 'the smell has gone',
  water: 'water nearby',
  dry: 'further from the water',
  gather: 'somewhere to gather',
  sit: 'somewhere to sit',
  pretty: 'makes the town prettier',
  work: 'good, honest work for the town',
};
/** Disposition below this for three mornings running starts thoughts of leaving; above the second ends them. */
export const LEAVING_BELOW = 0.5;
export const STAYING_ABOVE = 0.55;

/** A resident's starting state, in their home; at tick 0 for the founding cast, later for newcomers. */
export function newResidentState(seed: number, id: string, home: BuildingState, tick: number): ResidentState {
  const def = residentDef(id);
  const [x, y] = placeTile(home);
  return {
    id,
    homeId: home.id,
    jobId: null,
    x,
    y,
    at: home.id,
    path: [],
    activity: tick === 0 ? { id: 'sleep', placeId: home.id, until: def.wake, night: true } : null,
    pending: null,
    needs: { rest: 0.8, food: 0.6, comfort: 0.7, company: 0.5, purpose: 0.6, delight: 0.6 },
    setpoints: setpointsFor(def),
    mood: 0.7,
    disposition: 0.65,
    dayMoodSum: 0,
    dayMoodN: 0,
    lowDays: 0,
    leaving: null,
    departed: false,
    emotions: [],
    buffer: [],
    episodes: [],
    traces: {},
    beliefs: {},
    // Nobody starts with a view of the steward (bar round 2): a kind band with no reason behind it hid the grievances they held.
    rel: { [STEWARD]: { ...newRelationship(), affinity: 0 } },
    told: {},
    lastExchange: {},
    sleepNoiseMax: 0,
    disturbedBy: [],
    visitAppraised: true,
    lastScentDay: 0,
    lastVisit: {},
    coldUntil: -1,
    unseen: [],
    ...(tick > 0 ? { arrivedTick: tick } : {}),
    // Newcomers arrive hoping to settle in; dreams of their own form from life here after that (M3b templates).
    aspiration: tick === 0 ? { stage: 0, since: 0, minutes: 0, done: false } : { stage: 0, since: tick, minutes: 0, done: false, kind: 'settle', completed: 0 },
    rng: deriveSeed(seed, `r:${id}`),
  };
}

export function createState(scenario: Scenario, seed: number): SimState {
  const state: SimState = {
    version: 2,
    seed,
    tick: 0,
    width: scenario.width + (scenario.wild ?? DEFAULT_WILD),
    height: scenario.height + (scenario.wild ?? DEFAULT_WILD),
    settled: { width: scenario.width, height: scenario.height },
    buildings: [],
    nextBuildingId: 1,
    residents: {},
    order: Object.keys(scenario.residents),
    requests: [],
    nextEpisodeId: 1,
    nextRequestId: 1,
    story: newStoryState(seed),
    stock: { ...START_STOCK },
    lastShortageDay: 0,
  };
  for (const b of scenario.buildings) {
    const err = canPlace(state, b.type, b.x, b.y);
    if (err) throw new Error(`scenario ${scenario.name}: ${b.type} at ${b.x},${b.y}: ${err}`);
    state.buildings.push({ id: state.nextBuildingId++, type: b.type, x: b.x, y: b.y, placedTick: 0, placedBy: 'founding', removed: false });
  }
  // Wild land to the east (across the brook) and south, after the founding buildings so their ids keep.
  const wildPlots: Array<[number, number]> = [];
  for (let y = 0; y < state.height; y += PLOT) {
    for (let x = 0; x < state.width; x += PLOT) {
      if (x >= scenario.width || y >= scenario.height) wildPlots.push([x, y]);
    }
  }
  for (const [x, y] of wildPlots) {
    state.buildings.push({ id: state.nextBuildingId++, type: 'wild', x, y, placedTick: 0, placedBy: 'founding', removed: false });
  }
  for (const [id, homeIdx] of Object.entries(scenario.residents)) {
    const home = state.buildings[homeIdx];
    if (!home || buildingDef(home.type).kind !== 'home') throw new Error(`scenario ${scenario.name}: ${id} has no home`);
    state.residents[id] = newResidentState(seed, id, home, 0);
  }
  for (const id of state.order) {
    const r = state.residents[id] as ResidentState;
    for (const other of state.order) if (other !== id) r.rel[other] = newRelationship();
    r.rel[STEWARD] = { ...newRelationship(), affinity: 0.2, familiarity: 0.5, trust: 0.5 };
  }
  for (const x of scenario.relationships ?? []) {
    for (const [a, b] of [
      [x.a, x.b],
      [x.b, x.a],
    ] as const) {
      const ra = state.residents[a];
      if (!ra) throw new Error(`scenario ${scenario.name}: unknown resident ${a}`);
      Object.assign(rel(ra, b), { affinity: x.affinity, familiarity: x.familiarity, trust: x.trust });
    }
  }
  return state;
}

export class Simulation implements AspirationHost {
  state: SimState;
  readonly mind: Mind;
  private listeners: Array<(e: SimEvent) => void> = [];
  private commands: Command[] = [];
  private worked = new Set<number>();

  constructor(state: SimState, mind: Mind = StructuredMind) {
    for (const def of state.newcomerDefs ?? []) registerResident(def);
    this.state = state;
    this.mind = mind;
    this.assignJobs();
  }

  static fromScenario(scenario: Scenario, seed: number, mind: Mind = StructuredMind): Simulation {
    const sim = new Simulation(createState(scenario, seed), mind);
    seedWear(sim.state);
    sim.schedule(scenario.commands ?? []);
    return sim;
  }

  /** An independent copy with the same state and pending commands, and no listeners. */
  clone(): Simulation {
    const sim = new Simulation(structuredClone(this.state), this.mind);
    sim.commands = this.commands.map((c) => ({ ...c }));
    return sim;
  }

  on(listener: (e: SimEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  schedule(commands: Command[]): void {
    this.commands.push(...commands);
    this.commands.sort((a, b) => a.at - b.at);
  }

  get tick(): number {
    return this.state.tick;
  }

  def(id: string): ResidentDef {
    return residentDef(id);
  }

  resident(id: string): ResidentState {
    const r = this.state.residents[id];
    if (!r) throw new Error(`no resident ${id}`);
    return r;
  }

  private emit = (e: SimEvent): void => {
    for (const l of this.listeners) l(e);
    progressEvent(this, e);
  };

  private ctx(): MindContext {
    return { state: this.state, tick: this.state.tick, worked: this.worked, emit: this.emit, def: residentDef };
  }

  // StoryHost
  mindContext(): MindContext {
    return this.ctx();
  }

  emitEvent(e: SimEvent): void {
    this.emit(e);
  }

  forceExchange(a: ResidentState, b: ResidentState, kind: ExchangeKind, placeId: number | null, topic?: SubjectId): void {
    runExchange(this.ctx(), this.mind, a, b, kind, placeId === null ? 'passing' : 'together', placeId, topic);
  }

  /** The steward answers an open dilemma. */
  decide(dilemmaId: number, option: 'approve' | 'decline'): void {
    const d = this.state.story.dilemmas.find((x) => x.id === dilemmaId);
    if (!d) throw new Error(`no dilemma ${dilemmaId}`);
    if (d.status !== 'open') throw new Error(`dilemma ${dilemmaId} is already ${d.status}`);
    closeDilemma(this, d, option === 'approve' ? 'approved' : 'declined');
  }

  /** Feed an experience straight into a resident's mind (twin tests, scripted beats). */
  perceive(id: string, p: Perception): void {
    this.mind.perceive(this.ctx(), this.resident(id), p);
  }

  runUntil(tick: number): void {
    while (this.state.tick < tick) this.step();
  }

  runDays(days: number): void {
    this.runUntil(this.state.tick + days * TICKS_PER_DAY);
  }

  step(): void {
    const state = this.state;
    while (this.commands.length > 0 && (this.commands[0] as Command).at <= state.tick) {
      this.execute(this.commands.shift() as Command);
    }
    this.worked = new Set();
    this.capAfterLowLarder();
    for (const id of state.order) {
      const r = state.residents[id] as ResidentState;
      if (!r.departed && r.activity?.id === 'work' && r.at === r.activity.placeId) this.worked.add(r.at);
    }
    for (const [id, from, until] of state.story.extraShifts) if (state.tick >= from && state.tick < until) this.worked.add(id);
    storyStep(this);
    if (minuteOf(state.tick) === 6 * 60 + 5) aspirationMorning(this);
    if (minuteOf(state.tick) % 60 === 30) this.newcomers();
    const ctx = this.ctx();
    const minute = minuteOf(state.tick);
    if (minute === DAWN_MINUTE) {
      // Yesterday's work goes on the morning board.
      if (state.produced && Object.keys(state.produced).length > 0) this.emit({ t: state.tick, type: 'production', by: state.produced });
      state.produced = {};
      this.emit({ t: state.tick, type: 'dawn', day: dayOf(state.tick) });
      for (const r of this.activeResidents()) {
        const log = (r.standingLog ??= []);
        log.push(r.rel[STEWARD]?.affinity ?? 0);
        if (log.length > 3) log.shift();
      }
      // Bar round 4: a larder below a day's meals at dawn is held against the steward a little, so a
      // hungry week leaves nobody thinking the world of you (Bram at +1.00 through an empty larder).
      // Bar round 4: while the larder is below a day's meals nobody thinks the world of you (Bram at
      // +1.00 through an empty larder). A cap, not a grievance: held against you every low dawn, it
      // sank a town nobody feeds to the bottom of the scale and emptied it in the year soak.
      if (bareLarder(state)) {
        state.lowRun = (state.lowRun ?? 0) + 1;
        // Bar round 5: and for three days after, so a hungry week is not forgotten overnight.
        if (state.lowRun >= 2) state.lowCapUntil = state.tick + 3 * TICKS_PER_DAY;
      } else state.lowRun = 0;
      this.capAfterLowLarder();
      storesDawn(this);
      progressDawn(this);
      wearDawn(state);
    }

    for (const id of state.order) {
      const r = state.residents[id] as ResidentState;
      if (!r.departed) this.updateResident(ctx, r);
    }
    this.encounters(ctx);
    if (minute % 60 === 0) this.hourly();
    state.tick++;
  }

  // ------------------------------------------------------------------ steward commands

  execute(c: Command): void {
    if (c.kind === 'build') {
      // A scheduled build whose spot has since been taken, or that the town can no longer
      // afford, is dropped, as a player would.
      if (canPlace(this.state, c.type, c.x, c.y, c.rot ?? 0) === null && this.canAfford(c.type)) {
        const waiting = waitingOnStage(this);
        this.build(c.type, c.x, c.y, c.rot ?? 0);
        aspirationsAfterBuild(this, waiting);
        this.closeMetAfterBuild();
      }
    } else if (c.kind === 'remove') this.remove(c.x, c.y);
    else if (c.kind === 'talk') {
      if (this.state.residents[c.who]) this.talk(c.who, c.question, c.about);
    } else if (c.kind === 'favour') {
      if (this.state.residents[c.who]) this.askFavour(c.who, c.favour, c.other, c.plot);
    } else if (c.kind === 'gift') {
      this.traderGift();
    } else if (c.kind === 'reply') {
      if (this.state.residents[c.who]) this.reply(c.who, c.reply, c.cut);
    } else if (c.kind === 'look') {
      if (this.state.residents[c.who]) learnFact(this, c.who, 'background');
    } else {
      const d = this.state.story.dilemmas.find((x) => x.type === c.dilemma && x.status === 'open');
      if (d) this.decide(d.id, c.option);
    }
  }

  /** Run any commands due now, without stepping: lets the browser answer a talk at once, replay-safe. */
  flushCommands(): void {
    while (this.commands.length > 0 && (this.commands[0] as Command).at <= this.state.tick) this.execute(this.commands.shift() as Command);
  }

  /** The steward talks with a resident. The first talk of the day keeps them a little company. */
  talk(who: string, question: TalkQuestion, about?: SubjectId): TalkAnswer | null {
    const state = this.state;
    const r = this.resident(who);
    if (r.departed || (r.activity?.id === 'sleep' && r.at === r.homeId)) return null;
    const day = dayOf(state.tick);
    const counted = r.lastTalkDay !== day;
    if (counted) {
      r.lastTalkDay = day;
      r.needs.company = clamp(r.needs.company + 0.06);
      adjust(r, STEWARD, { familiarity: 0.03 }, state.tick);
    }
    const answer = reconcile(talkAnswer(state, r, question, about));
    // The reason behind "what do you think of me" rotates: a belief cited in the last three days
    // gives way to the next strongest, so the answer is not "you listen" every day (bar round 1).
    if (answer.because && question === 'me') {
      (r.cited ??= {});
      for (const [k, t] of Object.entries(r.cited)) if (state.tick - t > 3 * TICKS_PER_DAY) delete r.cited[k];
      r.cited[answer.because.aspect] = state.tick;
    }
    // A memory they bring up (2026-10-08): told once in three days, and telling it keeps it alive.
    // One that would contradict the answer's band is kept for another day (bar round 1).
    const found = recallFor(r, state.tick, question, about);
    const memory = found && memoryFits(answer, found) && memoryAgrees(answer, found) ? found : null;
    if (memory) {
      answer.memory = memory;
      (r.recalled ??= {})[storyKey(memory)] = state.tick;
      for (const [id, t] of Object.entries(r.recalled)) if (state.tick - t > 7 * TICKS_PER_DAY) delete r.recalled[id];
      this.mind.perceive(this.ctx(), r, { subject: memory.subject, aspect: memory.aspect, valence: memory.valence, base: RECALL_REHEARSAL, source: 'recalled', note: 'told the steward about it' });
    }
    // What the steward can say back (bar round 1): kept with the resident, so a replay lands the same.
    const offers = offersFor(r, answer, state.tick);
    answer.replies = offers.map((o) => o.kind);
    r.lastAnswer = { tick: state.tick, offers, replied: false, answer };
    this.emit({ t: state.tick, type: 'talk', who, answer, counted });
    return answer;
  }

  /** The steward talks back to the last answer. One reply per answer; a reply not on offer does nothing. */
  reply(who: string, kind: ReplyKind, cut?: AnswerCut): ReplyResult | null {
    const r = this.resident(who);
    const last = r.lastAnswer;
    if (!last || last.replied || r.departed) return null;
    // Bar round 4: the reply answers what was actually said, which may be a trimmed part of the answer.
    const offers = cut && last.answer ? offersForCut(r, last.answer, cut, last.tick) : last.offers;
    const result = applyReply(this.state, r, kind, offers, (p) => this.mind.perceive(this.ctx(), r, { subject: STEWARD, source: 'witnessed', ...p }));
    if (!result) return null;
    last.replied = true;
    last.used = offers.find((o) => o.kind === kind);
    this.emit({ t: this.state.tick, type: 'reply', who, reply: kind, stance: result.stance, ...(result.aspect ? { aspect: result.aspect } : {}) });
    return result;
  }

  /**
   * The steward asks a resident a favour. They weigh it and answer; a yes means they will go and
   * do it soon. Being asked too often in a week grates, whatever the answer.
   */
  askFavour(who: string, kind: FavourKind, other?: string, plot?: number): FavourVerdict {
    const state = this.state;
    const r = this.resident(who);
    const verdict = considerFavour(state, r, kind, other, plot);
    if (verdict.reason === 'asleep' || verdict.reason === 'gone') {
      this.emit({ t: state.tick, type: 'favour', who, phase: 'refused', kind, reason: verdict.reason, ...(other ? { other } : {}) });
      return verdict;
    }
    // Bar round 8: a favour moves the conversation on; the last answer's replies are put away.
    if (r.lastAnswer) r.lastAnswer.replied = true;
    r.favoursAsked = [...(r.favoursAsked ?? []).filter((t) => state.tick - t < 7 * TICKS_PER_DAY), state.tick];
    if (recentAsks(r, state.tick) > ASKS_BEFORE_GRATING) {
      this.mind.perceive(this.ctx(), r, { subject: STEWARD, aspect: 'asks_too_much', valence: -0.6, base: 0.5, source: 'witnessed', note: 'asked me for yet another favour' });
    }
    if (!verdict.yes) {
      this.emit({ t: state.tick, type: 'favour', who, phase: 'refused', kind, ...(verdict.reason ? { reason: verdict.reason } : {}), ...(other ? { other } : {}) });
      return verdict;
    }
    state.nextFavourId = (state.nextFavourId ?? 1) + 1;
    r.favour = { id: state.nextFavourId, kind, placeId: verdict.placeId as number, askedTick: state.tick, minutesNeeded: FAVOUR_MINUTES[kind], minutes: 0, ...(other ? { other } : {}) };
    // Drop what they're doing (unless asleep or eating) and get on with it.
    if (r.activity && r.activity.id !== 'eat' && inFavourHours(state.tick)) r.activity.until = state.tick;
    this.emit({ t: state.tick, type: 'favour', who, phase: 'agreed', kind, placeId: r.favour.placeId, ...(other ? { other } : {}) });
    return verdict;
  }

  /** Each waking minute: the favour's work counts, and finishes, or is given up when too late. */
  private favourMinute(ctx: MindContext, r: ResidentState): void {
    const f = r.favour;
    if (!f) return;
    const state = this.state;
    if (state.tick - f.askedTick > FAVOUR_EXPIRES) {
      r.favour = null;
      this.emit({ t: state.tick, type: 'favour', who: r.id, phase: 'abandoned', kind: f.kind, ...(f.other ? { other: f.other } : {}) });
      return;
    }
    if (r.at === null || r.path.length > 0) return;
    if (f.kind === 'visit' || f.kind === 'mend') {
      const o = f.other ? state.residents[f.other] : undefined;
      if (!o || o.departed) {
        r.favour = null;
        return;
      }
      if (o.at !== r.at) return;
      if (f.kind === 'mend' && f.minutes === 0) runExchange(ctx, this.mind, r, o, 'apologize', 'together', r.at);
    } else if (r.at !== f.placeId || r.activity?.id !== favourActivity(f.kind)) return;
    f.minutes++;
    if (f.kind === 'clear') {
      const key = String(f.placeId);
      const clearing = (state.clearing ??= {});
      clearing[key] = (clearing[key] ?? 0) + 1;
      if (clearing[key] >= CLEAR_MINUTES) this.clearPlot(f.placeId);
    }
    if (f.minutes < f.minutesNeeded) return;
    this.finishFavour(ctx, r, f);
  }

  private finishFavour(ctx: MindContext, r: ResidentState, f: NonNullable<ResidentState['favour']>): void {
    const state = this.state;
    const got = favourYield(state, r, f.kind);
    for (const [res, v] of Object.entries(got) as Array<[Resource, number]>) {
      this.addStock(res, v);
      this.addProduced(r.id, res, v);
    }
    favourSatisfaction(r);
    adjust(r, STEWARD, { trust: 0.03 }, state.tick);
    if (f.kind === 'visit' && f.other) {
      const o = this.resident(f.other);
      o.needs.company = clamp(o.needs.company + 0.25);
      o.needs.delight = clamp(o.needs.delight + 0.1);
      this.mind.perceive(ctx, o, { subject: `r:${r.id}`, aspect: 'kind_to_me', valence: 0.7, base: 0.45, source: 'witnessed', note: `${residentDef(r.id).name} came to see me` });
      this.mind.perceive(ctx, o, { subject: STEWARD, aspect: 'looks_out_for_me', valence: 0.5, base: 0.3, source: 'told', from: r.id, note: `sent ${residentDef(r.id).name} round to see me` });
    }
    r.favour = null;
    this.emit({ t: state.tick, type: 'favour', who: r.id, phase: 'done', kind: f.kind, yield: got, placeId: f.placeId, ...(f.other ? { other: f.other } : {}) });
  }

  /** The trader's cart: a small gift of materials, once a day of town time; a second one that day is ignored. */
  traderGift(): boolean {
    const state = this.state;
    const day = dayOf(state.tick);
    if (!this.giftAvailable()) return false;
    state.lastGiftDay = day;
    for (const [res, v] of Object.entries(TRADER_GIFT) as Array<[Resource, number]>) this.addStock(res, v);
    this.emit({ t: state.tick, type: 'gift', from: 'trader', ...TRADER_GIFT });
    return true;
  }

  /** Whether the trader's cart could come today. */
  giftAvailable(): boolean {
    return (this.state.lastGiftDay ?? 0) !== dayOf(this.state.tick);
  }

  /** Into the town's stores: food over the larder's cap goes to the granary, if there is one. */
  private addStock(res: Resource, v: number): void {
    const stock = this.state.stock;
    const over = stock[res] + v - STOCK_CAP[res];
    if (res === 'food' && over > 0) overflowToGranary(this.state, over);
    stock[res] = Math.min(STOCK_CAP[res], stock[res] + v);
  }

  private addProduced(by: string, res: Resource, v: number): void {
    const produced = (this.state.produced ??= {});
    const mine = (produced[by] ??= {});
    mine[res] = (mine[res] ?? 0) + v;
  }

  /** Close an ask that is met: fulfilled if the steward built something since it was made. */
  private closeIfMet(ctx: MindContext, r: ResidentState, q: Request): boolean {
    const state = this.state;
    const a = assess(state, r, q.kind, q.postedTick, q.wants);
    if (!a.met) return false;
    const stewardActed = q.kind === 'quieter_home' || state.buildings.some((b) => b.placedBy === 'steward' && b.placedTick >= q.postedTick);
    q.status = stewardActed ? 'fulfilled' : 'resolved';
    q.closedTick = state.tick;
    // Bar round 6: the building a dream asked for is theirs to grieve (Ada's sister's orchard went
    // with "the view is rather the poorer for it").
    if (q.kind === 'aspiration' && q.wants) {
      const [hx, hy] = placeTile(getBuilding(state, r.homeId));
      const built = liveBuildings(state)
        .filter((b) => b.type === q.wants)
        .sort((a, b) => Number(b.placedTick >= q.postedTick) - Number(a.placedTick >= q.postedTick) || distanceTo(a, hx, hy) - distanceTo(b, hx, hy))[0];
      if (built && !built.dreamOf?.includes(r.id)) (built.dreamOf ??= []).push(r.id);
    }
    // Bar round 6: food built while the larder is still bare answers the ask, but the thanks wait on
    // full plates (a hungry week weighed nothing once everyone felt listened to).
    const stillBare = q.kind === 'more_food' && bareLarder(state);
    if (stewardActed) this.mind.perceive(ctx, r, { subject: STEWARD, aspect: 'listens_to_me', valence: 1, base: stillBare ? 0.3 : 0.9, source: 'witnessed', note: stillBare ? 'built food for us' : ASK_THANKS[q.kind] });
    this.emit({ t: state.tick, type: 'request_closed', request: { ...q } });
    return true;
  }

  /**
   * Right after a build, asks it meets are granted at once (owner playtest: an ask granted in the
   * day only closed overnight, after the day's "grant an ask" goal had gone). A quieter night can
   * only be judged after one.
   */
  private closeMetAfterBuild(): void {
    const ctx = this.ctx();
    for (const q of this.state.requests) {
      if (q.status !== 'open' || q.kind === 'quieter_home') continue;
      const r = this.state.residents[q.by];
      if (r && !r.departed) this.closeIfMet(ctx, r, q);
    }
  }

  /** Homes nobody lives in. */
  emptyHomes(): BuildingState[] {
    const state = this.state;
    const lived = new Set(state.order.map((id) => state.residents[id] as ResidentState).filter((r) => !r.departed).map((r) => r.homeId));
    return liveBuildings(state).filter((b) => buildingDef(b.type).kind === 'home' && !lived.has(b.id));
  }

  /**
   * Each hour: an empty home that has stood a couple of hours gets someone new, generated for this
   * town (owner, M3c: "just make it so I can build an empty house and a new person moves in").
   */
  private newcomers(): void {
    const state = this.state;
    if (this.activeResidents().length >= Math.min(MAX_RESIDENTS, residentCap(this.state))) return;
    // Nobody moves into a town that went hungry in the last two days (bar round 3).
    if ((state.shortRun ?? 0) > 0 && state.lastShortageDay >= dayOf(state.tick) - 2) return;
    const home = this.emptyHomes().find((b) => state.tick - b.placedTick >= NEWCOMER_DELAY);
    if (!home) return;
    const defs = (state.newcomerDefs ??= []);
    const taken = new Set(state.order.map((id) => residentDef(id).name));
    const built: Record<string, number> = {};
    for (const b of liveBuildings(state)) built[b.type] = (built[b.type] ?? 0) + 1;
    const [hx, hy] = placeTile(home);
    const near = [...new Set(liveBuildings(state).filter((b) => b.id !== home.id && distanceTo(b, hx, hy) <= 5).map((b) => b.type))];
    const def = generateNewcomer(state.seed, defs.length, { tick: state.tick, home: [hx, hy], built, near }, taken);
    defs.push(def);
    registerResident(def);
    const r = newResidentState(state.seed, def.id, home, state.tick);
    state.residents[def.id] = r;
    state.order.push(def.id);
    for (const other of state.order) {
      if (other === def.id) continue;
      r.rel[other] = { ...newRelationship(), familiarity: 0.1 };
      (state.residents[other] as ResidentState).rel[def.id] = { ...newRelationship(), familiarity: 0.1 };
    }
    // A newcomer arrives neutral about the steward (bar round 2); the town's talk and your own doings set them.
    r.rel[STEWARD] = { ...newRelationship(), affinity: 0, familiarity: 0.2, trust: 0.4 };
    this.assignJobs();
    this.emit({ t: state.tick, type: 'arrived', who: def.id, home: home.id });
  }

  /** A wild plot's last tree is down: the land is open to build on (M3c). */
  clearPlot(id: number): void {
    const state = this.state;
    const b = state.buildings.find((x) => x.id === id);
    if (!b || b.removed) return;
    b.removed = true;
    state.stock.timber = Math.min(STOCK_CAP.timber, state.stock.timber + 10);
    const by = this.activeResidents().filter((r) => r.favour?.kind === 'clear' && r.favour.placeId === id).map((r) => r.id);
    for (const r of this.activeResidents()) if (r.favour?.kind === 'clear' && r.favour.placeId === id) r.favour.minutes = r.favour.minutesNeeded - 1;
    this.emit({ t: state.tick, type: 'plot_cleared', building: id, by });
  }

  /** Can the town afford this building right now? */
  canAfford(type: string): boolean {
    return (buildingDef(type).cost ?? 0) <= this.state.stock.timber + 1e-9;
  }

  build(type: string, x: number, y: number, rot = 0): BuildingState {
    const state = this.state;
    const err = canPlace(state, type, x, y, rot);
    if (err) throw new Error(`cannot build ${type} at ${x},${y}: ${err}`);
    if (!this.canAfford(type)) throw new Error(`cannot afford ${type}: needs ${buildingDef(type).cost} timber, have ${Math.floor(state.stock.timber)}`);
    state.stock.timber -= buildingDef(type).cost ?? 0;
    const b: BuildingState = { id: state.nextBuildingId++, type, x, y, placedTick: state.tick, placedBy: 'steward', removed: false, ...(rot ? { rot: rot % 4 } : {}) };
    // Paths under a new building are taken up.
    if (type !== 'path') {
      const [w, h] = footprint(type, rot);
      for (const p of liveBuildings(state)) if (p.type === 'path' && p.x >= x && p.x < x + w && p.y >= y && p.y < y + h) p.removed = true;
    }
    state.buildings.push(b);
    this.emit({ t: state.tick, type: 'built', building: b.id, btype: type, by: 'steward' });
    // Anyone mid-walk whose way now runs into it finds a way round from where they are.
    if (type !== 'path') {
      const [w, h] = footprint(type, rot);
      for (const r of this.activeResidents()) {
        // Someone standing where it went up steps out to the nearest open ground first.
        if (r.at === null && r.x >= x && r.x < x + w && r.y >= y && r.y < y + h) {
          const out = nearestOpen(state, r.x, r.y);
          if (out) [r.x, r.y] = out;
        }
        // Bar round 5: a stroller with no errand re-routes too (Juniper walked over a new flower bed).
        if (r.path.length === 0) continue;
        const dest = r.path[r.path.length - 1] as [number, number];
        const crosses = r.path.slice(0, -1).some(([px, py]) => px >= x && px < x + w && py >= y && py < y + h);
        if (crosses) r.path = route([r.x, r.y], dest, state);
      }
    }
    // A path tile is groundwork, not news: nobody stops to remark on each one.
    if (type === 'path') return b;
    // Nobody reacts yet: each resident notices when they see it, wake near it, or hear of it.
    for (const r of this.activeResidents()) r.unseen.push({ building: b.id, kind: 'built', tick: state.tick });
    this.assignJobs();
    return b;
  }

  remove(x: number, y: number): BuildingState {
    const b = liveBuildings(this.state).find((bb) => {
      const [w, h] = sizeOf(bb);
      return x >= bb.x && x < bb.x + w && y >= bb.y && y < bb.y + h;
    });
    if (!b) throw new Error(`nothing to remove at ${x},${y}`);
    if (buildingDef(b.type).kind === 'home') throw new Error('homes cannot be removed');
    b.removed = true;
    this.state.stock.timber = Math.min(STOCK_CAP.timber, this.state.stock.timber + Math.floor((buildingDef(b.type).cost ?? 0) / 2));
    this.emit({ t: this.state.tick, type: 'removed', building: b.id, btype: b.type, by: 'steward' });
    if (b.type === 'path') return b;
    for (const r of this.activeResidents()) {
      const there = r.at === b.id;
      if (there || r.pending?.placeId === b.id) {
        r.activity = null;
        r.pending = null;
        r.path = [];
        r.at = null;
      }
      const work = r.jobId === b.id;
      if (work) r.jobId = null;
      r.unseen.push({ building: b.id, kind: 'removed', tick: this.state.tick, ...(work ? { work: true } : {}) });
    }
    this.assignJobs();
    return b;
  }

  /**
   * A resident takes in a change to the town: how it alters the feel of home for them, what
   * it means to their values, or the loss of a place they loved.
   */
  private notice(ctx: MindContext, r: ResidentState, change: Unseen, how: 'saw' | 'woke' | 'heard'): void {
    const state = this.state;
    const b = getBuilding(state, change.building);
    const def = residentDef(r.id);
    const bdef = buildingDef(b.type);
    const name = bdef.name.toLowerCase();
    const heard = how === 'heard' ? 0.6 : 1;
    const source = how === 'heard' ? ('told' as const) : ('witnessed' as const);
    // How home feels with and without it, quality by quality.
    const prefs = ambientPrefs(def);
    const [hx, hy] = placeTile(getBuilding(state, r.homeId));
    const wasRemoved = b.removed;
    b.removed = false;
    const withIt = ambientAt(state, hx, hy, new Set(), { weather: false });
    b.removed = true;
    const without = ambientAt(state, hx, hy, new Set(), { weather: false });
    b.removed = wasRemoved;
    const sign = change.kind === 'built' ? 1 : -1;
    let total = 0;
    let detail: string | null = null;
    let strongest = 0;
    for (const q of QUALITIES) {
      const c = prefs[q] * (withIt[q] - without[q]) * sign;
      total += c;
      if (Math.abs(c) > strongest && Math.abs(withIt[q] - without[q]) > 0.02) {
        strongest = Math.abs(c);
        detail = detailFor(q, (withIt[q] - without[q]) * sign);
      }
    }

    if (change.kind === 'removed') {
      const dreamt = !!b.dreamOf?.includes(r.id);
      // Bar round 7: their workplace is theirs to lose too (Fen's jetty drew no reaction).
      const work = !!change.work;
      const op = dreamt ? 1 : Math.max(work ? 0.7 : 0, attachment(r, `b:${b.id}`));
      if (op > 0.15) {
        this.mind.perceive(ctx, r, { subject: `b:${b.id}`, aspect: 'lost_place', valence: -0.8, base: (0.7 + 0.8 * op) * heard, source, note: dreamt ? `my dream's ${name} is gone` : work ? `my ${name} is gone` : `the ${name} is gone` });
        this.mind.perceive(ctx, r, { subject: STEWARD, aspect: 'destroyed_place', valence: -0.7, base: (0.3 + 0.6 * op) * heard, source, note: dreamt ? `took away my dream's ${name}` : work ? `took away my ${name}` : `took away the ${name}` });
        // A loss you caused holds their standing down for ten days, not only their mood for four.
        r.hurtUntil = state.tick + HURT_DAYS * TICKS_PER_DAY;
        r.hurtAt = state.tick;
        this.emit({ t: state.tick, type: 'grief', who: r.id, building: b.id, btype: b.type, how });
        // Bar round 4: a loss weighs on mood for days, not only in feelings that fade by evening.
        r.lostPlace = { tick: state.tick, weight: Math.max(r.lostPlace && state.tick - r.lostPlace.tick < LOSS_DAYS * TICKS_PER_DAY ? r.lostPlace.weight : 0, clamp(0.5 + op)), building: b.id };
        return;
      }
    }
    if (Math.abs(total) >= 0.04 && detail) {
      const s = Math.sign(total);
      const aspect = s > 0 ? 'nice_addition' : 'unwelcome_addition';
      if (change.kind === 'built') {
        this.mind.perceive(ctx, r, { subject: `b:${b.id}`, aspect, valence: 0.6 * s, base: clamp(Math.abs(total) * 3) * heard, source, note: `${DETAIL_NOTES[detail] ?? 'changes home'}` });
      }
      this.mind.perceive(ctx, r, { subject: STEWARD, aspect: s > 0 ? 'improves_town' : 'spoils_town', valence: 0.5 * s, base: clamp(Math.abs(total) * 2) * heard, source, note: `${change.kind === 'built' ? 'built' : 'took away'} the ${name}` });
      this.emit({ t: state.tick, type: 'reaction', who: r.id, building: b.id, aspect, valence: s, detail, how, change: change.kind });
      return;
    }
    if (change.kind !== 'built') return;
    // Nothing changes at home, but it may still matter for what they care about.
    const match: Array<[string, number]> =
      bdef.kind === 'social'
        ? [['gather', def.values.community]]
        : b.type === 'bench'
          ? [['sit', Math.max(def.values.community, unit(def.traits.sociable) * 0.8)]]
          : bdef.kind === 'decor' || bdef.kind === 'nature'
            ? [['pretty', Math.max(def.values.beauty, def.values.nature)]]
            : bdef.kind === 'work'
              ? [['work', Math.max(def.values.craft, def.values.prosperity)]]
              : [];
    const [what, value] = match[0] ?? ['', 0];
    if (value >= 0.6) {
      this.mind.perceive(ctx, r, { subject: `b:${b.id}`, aspect: 'nice_addition', valence: 0.5, base: 0.3 * value * heard, source, note: DETAIL_NOTES[what] ?? 'good for the town' });
      this.mind.perceive(ctx, r, { subject: STEWARD, aspect: 'improves_town', valence: 0.4, base: 0.25 * value * heard, source, note: `built the ${name}` });
      this.emit({ t: state.tick, type: 'reaction', who: r.id, building: b.id, aspect: 'nice_addition', valence: 1, detail: what, how, change: 'built' });
    }
  }

  /** Changes a resident hasn't taken in yet: noticed on sight, on waking nearby, or by word of mouth once awake for long enough. */
  private checkUnseen(ctx: MindContext, r: ResidentState, waking: boolean): void {
    if (r.unseen.length === 0) return;
    const state = this.state;
    const keep: Unseen[] = [];
    for (const u of r.unseen) {
      const b = state.buildings.find((x) => x.id === u.building);
      if (!b) continue;
      const near = distanceTo(b, r.x, r.y) <= SIGHT;
      if (near) this.notice(ctx, r, u, waking ? 'woke' : 'saw');
      else if (state.tick - u.tick >= WORD_OF_MOUTH) this.notice(ctx, r, u, 'heard');
      else keep.push(u);
    }
    r.unseen = keep;
  }

  /** How the ground round someone's home suits them, roughly [-1, 1]: green, water, scent for those who like them, against noise and bustle. */
  homeScore(r: ResidentState): number {
    const home = getBuilding(this.state, r.homeId);
    const [hx, hy] = placeTile(home);
    const amb = ambientAt(this.state, hx, hy, this.worked, { weather: false });
    return clamp(prefScore(ambientPrefs(residentDef(r.id)), amb), -1, 1);
  }

  /** Whether there is a place in town, other than home, they are fond of and that still stands. */
  hasFondPlace(r: ResidentState): boolean {
    for (const b of Object.values(r.beliefs)) {
      if (!b.subject.startsWith('b:') || b.valence <= 0.15) continue;
      const id = Number(b.subject.slice(2));
      if (id === r.homeId) continue;
      const bld = this.state.buildings.find((x) => x.id === id);
      if (bld && !bld.removed) return true;
    }
    return false;
  }

  /** Start a meal: it draws on the town's food, and a bare larder makes it meagre. */
  private serveMeal(r: ResidentState, act: ActivityState): void {
    const state = this.state;
    // Cold days make for bigger appetites (M4: winter has to pinch without stores put by).
    const meal = seasonOf(state.tick) === 'winter' ? MEAL * WINTER_APPETITE : MEAL;
    if (state.stock.food >= meal) {
      state.stock.food -= meal;
      return;
    }
    // A bare larder: the granary feeds the town, if anything is put by.
    if ((state.granary ?? 0) >= meal) {
      drawFromGranary(state, meal);
      return;
    }
    act.meagre = true;
    const day = dayOf(state.tick);
    // A meagre meal is held against whoever keeps the town fed (bar round 1): once a day each.
    if (r.lastHungryDay !== day) {
      // A run of hungry days hurts most at first; from the fourth day on it is resignation, not
      // news, so a long shortage settles into a grudge rather than driving everyone out of town.
      r.hungryRun = r.lastHungryDay === day - 1 ? (r.hungryRun ?? 0) + 1 : 1;
      r.lastHungryDay = day;
      this.mind.perceive(this.ctx(), r, { subject: STEWARD, aspect: 'went_hungry', valence: -0.6, base: r.hungryRun <= 3 ? 0.4 : 0.12, source: 'witnessed', note: 'let the larder run bare' });
    }
    if (state.lastShortageDay !== day) {
      state.shortRun = state.lastShortageDay === day - 1 && (state.shortRun ?? 0) > 0 ? (state.shortRun ?? 0) + 1 : 1;
      state.lastShortageDay = day;
      this.emit({ t: state.tick, type: 'shortage', resource: 'food', who: r.id });
    }
  }

  // ------------------------------------------------------------------ internals

  private activeResidents(): ResidentState[] {
    return this.state.order.map((id) => this.state.residents[id] as ResidentState).filter((r) => !r.departed);
  }

  /** How the static surroundings of a resident's home suit them. */
  private homeFeel(r: ResidentState): number {
    const [x, y] = placeTile(getBuilding(this.state, r.homeId));
    return prefScore(ambientPrefs(residentDef(r.id)), ambientAt(this.state, x, y, new Set()));
  }

  private assignJobs(): void {
    const state = this.state;
    const ctx = this.ctx();
    const filled = (b: BuildingState) => this.activeResidents().filter((r) => r.jobId === b.id).length;
    const freeOf = (type: string) =>
      liveBuildings(state).find((b) => b.type === type && filled(b) < (buildingDef(b.type).capacity ?? 0));
    for (const r of this.activeResidents()) {
      const def = residentDef(r.id);
      const current = r.jobId !== null ? getBuilding(state, r.jobId) : undefined;
      if (def.job && current?.type !== def.job) {
        const b = freeOf(def.job);
        if (b) {
          r.jobId = b.id;
          this.emit({ t: state.tick, type: 'took_job', who: r.id, building: b.id });
          if (state.tick > 0) {
            this.mind.perceive(ctx, r, { subject: `b:${b.id}`, aspect: 'my_workplace', valence: 0.8, base: 0.6, source: 'witnessed', note: 'my own workplace', relevance: ['craft'] });
            if (b.placedBy === 'steward') {
              // "Built it for me" only when it went up for them; an older workplace was given, not built
              // (bar round 4: a newcomer thanked you for garden plots built three weeks before she came).
              const forThem = state.tick - b.placedTick < TICKS_PER_DAY && (r.arrivedTick === undefined || b.placedTick >= r.arrivedTick);
              const what = buildingDef(b.type).name.toLowerCase();
              this.mind.perceive(ctx, r, { subject: STEWARD, aspect: 'improves_town', valence: 0.6, base: 0.5, source: 'witnessed', note: forThem ? `built the ${what} for me` : `gave me work at the ${what}` });
            }
          }
          continue;
        }
      }
      if (r.jobId === null && def.fallbackJob) {
        const b = freeOf(def.fallbackJob);
        if (b) {
          r.jobId = b.id;
          this.emit({ t: state.tick, type: 'took_job', who: r.id, building: b.id });
        }
      }
    }
  }

  private updateResident(ctx: MindContext, r: ResidentState): void {
    const state = this.state;
    const def = residentDef(r.id);
    const tick = state.tick;
    const act = r.activity;
    const doing = act && r.at === act.placeId ? act.id : null;
    const sleeping = doing === 'sleep';

    // Needs drift.
    const delta = {} as Record<Need, number>;
    for (const n of NEEDS) {
      delta[n] = sleeping && n === 'rest' ? 0 : BASE_DECAY[n] / 60;
      // A meagre meal fills little (bar round 2: a week of them used to leave mood untouched).
      if (doing) delta[n] += ((ACTIVITY_EFFECTS[doing][n] ?? 0) * (doing === 'eat' && n === 'food' && act?.meagre ? MEAGRE_FILL : 1)) / 60;
    }
    const tile: [number, number] = r.at !== null ? placeTile(getBuilding(state, r.at)) : [r.x, r.y];
    const amb = r.at !== null || r.path.length > 0 ? ambientAt(state, tile[0], tile[1], this.worked) : emptyQualities();

    if (sleeping) {
      const builtNoise = ambientAt(state, tile[0], tile[1], this.worked, { weather: false }).noise;
      r.sleepNoiseMax = Math.max(r.sleepNoiseMax, builtNoise);
      if (amb.noise > sleepNoiseThreshold(def)) delta.rest = ((ACTIVITY_EFFECTS.sleep.rest ?? 0) * 0.3) / 60;
      if (amb.noise > sleepNoiseThreshold(def) && builtNoise <= sleepNoiseThreshold(def) && !r.disturbedBy.includes(-1)) {
        // The storm, not a building: a shared night, remembered together.
        r.disturbedBy.push(-1);
        const storm = [...state.story.memories].reverse().find((m) => m.kind === 'storm');
        if (storm) this.mind.perceive(ctx, r, { subject: `m:${storm.id}`, aspect: 'kept_awake', valence: -0.4, base: 0.3, source: 'witnessed', note: 'the storm kept me up' });
      }
      if (builtNoise > sleepNoiseThreshold(def)) {
        const src = mainSource(state, tile[0], tile[1], 'noise', this.worked);
        if (src && !r.disturbedBy.includes(src.id)) {
          r.disturbedBy.push(src.id);
          this.emit({ t: tick, type: 'disturbed_sleep', who: r.id, building: src.id, noise: amb.noise });
          const excess = amb.noise - sleepNoiseThreshold(def);
          const base = clamp(0.3 + excess) * (def.quirks.includes('light_sleeper') ? 1.3 : 1);
          const name = buildingDef(src.type).name.toLowerCase();
          this.mind.perceive(ctx, r, { subject: `b:${src.id}`, aspect: 'noisy_at_night', valence: -0.8, base, source: 'witnessed', note: `the ${name} woke ${def.pronouns.obj}`, relevance: ['quiet'] });
          for (const w of this.activeResidents()) {
            if (w.jobId === src.id && w.at === src.id && w.id !== r.id) {
              this.mind.perceive(ctx, r, { subject: `r:${w.id}`, aspect: 'noisy_at_night', valence: -0.5, base: base * 0.4, source: 'witnessed', note: `${residentDef(w.id).name} at the ${name}` });
            }
          }
          // Bar round 8: not your fault when it is their own workplace, a late shift they proposed, or what they asked for.
          const own = src.id === r.jobId || !!src.dreamOf?.includes(r.id);
          const theirIdea = state.story.extraShifts.some(([id]) => id === src.id) && state.story.dilemmas.some((d) => d.proposer === r.id && d.status === 'approved');
          const asked = state.requests.some((q) => q.by === r.id && q.status === 'fulfilled' && q.wants === src.type);
          if (src.placedBy === 'steward' && !own && !theirIdea && !asked) {
            this.mind.perceive(ctx, r, { subject: STEWARD, aspect: 'spoils_town', valence: -0.5, base: base * 0.55, source: 'witnessed', note: `put the ${name} there` });
          }
        }
      }
    } else if (doing) {
      delta.comfort += (0.06 * prefScore(ambientPrefs(def), amb)) / 60;
    }
    // Home counts (bar round 1): asleep or resting at home, comfort follows what is round the house,
    // green and water for those who like them, noise and bare ground against.
    if (r.at === r.homeId && (sleeping || doing === 'rest')) delta.comfort += (0.08 * this.homeScore(r)) / 60;
    if (r.coldUntil > tick) {
      delta.comfort -= 0.03 / 60;
      delta.rest -= 0.02 / 60;
    }
    for (const n of NEEDS) r.needs[n] = clamp(r.needs[n] + delta[n]);

    // Work makes things for the town's stores; a cheerful worker makes more.
    if (doing === 'work' && r.at !== null) {
      const made = buildingDef(getBuilding(state, r.at).type).produces;
      if (made) {
        for (const [res, rate] of Object.entries(made) as Array<[Resource, number]>) {
          const season = res === 'food' ? (FOOD_SEASON[getBuilding(state, r.at).type]?.[seasonOf(tick)] ?? 1) : tick < EARLY_TIMBER_DAYS * TICKS_PER_DAY && state.stock.timber < EARLY_TIMBER_BELOW ? EARLY_TIMBER : 1;
          const v = (rate / 60) * season * (0.5 + 0.5 * r.mood);
          this.addStock(res, v);
          this.addProduced(r.id, res, v);
        }
      }
    }

    // Changes to the town are taken in only by someone awake to see them.
    if (!sleeping && tick % 5 === 0) this.checkUnseen(ctx, r, false);
    if (!sleeping) aspirationMinute(state, r);
    if (!sleeping) this.favourMinute(ctx, r);
    // Now and then something on their mind surfaces as a passing thought.
    if (!sleeping && chance(r, THOUGHT_CHANCE / 60)) {
      const m = voiceTopic(state, r);
      if (m) ctx.emit({ t: tick, type: 'thought', who: r.id, ...m });
    }

    // Walking.
    if (r.path.length > 0) {
      const [x, y] = r.path.shift() as [number, number];
      r.x = x;
      r.y = y;
      wearStep(state, x, y);
      if (r.path.length === 0) this.arrive(ctx, r);
      return;
    }

    // Choosing.
    const minute = minuteOf(tick);
    const needDecide =
      !act ||
      tick >= act.until ||
      (act.id !== 'sleep' && act.id !== 'eat' && r.needs.food < 0.12) ||
      (act.id !== 'sleep' && act.id !== 'work' && minute === def.sleep);
    if (!needDecide) return;
    if (act?.id === 'sleep' && act.night && tick >= act.until) {
      this.wake(ctx, r);
      // Out of bed first, then take in what changed overnight.
      r.activity = null;
      this.checkUnseen(ctx, r, true);
    }
    // Back from foraging: what they found goes in the larder.
    if (act?.id === 'forage' && r.at === act.placeId && tick >= act.until) {
      const found = Math.round((FORAGE_YIELD[seasonOf(tick)] ?? 1) * 10) / 10;
      state.stock.food += found;
      // They eat as they pick: a forager is never the one who starves (year soak: a hungry
      // resident spent half their waking hours with the food need under 0.1).
      r.needs.food = clamp(r.needs.food + 0.35);
      this.emit({ t: tick, type: 'forage', who: r.id, placeId: act.placeId, food: found });
    }
    const next = this.favourNext(r) ?? this.forageNext(r) ?? this.mind.decide(ctx, r);
    if (next.night && !(act?.id === 'sleep' && act.night)) {
      r.sleepNoiseMax = 0;
      r.disturbedBy = [];
    }
    if (next.placeId === r.at) {
      r.activity = next;
      if (next.id === 'eat') this.serveMeal(r, next);
      return;
    }
    r.at = null;
    r.activity = null;
    r.visitAppraised = false;
    r.pending = next;
    r.path = route([r.x, r.y], placeTile(getBuilding(state, next.placeId)), state);
    if (next.id === 'socialize' || next.id === 'stroll') this.maybeInvite(r, next);
    if (r.path.length === 0) this.arrive(ctx, r);
  }

  /** A favour they agreed to comes first, in working hours, unless hunger, tiredness or a cold say otherwise. */
  private favourNext(r: ResidentState): ActivityState | null {
    const f = r.favour;
    const state = this.state;
    if (!f || !inFavourHours(state.tick) || r.coldUntil > state.tick) return null;
    if (r.needs.food < 0.2 || r.needs.rest < 0.15) return null;
    if (f.kind === 'visit' || f.kind === 'mend') {
      const place = favourPlace(state, r, f.kind, f.other);
      if (place === null) return null;
      f.placeId = place;
    }
    const left = Math.max(1, f.minutesNeeded - f.minutes);
    return { id: favourActivity(f.kind), placeId: f.placeId, until: state.tick + Math.min(120, left + 5) };
  }

  /**
   * Going out? Call on a friend first. The inviter walks to the friend's door, the friend waits
   * there, and they walk the rest of the way together, step for step.
   */
  private maybeInvite(r: ResidentState, next: ActivityState): void {
    const state = this.state;
    const def = residentDef(r.id);
    if (!chance(r, 0.35 * (0.5 + unit(def.traits.sociable)))) return;
    const free = (o: ResidentState) =>
      !o.departed && o.path.length === 0 && !o.pending && o.coldUntil < state.tick && (!o.activity || o.activity.id === 'rest' || o.activity.id === 'stroll' || o.activity.id === 'socialize');
    const friends = Object.entries(r.rel)
      .filter(([id, x]) => id !== STEWARD && (x.tags.includes('friend') || x.affinity >= 0.35))
      .map(([id]) => state.residents[id] as ResidentState)
      .filter((o) => o && free(o) && !(o.activity && o.at === next.placeId))
      // Friends first, then whoever they like best (M4: friends seen together, not just liked ones).
      .sort((a, b) => Number(rel(r, b.id).tags.includes('friend')) - Number(rel(r, a.id).tags.includes('friend')) || rel(r, b.id).affinity - rel(r, a.id).affinity);
    const friend = friends[0];
    if (!friend) return;
    const fx = rel(friend, r.id);
    const lonely = Math.max(0, friend.setpoints.company - friend.needs.company);
    if (!chance(r, clamp(0.3 + 0.5 * fx.affinity + 0.6 * lonely))) return;
    const target = placeTile(getBuilding(state, next.placeId));
    // Bar round 5: a friend standing at a flower bed or the like steps off it to wait, rather than
    // waiting on the bed (Juniper stood on one for an hour).
    const meet: [number, number] = onFootprint(state, friend.x, friend.y) ? (nearestOpen(state, friend.x, friend.y) ?? [friend.x, friend.y]) : [friend.x, friend.y];
    const toFriend = route([r.x, r.y], meet, state);
    const together = route(meet, target, state);
    r.path = [...toFriend, ...together];
    friend.at = null;
    friend.activity = null;
    friend.visitAppraised = false;
    friend.pending = { ...next };
    const stepOff = meet[0] === friend.x && meet[1] === friend.y ? [] : [meet];
    friend.path = [...stepOff, ...toFriend.slice(stepOff.length).map(() => meet), ...together];
    adjust(r, friend.id, { familiarity: 0.02 }, state.tick);
    adjust(friend, r.id, { familiarity: 0.02 }, state.tick);
    this.emit({ t: state.tick, type: 'invite', a: r.id, b: friend.id, place: next.placeId });
  }

  /**
   * A hungry resident with nothing in the larder or the granary goes foraging once a day, in
   * daylight, along the brook or at the wild edge (bar round 2): a town nobody feeds goes hungry
   * and sullen, but it does not simply empty.
   */
  private forageNext(r: ResidentState): ActivityState | null {
    const state = this.state;
    const tick = state.tick;
    const minute = minuteOf(tick);
    if (minute < 8 * 60 || minute > 16 * 60) return null;
    // One trip a day, or two when they are very hungry.
    const today = dayOf(tick);
    const trips = r.lastForageDay === today ? (r.forageTrips ?? 1) : 0;
    if (r.favour || r.needs.food >= 0.5 || trips >= (r.needs.food < 0.2 ? 2 : 1)) return null;
    const meal = seasonOf(tick) === 'winter' ? MEAL * WINTER_APPETITE : MEAL;
    if (state.stock.food >= meal || (state.granary ?? 0) >= meal) return null;
    const spots = liveBuildings(state).filter((b) => b.type === 'brook' || b.type === 'wild');
    if (spots.length === 0) return null;
    const spot = spots.sort((a, b) => distanceTo(a, r.x, r.y) - distanceTo(b, r.x, r.y))[0] as BuildingState;
    r.forageTrips = trips + 1;
    r.lastForageDay = today;
    return { id: 'forage', placeId: spot.id, until: tick + FORAGE_MINUTES };
  }

  private arrive(ctx: MindContext, r: ResidentState): void {
    const next = r.pending;
    if (!next) return;
    const b = this.state.buildings.find((x) => x.id === next.placeId);
    r.pending = null;
    if (!b || b.removed) return;
    // Travel ate into leisure; give it back so a meal is still a meal.
    if (next.id === 'eat' || next.id === 'socialize' || next.id === 'stroll' || next.id === 'rest') {
      next.until = Math.max(next.until, this.state.tick + 20);
    }
    r.at = next.placeId;
    r.activity = next;
    r.lastVisit[String(next.placeId)] = this.state.tick;
    if (next.id === 'eat') this.serveMeal(r, next);
    this.mind.onArrive(ctx, r, next.placeId);
  }

  private wake(ctx: MindContext, r: ResidentState): void {
    const state = this.state;
    const def = residentDef(r.id);
    const tick = state.tick;
    const day = dayOf(tick);

    this.mind.consolidate(ctx, r);

    // Ignored three times in a fortnight, they stop expecting anything of the steward for a week
    // (bar round 3): their asks are withdrawn and the nightly "kept me waiting" stops. Neglect
    // wounds once and settles into a low opinion, rather than bleeding every night until they go.
    const givenUp = (r.gaveUpUntil ?? -1) > tick;
    if (!givenUp && allLapses(state, r.id, tick) >= 3) {
      r.gaveUpUntil = tick + 7 * TICKS_PER_DAY;
      for (const q of state.requests) {
        if (q.by !== r.id || q.status !== 'open') continue;
        q.status = 'resolved';
        q.closedTick = tick;
        this.emit({ t: tick, type: 'request_closed', request: { ...q } });
      }
      this.emit({ t: tick, type: 'gave_up', who: r.id });
    }
    const stoppedAsking = (r.gaveUpUntil ?? -1) > tick;
    // Asks: close the ones dealt with, lapse the ignored, and voice at most one new one.
    for (const q of state.requests) {
      if (q.by !== r.id || q.status !== 'open') continue;
      if (this.closeIfMet(ctx, r, q)) continue;
      // An ask left open weighs on them a little each morning it stays open (bar round 1): being
      // kept waiting used to cost nothing until the day it lapsed.
      const waited = (tick - q.postedTick) / TICKS_PER_DAY;
      if (waited > 1) {
        // The longer it sits, the more it rankles.
        const days = Math.floor(waited);
        const forWhat = q.kind === 'aspiration' && q.wants ? `${/^[aeiou]/i.test(buildingDef(q.wants).name) ? 'an' : 'a'} ${buildingDef(q.wants).name.toLowerCase()}` : WISH_LABELS[q.kind].toLowerCase();
        this.mind.perceive(ctx, r, { subject: STEWARD, aspect: 'still_waiting', valence: -0.5, base: Math.min(0.28, 0.07 + 0.035 * waited), source: 'witnessed', note: `kept me waiting ${days} day${days === 1 ? '' : 's'} for ${forWhat}` });
      }
      if (tick - q.postedTick > ASK_LAPSE_DAYS[q.kind] * TICKS_PER_DAY) {
        // Being ignored hurts most the first time; after that it is disappointment, not news.
        const before = lapsesOf(state, r.id, q.kind, tick);
        q.status = 'lapsed';
        q.closedTick = tick;
        // Bar round 5: name what was not done ("(what the steward did: nothing was done)").
        const forWhat = q.kind === 'aspiration' && q.wants ? `${/^[aeiou]/i.test(buildingDef(q.wants).name) ? 'an' : 'a'} ${buildingDef(q.wants).name.toLowerCase()}` : WISH_LABELS[q.kind].toLowerCase();
        this.mind.perceive(ctx, r, { subject: STEWARD, aspect: 'ignores_me', valence: -0.7, base: before === 0 ? 0.6 : 0.3, source: 'witnessed', note: `never got me ${forWhat}` });
        this.emit({ t: tick, type: 'request_closed', request: { ...q } });
      }
    }
    // Even a resident who has stopped trusting the steward still says so: the player must
    // always be able to find out what is wrong (pillar 3).
    for (const kind of ASK_KINDS) {
      if (stoppedAsking) break;
      if (state.requests.some((q) => q.by === r.id && q.kind === kind && (q.status === 'open' || (q.closedTick ?? 0) > tick - 3 * TICKS_PER_DAY))) continue;
      // Ignored twice lately, they stop asking for a while.
      if (lapsesOf(state, r.id, kind, tick) >= 2) continue;
      const a = assess(state, r, kind);
      if (!a.want) continue;
      const q: Request = { id: state.nextRequestId++, by: r.id, kind, subject: a.subject, postedTick: tick, status: 'open', ...(a.wants ? { wants: a.wants } : {}) };
      state.requests.push(q);
      this.emit({ t: tick, type: 'request_posted', request: { ...q } });
      break;
    }

    // Morning smells.
    if (r.lastScentDay !== day) {
      r.lastScentDay = day;
      const [hx, hy] = placeTile(getBuilding(state, r.homeId));
      const amb = ambientAt(state, hx, hy, this.worked);
      const pref = ambientPrefs(def).scent;
      if (amb.scent >= 0.25 && pref > 0) {
        const src = mainSource(state, hx, hy, 'scent', this.worked);
        if (src) {
          this.mind.perceive(ctx, r, { subject: `b:${src.id}`, aspect: 'smells_lovely', valence: 0.6, base: amb.scent * pref * 0.8, source: 'witnessed', note: `woke to the smell from the ${buildingDef(src.type).name.toLowerCase()}`, relevance: ['beauty'] });
        }
      }
    }

    // Disposition and the slow decision to stay or go.
    if (r.dayMoodN > 0) {
      const dayMood = r.dayMoodSum / r.dayMoodN;
      // How the days feel, and how the steward is treating them.
      r.disposition = 0.65 * r.disposition + 0.35 * (0.5 * dayMood + 0.5 * (0.5 + 0.5 * rel(r, STEWARD).affinity));
    }
    r.dayMoodSum = 0;
    r.dayMoodN = 0;
    if (!r.leaving) {
      r.lowDays = r.disposition < LEAVING_BELOW ? r.lowDays + 1 : 0;
      if (r.lowDays >= 3) {
        r.leaving = { sinceDay: day };
        this.emit({ t: tick, type: 'thinking_of_leaving', who: r.id });
      }
    } else if (r.disposition > (r.leaving.dream ? 0.7 : STAYING_ABOVE)) {
      // A change of heart is recorded as staying (bar round 7: Marlow's page still said "Decided to go").
      if (r.leaving.dream && r.aspiration.outcome === 'leave') r.aspiration.outcome = 'stay';
      r.leaving = null;
      r.lowDays = 0;
      this.emit({ t: tick, type: 'decided_to_stay', who: r.id });
    } else if (day - r.leaving.sinceDay >= 7) {
      this.depart(r);
    }
  }

  /** A resident packs up and leaves the valley. */
  depart(r: ResidentState): void {
    r.departed = true;
    r.departedTick = this.state.tick;
    r.at = null;
    r.activity = null;
    r.pending = null;
    r.path = [];
    r.jobId = null;
    // Their asks go with them (bar round 3: a departed Wren's ask stayed on the board).
    for (const q of this.state.requests) {
      if (q.by !== r.id || q.status !== 'open') continue;
      q.status = 'resolved';
      q.closedTick = this.state.tick;
      this.emit({ t: this.state.tick, type: 'request_closed', request: { ...q } });
    }
    this.emit({ t: this.state.tick, type: 'left_town', who: r.id });
  }

  /** A resident asks the steward for something outside the usual asks (a dream, for now). */
  ask(r: ResidentState, kind: Request['kind'], wants?: string, why?: string): Request {
    const state = this.state;
    // A dream ask carries the dream that asked, so its card quotes that dream, not a later one (bar
    // round 4); an ask with a reason of its own (the winter stores) carries that (bar round 6).
    const dream = why ?? (kind === 'aspiration' ? dreamTitle(state, r) : null);
    const q: Request = { id: state.nextRequestId++, by: r.id, kind, subject: `r:${r.id}`, postedTick: state.tick, status: 'open', ...(wants ? { wants } : {}), ...(dream ? { dream } : {}) };
    state.requests.push(q);
    this.emit({ t: state.tick, type: 'request_posted', request: { ...q } });
    return q;
  }

  /**
   * Caps on standing, checked at dawn and every minute (bar round 6: a granted ask at 07:00 slipped
   * past the dawn check): while a low larder is remembered nobody stands above LOW_LARDER_TOP;
   * bar round 7: after a loss you caused, HURT_TOP for ten days; with anything held against you
   * from the last week, FRESH_GRIEVANCE_TOP.
   */
  private capAfterLowLarder(): void {
    const tick = this.state.tick;
    const larder = (this.state.lowCapUntil ?? -1) > tick;
    for (const r of this.activeResidents()) {
      const x = r.rel[STEWARD];
      if (!x) continue;
      let top = 1;
      if (larder) top = LOW_LARDER_TOP;
      if ((r.grievedAt ?? -Infinity) > tick - FRESH_GRIEVANCE_DAYS * TICKS_PER_DAY) top = Math.min(top, FRESH_GRIEVANCE_TOP);
      if ((r.hurtUntil ?? -1) > tick) top = Math.min(top, HURT_TOP);
      if (x.affinity > top) x.affinity = top;
    }
  }

  private hourly(): void {
    // Orchards and glasshouses grow on their own, by season.
    const season = seasonOf(this.state.tick);
    for (const b of liveBuildings(this.state)) {
      const passive = buildingDef(b.type).passive;
      if (!passive) continue;
      const factor = PASSIVE_SEASON[b.type]?.[season] ?? 1;
      for (const [res, rate] of Object.entries(passive) as Array<[Resource, number]>) {
        this.addStock(res, rate * factor);
        if (rate * factor > 0) this.addProduced(b.type, res, rate * factor);
      }
    }
    storesHourly(this.state);
    progressHourly(this);
    const larder = lowLarder(this.state);
    for (const r of this.activeResidents()) {
      const def = residentDef(r.id);
      decayEmotions(r);
      // Bar round 1: the town and the steward move mood, not only the day's routine.
      const home = clamp(0.5 + 1.5 * this.homeScore(r));
      const standing = 0.5 + 0.5 * (r.rel[STEWARD]?.affinity ?? 0);
      // Something to look forward to: a place in town they are fond of, that still stands.
      const fond = this.hasFondPlace(r) ? 1 : 0.4;
      // Bar round 4: what happens moves mood day to day: a larder below a day's meals, a loved place
      // lost in the last few days, and standing with you at the low end.
      const aff = r.rel[STEWARD]?.affinity ?? 0;
      const lost = r.lostPlace ? LOSS_WEIGHT * r.lostPlace.weight * Math.max(0, 1 - (this.state.tick - r.lostPlace.tick) / (LOSS_DAYS * TICKS_PER_DAY)) : 0;
      // Together at most FELT_CAP: past that it is resignation (year soak: 0.29 mean mood under a steward who never answers or feeds).
      const felt = Math.min(FELT_CAP, townHunger(this.state) + larder + lost + LOW_STANDING * Math.max(0, -aff) + waitingOnYou(this.state, r.id));
      r.mood = clamp(MOOD_MIX.needs * needsWellbeing(r.needs, r.setpoints, def) + MOOD_MIX.feelings * (0.5 + 0.5 * emotionBalance(r)) + MOOD_MIX.home * home + MOOD_MIX.fond * fond + MOOD_MIX.standing * standing - felt);
      // Bar round 3: a famine lowers mood and talk, but the slow decision to leave is weighed without
      // it; round 4's terms likewise (standing is already in the decision directly).
      r.dayMoodSum += clamp(r.mood + felt);
      r.dayMoodN++;
    }
  }

  private encounters(ctx: MindContext): void {
    const groups = new Map<string, ResidentState[]>();
    for (const r of this.activeResidents()) {
      const traveling = r.path.length > 0;
      const doing = r.activity && r.at === r.activity.placeId ? r.activity.id : null;
      if (!traveling && (doing === null || doing === 'sleep' || doing === 'work')) continue;
      const key = r.at !== null && !traveling ? `b:${r.at}` : `t:${r.x},${r.y}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = []));
      g.push(r);
    }
    for (const [key, members] of groups) {
      if (members.length < 2) continue;
      const setting = key.startsWith('b:') ? 'together' : 'passing';
      const placeId = key.startsWith('b:') ? Number(key.slice(2)) : null;
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          const x = members[i] as ResidentState;
          const y = members[j] as ResidentState;
          const drive = (r: ResidentState) => unit(residentDef(r.id).traits.sociable) + (r.setpoints.company - r.needs.company);
          const [a, b] = drive(y) > drive(x) ? [y, x] : [x, y];
          // A brewing quarrel comes out the next time the two meet.
          const sparks = this.state.story.sparks;
          const si = sparks.findIndex((s) => (s.a === a.id && s.b === b.id) || (s.a === b.id && s.b === a.id));
          if (si >= 0) {
            const spark = sparks.splice(si, 1)[0];
            runExchange(ctx, this.mind, a, b, 'argue', setting, placeId, spark?.topic ?? undefined);
            continue;
          }
          if (!this.mind.wantsToInteract(ctx, a, b, setting)) continue;
          const kind = this.mind.chooseExchange(ctx, a, b, setting, placeId);
          runExchange(ctx, this.mind, a, b, kind, setting, placeId);
        }
      }
    }
  }
}

// The simulation loop. Owns the body and the world; delegates cognition to a Mind.

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
import { ASK_KINDS, ASK_LAPSE_DAYS, assess } from './asks.js';
import { voiceTopic } from './mind/thoughts.js';
import { runExchange } from './social.js';
import { talkAnswer } from './talk.js';
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
import { aspirationMinute, aspirationMorning, type AspirationHost } from './story/aspirations.js';
import { activeGatherings, newStoryState, storyStep } from './story/director.js';
import { closeDilemma } from './story/dilemmas.js';
import { DAWN_MINUTE, TICKS_PER_DAY, dayOf, minuteOf, seasonOf } from './time.js';
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
import { ambientAt, canPlace, distanceTo, emptyQualities, getBuilding, liveBuildings, mainSource, placeTile, route, sizeOf } from './world.js';

export type Command =
  | { at: number; kind: 'build'; type: string; x: number; y: number; rot?: number }
  | { at: number; kind: 'remove'; x: number; y: number }
  /** Answer the open dilemma of this type, if there is one. */
  | { at: number; kind: 'decide'; dilemma: DilemmaType; option: 'approve' | 'decline' }
  /** Talk with a resident: ask one of the fixed questions (M3b). */
  | { at: number; kind: 'talk'; who: string; question: TalkQuestion; about?: SubjectId }
  /** Ask a resident a favour (M3c). */
  | { at: number; kind: 'favour'; who: string; favour: FavourKind; other?: string; plot?: number };

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
export const MAX_RESIDENTS = 18;

const REQUEST_LAPSE_TICKS = 5 * TICKS_PER_DAY;
/** How far a resident can see a change to the town, in tiles. */
export /** Chance per waking hour of a passing thought. */
const THOUGHT_CHANCE = 0.35;
const SIGHT = 6;
/** News of a change reaches anyone awake this long after it happened. */
export const WORD_OF_MOUTH = 8 * 60;
/** Food one meal takes from the town's stores. */
export const MEAL = 0.5;
export const STOCK_CAP: Record<Resource, number> = { food: 80, timber: 100 };
export const START_STOCK: Record<Resource, number> = { food: 20, timber: 25 };
/** Seasonal yield of buildings that grow food on their own. */
const PASSIVE_SEASON: Record<string, Record<ReturnType<typeof seasonOf>, number>> = {
  orchard: { spring: 0.2, summer: 0.6, autumn: 2, winter: 0 },
  glasshouse: { spring: 0.5, summer: 0.5, autumn: 0.7, winter: 1 },
};
/** Gardens grow little in winter and plenty at harvest. */
const GARDEN_SEASON: Record<ReturnType<typeof seasonOf>, number> = { spring: 0.8, summer: 1.1, autumn: 1.3, winter: 0.25 };

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
export const LEAVING_BELOW = 0.48;
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
    rel: {},
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
      if (canPlace(this.state, c.type, c.x, c.y, c.rot ?? 0) === null && this.canAfford(c.type)) this.build(c.type, c.x, c.y, c.rot ?? 0);
    } else if (c.kind === 'remove') this.remove(c.x, c.y);
    else if (c.kind === 'talk') {
      if (this.state.residents[c.who]) this.talk(c.who, c.question, c.about);
    } else if (c.kind === 'favour') {
      if (this.state.residents[c.who]) this.askFavour(c.who, c.favour, c.other, c.plot);
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
    const answer = talkAnswer(state, r, question, about);
    this.emit({ t: state.tick, type: 'talk', who, answer, counted });
    return answer;
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
      state.stock[res] = Math.min(STOCK_CAP[res], state.stock[res] + v);
      this.addProduced(r.id, res, v);
    }
    favourSatisfaction(r);
    adjust(r, STEWARD, { trust: 0.03 }, state.tick);
    if (f.kind === 'visit' && f.other) {
      const o = this.resident(f.other);
      o.needs.company = clamp(o.needs.company + 0.25);
      o.needs.delight = clamp(o.needs.delight + 0.1);
      this.mind.perceive(ctx, o, { subject: `r:${r.id}`, aspect: 'kind_to_me', valence: 0.7, base: 0.45, source: 'witnessed', note: `${residentDef(r.id).name} came to see me` });
      this.mind.perceive(ctx, o, { subject: STEWARD, aspect: 'looks_out_for_me', valence: 0.5, base: 0.3, source: 'told', from: r.id, note: `the steward sent ${residentDef(r.id).name} round` });
    }
    r.favour = null;
    this.emit({ t: state.tick, type: 'favour', who: r.id, phase: 'done', kind: f.kind, yield: got, placeId: f.placeId, ...(f.other ? { other: f.other } : {}) });
  }

  private addProduced(by: string, res: Resource, v: number): void {
    const produced = (this.state.produced ??= {});
    const mine = (produced[by] ??= {});
    mine[res] = (mine[res] ?? 0) + v;
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
    if (this.activeResidents().length >= MAX_RESIDENTS) return;
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
    r.rel[STEWARD] = { ...newRelationship(), affinity: 0.25, familiarity: 0.3, trust: 0.5 };
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
    state.buildings.push(b);
    this.emit({ t: state.tick, type: 'built', building: b.id, btype: type, by: 'steward' });
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
    for (const r of this.activeResidents()) {
      const there = r.at === b.id;
      if (there || r.pending?.placeId === b.id) {
        r.activity = null;
        r.pending = null;
        r.path = [];
        r.at = null;
      }
      if (r.jobId === b.id) r.jobId = null;
      r.unseen.push({ building: b.id, kind: 'removed', tick: this.state.tick });
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
      const op = attachment(r, `b:${b.id}`);
      if (op > 0.15) {
        this.mind.perceive(ctx, r, { subject: `b:${b.id}`, aspect: 'lost_place', valence: -0.8, base: (0.7 + 0.8 * op) * heard, source, note: `the ${name} is gone` });
        this.mind.perceive(ctx, r, { subject: STEWARD, aspect: 'destroyed_place', valence: -0.7, base: (0.3 + 0.6 * op) * heard, source, note: `took away the ${name}` });
        this.emit({ t: state.tick, type: 'grief', who: r.id, building: b.id, btype: b.type, how });
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

  /** Start a meal: it draws on the town's food, and a bare larder makes it meagre. */
  private serveMeal(r: ResidentState, act: ActivityState): void {
    const state = this.state;
    if (state.stock.food >= MEAL) {
      state.stock.food -= MEAL;
      return;
    }
    act.meagre = true;
    const day = dayOf(state.tick);
    if (state.lastShortageDay !== day) {
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
              this.mind.perceive(ctx, r, { subject: STEWARD, aspect: 'improves_town', valence: 0.6, base: 0.5, source: 'witnessed', note: `built the ${buildingDef(b.type).name.toLowerCase()} for ${def.pronouns.obj}` });
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
      if (doing) delta[n] += ((ACTIVITY_EFFECTS[doing][n] ?? 0) * (doing === 'eat' && n === 'food' && act?.meagre ? 0.35 : 1)) / 60;
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
          if (src.placedBy === 'steward') {
            this.mind.perceive(ctx, r, { subject: STEWARD, aspect: 'spoils_town', valence: -0.5, base: base * 0.55, source: 'witnessed', note: `put the ${name} there` });
          }
        }
      }
    } else if (doing) {
      delta.comfort += (0.06 * prefScore(ambientPrefs(def), amb)) / 60;
    }
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
          const season = res === 'food' && getBuilding(state, r.at).type === 'garden' ? GARDEN_SEASON[seasonOf(tick)] : 1;
          const v = (rate / 60) * season * (0.5 + 0.5 * r.mood);
          state.stock[res] = Math.min(STOCK_CAP[res], state.stock[res] + v);
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
    const next = this.favourNext(r) ?? this.mind.decide(ctx, r);
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
    r.path = route([r.x, r.y], placeTile(getBuilding(state, next.placeId)));
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
      .sort((a, b) => rel(r, b.id).affinity - rel(r, a.id).affinity);
    const friend = friends[0];
    if (!friend) return;
    const fx = rel(friend, r.id);
    const lonely = Math.max(0, friend.setpoints.company - friend.needs.company);
    if (!chance(r, clamp(0.3 + 0.5 * fx.affinity + 0.6 * lonely))) return;
    const target = placeTile(getBuilding(state, next.placeId));
    const toFriend = route([r.x, r.y], [friend.x, friend.y]);
    const together = route([friend.x, friend.y], target);
    r.path = [...toFriend, ...together];
    friend.at = null;
    friend.activity = null;
    friend.visitAppraised = false;
    friend.pending = { ...next };
    friend.path = [...toFriend.map(() => [friend.x, friend.y] as [number, number]), ...together];
    adjust(r, friend.id, { familiarity: 0.02 }, state.tick);
    adjust(friend, r.id, { familiarity: 0.02 }, state.tick);
    this.emit({ t: state.tick, type: 'invite', a: r.id, b: friend.id, place: next.placeId });
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

    // Asks: close the ones dealt with, lapse the ignored, and voice at most one new one.
    for (const q of state.requests) {
      if (q.by !== r.id || q.status !== 'open') continue;
      const a = assess(state, r, q.kind, q.postedTick, q.wants);
      const stewardActed = q.kind === 'quieter_home' || state.buildings.some((b) => b.placedBy === 'steward' && b.placedTick >= q.postedTick);
      if (a.met) {
        q.status = stewardActed ? 'fulfilled' : 'resolved';
        q.closedTick = tick;
        if (stewardActed) {
          this.mind.perceive(ctx, r, { subject: STEWARD, aspect: 'listens_to_me', valence: 1, base: 1.3, source: 'witnessed', note: ASK_THANKS[q.kind] });
        }
        this.emit({ t: tick, type: 'request_closed', request: { ...q } });
      } else if (tick - q.postedTick > ASK_LAPSE_DAYS[q.kind] * TICKS_PER_DAY) {
        // Being ignored hurts most the first time; after that it is disappointment, not news.
        const before = lapsesOf(state, r.id, q.kind, tick);
        q.status = 'lapsed';
        q.closedTick = tick;
        this.mind.perceive(ctx, r, { subject: STEWARD, aspect: 'ignores_me', valence: -0.7, base: before === 0 ? 0.6 : 0.3, source: 'witnessed', note: 'nothing was done' });
        this.emit({ t: tick, type: 'request_closed', request: { ...q } });
      }
    }
    // Even a resident who has stopped trusting the steward still says so: the player must
    // always be able to find out what is wrong (pillar 3).
    for (const kind of ASK_KINDS) {
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
      r.disposition = 0.75 * r.disposition + 0.25 * (0.5 * dayMood + 0.5 * (0.5 + 0.5 * rel(r, STEWARD).affinity));
    }
    r.dayMoodSum = 0;
    r.dayMoodN = 0;
    if (!r.leaving) {
      r.lowDays = r.disposition < LEAVING_BELOW ? r.lowDays + 1 : 0;
      if (r.lowDays >= 3) {
        r.leaving = { sinceDay: day };
        this.emit({ t: tick, type: 'thinking_of_leaving', who: r.id });
      }
    } else if (r.disposition > STAYING_ABOVE) {
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
    this.emit({ t: this.state.tick, type: 'left_town', who: r.id });
  }

  /** A resident asks the steward for something outside the usual asks (a dream, for now). */
  ask(r: ResidentState, kind: Request['kind'], wants?: string): Request {
    const state = this.state;
    const q: Request = { id: state.nextRequestId++, by: r.id, kind, subject: `r:${r.id}`, postedTick: state.tick, status: 'open', ...(wants ? { wants } : {}) };
    state.requests.push(q);
    this.emit({ t: state.tick, type: 'request_posted', request: { ...q } });
    return q;
  }

  private hourly(): void {
    // Orchards and glasshouses grow on their own, by season.
    const season = seasonOf(this.state.tick);
    for (const b of liveBuildings(this.state)) {
      const passive = buildingDef(b.type).passive;
      if (!passive) continue;
      const factor = PASSIVE_SEASON[b.type]?.[season] ?? 1;
      for (const [res, rate] of Object.entries(passive) as Array<[Resource, number]>) {
        this.state.stock[res] = Math.min(STOCK_CAP[res], this.state.stock[res] + rate * factor);
        if (rate * factor > 0) this.addProduced(b.type, res, rate * factor);
      }
    }
    for (const r of this.activeResidents()) {
      const def = residentDef(r.id);
      decayEmotions(r);
      r.mood = clamp(0.75 * needsWellbeing(r.needs, r.setpoints, def) + 0.25 * (0.5 + 0.5 * emotionBalance(r)));
      r.dayMoodSum += r.mood;
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

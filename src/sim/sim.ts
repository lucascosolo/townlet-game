// The simulation loop. Owns the body and the world; delegates cognition to a Mind.

import { buildingDef } from '../content/buildings.js';
import { residentDef } from '../content/residents.js';
import { deriveSeed } from './rng.js';
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
import { newRelationship, rel } from './mind/relationships.js';
import { StructuredMind } from './mind/structured.js';
import { runExchange } from './social.js';
import { DAWN_MINUTE, TICKS_PER_DAY, dayOf, minuteOf } from './time.js';
import {
  NEEDS,
  STEWARD,
  type BuildingState,
  type Need,
  type ResidentDef,
  type ResidentState,
  type SimEvent,
  type SimState,
} from './types.js';
import { ambientAt, canPlace, emptyQualities, getBuilding, liveBuildings, mainSource, placeTile, route } from './world.js';

export type Command =
  | { at: number; kind: 'build'; type: string; x: number; y: number }
  | { at: number; kind: 'remove'; x: number; y: number };

export interface Scenario {
  name: string;
  width: number;
  height: number;
  buildings: Array<{ type: string; x: number; y: number }>;
  /** Resident id -> index into `buildings` of their home. */
  residents: Record<string, number>;
  relationships?: Array<{ a: string; b: string; affinity: number; familiarity: number; trust: number }>;
  commands?: Command[];
}

const REQUEST_LAPSE_TICKS = 5 * TICKS_PER_DAY;

export function createState(scenario: Scenario, seed: number): SimState {
  const state: SimState = {
    version: 1,
    seed,
    tick: 0,
    width: scenario.width,
    height: scenario.height,
    buildings: [],
    nextBuildingId: 1,
    residents: {},
    order: Object.keys(scenario.residents),
    requests: [],
    nextEpisodeId: 1,
    nextRequestId: 1,
  };
  for (const b of scenario.buildings) {
    const err = canPlace(state, b.type, b.x, b.y);
    if (err) throw new Error(`scenario ${scenario.name}: ${b.type} at ${b.x},${b.y}: ${err}`);
    state.buildings.push({ id: state.nextBuildingId++, type: b.type, x: b.x, y: b.y, placedTick: 0, placedBy: 'founding', removed: false });
  }
  for (const [id, homeIdx] of Object.entries(scenario.residents)) {
    const def = residentDef(id);
    const home = state.buildings[homeIdx];
    if (!home || buildingDef(home.type).kind !== 'home') throw new Error(`scenario ${scenario.name}: ${id} has no home`);
    const [x, y] = placeTile(home);
    const r: ResidentState = {
      id,
      homeId: home.id,
      jobId: null,
      x,
      y,
      at: home.id,
      path: [],
      activity: { id: 'sleep', placeId: home.id, until: def.wake, night: true },
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
      rng: deriveSeed(seed, `r:${id}`),
    };
    state.residents[id] = r;
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

export class Simulation {
  state: SimState;
  readonly mind: Mind;
  private listeners: Array<(e: SimEvent) => void> = [];
  private commands: Command[] = [];
  private worked = new Set<number>();

  constructor(state: SimState, mind: Mind = StructuredMind) {
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
    const ctx = this.ctx();
    const minute = minuteOf(state.tick);
    if (minute === DAWN_MINUTE) this.emit({ t: state.tick, type: 'dawn', day: dayOf(state.tick) });

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
    if (c.kind === 'build') this.build(c.type, c.x, c.y);
    else this.remove(c.x, c.y);
  }

  build(type: string, x: number, y: number): BuildingState {
    const state = this.state;
    const err = canPlace(state, type, x, y);
    if (err) throw new Error(`cannot build ${type} at ${x},${y}: ${err}`);
    const b: BuildingState = { id: state.nextBuildingId++, type, x, y, placedTick: state.tick, placedBy: 'steward', removed: false };
    // Each resident weighs how the new building changes the feel of home, before and after.
    const before = new Map<string, number>();
    for (const r of this.activeResidents()) before.set(r.id, this.homeFeel(r));
    state.buildings.push(b);
    this.emit({ t: state.tick, type: 'built', building: b.id, btype: type, by: 'steward' });
    const ctx = this.ctx();
    const bdef = buildingDef(type);
    for (const r of this.activeResidents()) {
      const def = residentDef(r.id);
      const delta = this.homeFeel(r) - (before.get(r.id) ?? 0);
      const valueMatch =
        bdef.kind === 'social' ? def.values.community : bdef.kind === 'decor' || bdef.kind === 'nature' ? Math.max(def.values.beauty, def.values.nature) : bdef.kind === 'work' ? def.values.craft : 0;
      if (Math.abs(delta) >= 0.04) {
        const sign = Math.sign(delta);
        const aspect = sign > 0 ? 'nice_addition' : 'unwelcome_addition';
        this.mind.perceive(ctx, r, { subject: `b:${b.id}`, aspect, valence: 0.6 * sign, base: clamp(Math.abs(delta) * 3), source: 'witnessed', note: sign > 0 ? 'makes home nicer' : 'spoils home' });
        this.mind.perceive(ctx, r, { subject: STEWARD, aspect: sign > 0 ? 'improves_town' : 'spoils_town', valence: 0.5 * sign, base: clamp(Math.abs(delta) * 2), source: 'witnessed', note: `built the ${bdef.name.toLowerCase()}` });
        this.emit({ t: state.tick, type: 'reaction', who: r.id, building: b.id, aspect, valence: sign });
      } else if (valueMatch >= 0.6) {
        this.mind.perceive(ctx, r, { subject: `b:${b.id}`, aspect: 'nice_addition', valence: 0.5, base: 0.3 * valueMatch, source: 'witnessed', note: 'good for the town' });
        this.mind.perceive(ctx, r, { subject: STEWARD, aspect: 'improves_town', valence: 0.4, base: 0.25 * valueMatch, source: 'witnessed', note: `built the ${bdef.name.toLowerCase()}` });
        this.emit({ t: state.tick, type: 'reaction', who: r.id, building: b.id, aspect: 'nice_addition', valence: 1 });
      }
    }
    this.assignJobs();
    return b;
  }

  remove(x: number, y: number): BuildingState {
    const b = liveBuildings(this.state).find((bb) => {
      const [w, h] = buildingDef(bb.type).size;
      return x >= bb.x && x < bb.x + w && y >= bb.y && y < bb.y + h;
    });
    if (!b) throw new Error(`nothing to remove at ${x},${y}`);
    if (buildingDef(b.type).kind === 'home') throw new Error('removing homes is not supported in M1');
    const ctx = this.ctx();
    b.removed = true;
    this.emit({ t: this.state.tick, type: 'removed', building: b.id, btype: b.type, by: 'steward' });
    for (const r of this.activeResidents()) {
      if (r.at === b.id || r.pending?.placeId === b.id) {
        r.activity = null;
        r.pending = null;
        r.path = [];
        r.at = null;
      }
      if (r.jobId === b.id) r.jobId = null;
      const op = attachment(r, `b:${b.id}`);
      if (op > 0.15) {
        this.mind.perceive(ctx, r, { subject: `b:${b.id}`, aspect: 'lost_place', valence: -0.8, base: 0.7 + 0.8 * op, source: 'witnessed', note: `the ${buildingDef(b.type).name.toLowerCase()} is gone` });
        this.mind.perceive(ctx, r, { subject: STEWARD, aspect: 'destroyed_place', valence: -0.7, base: 0.3 + 0.6 * op, source: 'witnessed', note: `took away the ${buildingDef(b.type).name.toLowerCase()}` });
        this.emit({ t: this.state.tick, type: 'grief', who: r.id, building: b.id, btype: b.type });
      }
    }
    this.assignJobs();
    return b;
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
      if (doing) delta[n] += (ACTIVITY_EFFECTS[doing][n] ?? 0) / 60;
    }
    const tile: [number, number] = r.at !== null ? placeTile(getBuilding(state, r.at)) : [r.x, r.y];
    const amb = r.at !== null || r.path.length > 0 ? ambientAt(state, tile[0], tile[1], this.worked) : emptyQualities();

    if (sleeping) {
      r.sleepNoiseMax = Math.max(r.sleepNoiseMax, amb.noise);
      if (amb.noise > sleepNoiseThreshold(def)) {
        delta.rest = ((ACTIVITY_EFFECTS.sleep.rest ?? 0) * 0.3) / 60;
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
            this.mind.perceive(ctx, r, { subject: STEWARD, aspect: 'spoils_town', valence: -0.5, base: base * 0.35, source: 'witnessed', note: `put the ${name} there` });
          }
        }
      }
    } else if (doing) {
      delta.comfort += (0.06 * prefScore(ambientPrefs(def), amb)) / 60;
    }
    for (const n of NEEDS) r.needs[n] = clamp(r.needs[n] + delta[n]);

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
    if (act?.id === 'sleep' && act.night && tick >= act.until) this.wake(ctx, r);
    const next = this.mind.decide(ctx, r);
    if (next.night && !(act?.id === 'sleep' && act.night)) {
      r.sleepNoiseMax = 0;
      r.disturbedBy = [];
    }
    if (next.placeId === r.at) {
      r.activity = next;
      return;
    }
    r.at = null;
    r.activity = null;
    r.visitAppraised = false;
    r.pending = next;
    r.path = route([r.x, r.y], placeTile(getBuilding(state, next.placeId)));
    if (r.path.length === 0) this.arrive(ctx, r);
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
    this.mind.onArrive(ctx, r, next.placeId);
  }

  private wake(ctx: MindContext, r: ResidentState): void {
    const state = this.state;
    const def = residentDef(r.id);
    const tick = state.tick;
    const day = dayOf(tick);

    this.mind.consolidate(ctx, r);

    // Close or lapse open requests.
    for (const q of state.requests) {
      if (q.by !== r.id || q.status !== 'open') continue;
      const id = Number(q.subject.slice(2));
      const b = state.buildings.find((x) => x.id === id);
      if (!b || b.removed || r.sleepNoiseMax <= sleepNoiseThreshold(def)) {
        q.status = 'fulfilled';
        q.closedTick = tick;
        this.mind.perceive(ctx, r, { subject: STEWARD, aspect: 'listens_to_me', valence: 1, base: 1.3, source: 'witnessed', note: 'a quiet night at last' });
        this.emit({ t: tick, type: 'request_closed', request: { ...q } });
      } else if (tick - q.postedTick > REQUEST_LAPSE_TICKS) {
        q.status = 'lapsed';
        q.closedTick = tick;
        this.mind.perceive(ctx, r, { subject: STEWARD, aspect: 'ignores_me', valence: -0.7, base: 0.6, source: 'witnessed', note: 'nothing was done' });
        this.emit({ t: tick, type: 'request_closed', request: { ...q } });
      }
    }
    // Post new requests about strong night-noise beliefs.
    for (const bel of Object.values(r.beliefs)) {
      if (bel.aspect !== 'noisy_at_night' || !bel.subject.startsWith('b:') || bel.strength < 0.35) continue;
      const b = state.buildings.find((x) => `b:${x.id}` === bel.subject);
      if (!b || b.removed) continue;
      // Ask only about a noise that actually disturbed last night, and only once at a time.
      if (!r.disturbedBy.includes(b.id)) continue;
      if (state.requests.some((q) => q.by === r.id && q.subject === bel.subject && q.status === 'open')) continue;
      if (rel(r, STEWARD).trust < 0.3) continue;
      const q = { id: state.nextRequestId++, by: r.id, kind: 'quieter_home' as const, subject: bel.subject, postedTick: tick, status: 'open' as const };
      state.requests.push(q);
      this.emit({ t: tick, type: 'request_posted', request: { ...q } });
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
      r.disposition = 0.75 * r.disposition + 0.25 * (0.8 * dayMood + 0.2 * (0.5 + 0.5 * opinion(r, STEWARD)));
    }
    r.dayMoodSum = 0;
    r.dayMoodN = 0;
    if (!r.leaving) {
      r.lowDays = r.disposition < 0.38 ? r.lowDays + 1 : 0;
      if (r.lowDays >= 3) {
        r.leaving = { sinceDay: day };
        this.emit({ t: tick, type: 'thinking_of_leaving', who: r.id });
      }
    } else if (r.disposition > 0.45) {
      r.leaving = null;
      r.lowDays = 0;
      this.emit({ t: tick, type: 'decided_to_stay', who: r.id });
    } else if (day - r.leaving.sinceDay >= 7) {
      r.departed = true;
      r.at = null;
      r.activity = null;
      r.pending = null;
      r.path = [];
      r.jobId = null;
      this.emit({ t: tick, type: 'left_town', who: r.id });
    }
  }

  private hourly(): void {
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
          if (!this.mind.wantsToInteract(ctx, a, b, setting)) continue;
          const kind = this.mind.chooseExchange(ctx, a, b, setting, placeId);
          runExchange(ctx, this.mind, a, b, kind, setting, placeId);
        }
      }
    }
  }
}

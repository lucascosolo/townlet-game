// The game controller: owns the simulation, the clock and the narrator. Every change the
// player makes goes through a sim command, logged, so a session can be replayed exactly
// (M2 criterion 2).

import { Narrator } from '../../src/narrate/narrator.js';
import { runScenario } from '../../src/scenarios/index.js';
import type { StewardPolicy } from '../../src/scenarios/steward.js';
import type { Command, Simulation } from '../../src/sim/sim.js';
import type { SimEvent } from '../../src/sim/types.js';

export const SPEEDS = [0, 1, 3, 10, 30] as const;
/** Ticks (in-game minutes) per real second at 1x: a day lasts six minutes. */
export const TICKS_PER_SECOND = 4;
/** Never step more than this in one frame, so a slow frame can't snowball. */
const MAX_TICKS_PER_FRAME = 240;

export type PlayerCommand = Command extends infer C ? (C extends { at: number } ? Omit<C, 'at'> : never) : never;

export interface GameOptions {
  scenario: string;
  seed: number;
  steward: StewardPolicy;
}

/** FNV-1a over a string, continuing from a previous hash. */
export function fnv(hash: number, text: string): number {
  let h = hash >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export class Game {
  readonly sim: Simulation;
  readonly narrator: Narrator;
  readonly options: GameOptions;
  readonly commandLog: Command[] = [];
  speedIndex = 1;
  /** Running hash of every sim event, for replay checks. */
  eventHash = 0x811c9dc5;
  eventCount = 0;
  /** Exponential average of milliseconds spent stepping the sim per frame. */
  stepMs = 0;
  private acc = 0;
  private listeners: Array<(e: SimEvent) => void> = [];

  constructor(options: GameOptions) {
    this.options = options;
    this.sim = runScenario(options.scenario, options.seed, options.steward, { scripted: false });
    // In the browser the player is the steward: narrate their actions as "you".
    this.narrator = new Narrator(this.sim, { stewardIsYou: true });
    this.sim.on((e) => {
      this.eventHash = fnv(this.eventHash, JSON.stringify(e));
      this.eventCount++;
      for (const l of this.listeners) l(e);
    });
  }

  onEvent(listener: (e: SimEvent) => void): void {
    this.listeners.push(listener);
  }

  get speed(): number {
    return SPEEDS[this.speedIndex] ?? 0;
  }

  /** Advance by real seconds at the current speed; returns ticks stepped. */
  advance(dtSeconds: number): number {
    this.acc += Math.min(dtSeconds, 0.25) * TICKS_PER_SECOND * this.speed;
    const n = Math.min(Math.floor(this.acc), MAX_TICKS_PER_FRAME);
    this.acc -= n;
    if (this.acc > MAX_TICKS_PER_FRAME) this.acc = 0;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) this.sim.step();
    const ms = performance.now() - t0;
    this.stepMs = this.stepMs * 0.95 + ms * 0.05;
    return n;
  }

  /** Step a fixed number of ticks immediately (fast-forward, tests). */
  runTicks(n: number): void {
    for (let i = 0; i < n; i++) this.sim.step();
  }

  /** The only way the UI changes the town: a command, applied at the start of the next tick. */
  command(c: PlayerCommand): void {
    const cmd = { ...c, at: this.sim.tick } as Command;
    this.commandLog.push(cmd);
    this.sim.schedule([cmd]);
    // Talk, favours and the trader's gift answer at once, even when paused; the log replays them at the same tick.
    if (cmd.kind === 'talk' || cmd.kind === 'favour' || cmd.kind === 'gift' || cmd.kind === 'reply' || cmd.kind === 'look') this.sim.flushCommands();
  }
}

// Saving (M4 criterion 8; made to survive code changes 2026-10-11). A save holds the town as it is
// (a snapshot of the sim state) and the player's commands. Loading carries on from the snapshot, so
// a town saved under one build loads under the next whatever changed in the sim. The commands are
// kept because replaying them through a fresh simulation lands in exactly the same place as the
// snapshot under the sim that made it (M2 criterion 2; test/saves.test.ts checks it on the fixtures),
// and because a save from before 2026-10-11 has only them.

import type { StewardPolicy } from '../../src/scenarios/steward.js';
import type { Command } from '../../src/sim/sim.js';
import type { SimState } from '../../src/sim/types.js';
import type { NarratorEntry } from '../../src/narrate/narrator.js';
import { Game, type GameOptions } from './game.js';

const KEY = 'townlet.save.v1';

/** Set by the build (vite.config.ts): a hash of the sim's source. Tests and plain Node see "dev". */
declare const __SIM_VERSION__: string | undefined;
export const SIM_VERSION: string = typeof __SIM_VERSION__ === 'string' ? __SIM_VERSION__ : 'dev';

/** The sim state layout a snapshot must have to be loaded (SimState.version). */
const STATE_VERSION = 2;

export interface SaveData {
  /** 1: commands only (saves made before 2026-10-11). 2: commands and a snapshot. */
  version: 1 | 2;
  scenario: string;
  seed: number;
  steward: StewardPolicy;
  tick: number;
  commands: Command[];
  savedAt: string;
  /**
   * Audit 2026-10-10: whether the scenario's scripted commands ran. A save without it ran them
   * if it was made before bar round 1 went live (see scriptedFor).
   */
  scripted?: boolean;
  /** Version 2: the sim that made the save (SIM_VERSION), and the town as it was. */
  simVersion?: string;
  snapshot?: SimState;
  /** Version 2: the town's log as told so far (the snapshot holds the sim, not the telling). */
  log?: NarratorEntry[];
}

/** How a saved town was brought back. */
export type LoadedHow = 'snapshot' | 'replay' | 'fresh';

/** When bar round 1, which turned the scenarios' scripted commands off in the browser, went live. */
const SCRIPTS_OFF_SINCE = Date.parse('2026-10-08T21:29:48Z');

/** Whether a save's town ran its scenario's scripted commands (older saves did not say). */
export function scriptedFor(data: SaveData): boolean {
  if (data.scripted !== undefined) return data.scripted;
  const at = Date.parse(data.savedAt);
  return Number.isFinite(at) && at < SCRIPTS_OFF_SINCE;
}

/** Browser storage can be missing or refuse (private windows, blocked site data): saving then quietly does nothing. */
function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** What a save of this game holds. The snapshot is the live state: serialise it before stepping on. */
export function saveData(game: Game, savedAt = new Date()): SaveData {
  // A command given this minute is applied at the start of the next step; apply it now so the
  // snapshot has it (the step would have done the same first thing).
  game.sim.flushCommands();
  return {
    version: 2,
    scenario: game.options.scenario,
    seed: game.options.seed,
    steward: game.options.steward,
    tick: game.sim.tick,
    commands: game.commandLog,
    savedAt: savedAt.toISOString(),
    scripted: game.options.scripted ?? false,
    simVersion: SIM_VERSION,
    snapshot: game.sim.state,
    log: game.narrator.entries,
  };
}

export function saveGame(game: Game): void {
  try {
    storage()?.setItem(KEY, JSON.stringify(saveData(game)));
  } catch {
    // Full or blocked: the game goes on, unsaved.
  }
}

/** Whether something parsed from storage or a file is a save this code can read. */
export function isSave(data: unknown): data is SaveData {
  if (!data || typeof data !== 'object') return false;
  const d = data as Partial<SaveData>;
  return (d.version === 1 || d.version === 2) && typeof d.scenario === 'string' && Number.isFinite(d.seed) && Array.isArray(d.commands) && Number.isFinite(d.tick);
}

export function loadSave(): SaveData | null {
  try {
    const raw = storage()?.getItem(KEY);
    if (!raw) return null;
    const data: unknown = JSON.parse(raw);
    return isSave(data) ? data : null;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try {
    storage()?.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

/** Replay a save into a game freshly made from the same scenario and seed. */
export function restore(game: Game, data: SaveData): void {
  if (!data.commands.every((c) => c && typeof c === 'object' && Number.isFinite(c.at) && typeof c.kind === 'string')) throw new Error('the save\'s commands are not commands');
  for (const c of data.commands) game.commandLog.push(c);
  game.sim.schedule(data.commands.map((c) => ({ ...c })));
  game.runTicks(Math.max(0, data.tick - game.sim.tick));
  // Commands given in the very minute the game was saved (a talk, a favour, the trader's cart)
  // ran at once when given; run them now too, or the reload would lose them (found 2026-10-08).
  game.sim.flushCommands();
}

/**
 * The game a save holds. From the snapshot when there is one this code can read; by replaying
 * the commands when there is not (a save from before 2026-10-11, or a snapshot whose layout has
 * since changed); and, if that fails too, the town's first morning, which is better than no town.
 */
export function loadGame(data: SaveData): { game: Game; how: LoadedHow } {
  const options: GameOptions = { scenario: data.scenario, seed: data.seed, steward: data.steward, scripted: scriptedFor(data) };
  const snapshot = data.version === 2 && data.snapshot && data.snapshot.version === STATE_VERSION ? data.snapshot : null;
  if (snapshot) {
    try {
      // A copy: the game steps its state in place, and the caller's save must stay as it was.
      const game = new Game({ ...options, snapshot: structuredClone(snapshot) });
      for (const c of data.commands) game.commandLog.push({ ...c });
      if (Array.isArray(data.log)) game.narrator.restoreEntries(data.log);
      return { game, how: 'snapshot' };
    } catch (e) {
      console.warn('the saved town could not be loaded as it was; replaying it', e);
    }
  }
  try {
    const game = new Game(options);
    restore(game, data);
    return { game, how: 'replay' };
  } catch (e) {
    console.warn('the saved town could not be replayed; starting it over', e);
    return { game: new Game(options), how: 'fresh' };
  }
}

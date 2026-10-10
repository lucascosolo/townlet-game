// Saving (M4 criterion 8): the town is its seed, its scenario and the player's commands, so a save
// is just those and the tick reached. Loading replays them through a fresh simulation, which the
// command log already guarantees lands in exactly the same place (M2 criterion 2).

import type { StewardPolicy } from '../../src/scenarios/steward.js';
import type { Command } from '../../src/sim/sim.js';
import type { Game } from './game.js';

const KEY = 'townlet.save.v1';

export interface SaveData {
  version: 1;
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
}

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

export function saveGame(game: Game): void {
  const data: SaveData = {
    version: 1,
    scenario: game.options.scenario,
    seed: game.options.seed,
    steward: game.options.steward,
    tick: game.sim.tick,
    commands: game.commandLog,
    savedAt: new Date().toISOString(),
    scripted: game.options.scripted ?? false,
  };
  try {
    storage()?.setItem(KEY, JSON.stringify(data));
  } catch {
    // Full or blocked: the game goes on, unsaved.
  }
}

export function loadSave(): SaveData | null {
  try {
    const raw = storage()?.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    return data.version === 1 && Array.isArray(data.commands) && Number.isFinite(data.tick) ? data : null;
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
  for (const c of data.commands) game.commandLog.push(c);
  game.sim.schedule(data.commands.map((c) => ({ ...c })));
  game.runTicks(Math.max(0, data.tick - game.sim.tick));
  // Commands given in the very minute the game was saved (a talk, a favour, the trader's cart)
  // ran at once when given; run them now too, or the reload would lose them (found 2026-10-08).
  game.sim.flushCommands();
}

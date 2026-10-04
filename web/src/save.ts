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
}

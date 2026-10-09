// What the notice board and the standing ledger show, as pure functions so a test checks the
// same rule the page uses (bar round 3: ten identical "asks for more food" cards; five
// "kept me waiting N days" lines in a row).
import { dayOfMeals } from '../sim/hunger.js';
import type { Request, SimState } from '../sim/types.js';

/** Open asks grouped into cards: one per kind, a dream ask per building wanted. */
export function groupAsks(requests: readonly Request[]): Request[][] {
  const groups = new Map<string, Request[]>();
  for (const q of requests) {
    const key = q.kind === 'aspiration' ? `${q.kind}|${q.wants ?? q.by}` : q.kind;
    const g = groups.get(key);
    if (g) g.push(q);
    else groups.set(key, [q]);
  }
  return [...groups.values()];
}

/** The grievance a ledger reason is about, with its counts taken out: "kept me waiting 3 days for x" is "kept me waiting # days for x". */
export function reasonStem(reason: string): string {
  return reason.replace(/\d+/g, '#');
}

export interface LedgerNote {
  day: number;
  up: boolean;
  reasons: string[];
  also: string[];
}

/**
 * Add a night's standing change to someone's ledger: a reason already on a line from the last
 * seven days updates that line rather than adding another. Newest first, five lines at most.
 */
export function addLedgerNote(notes: LedgerNote[], note: LedgerNote): LedgerNote[] {
  const stems = new Set([...note.reasons, ...note.also].map(reasonStem));
  const kept = notes.filter((n) => note.day - n.day >= 7 || ![...n.reasons, ...n.also].some((r) => stems.has(reasonStem(r))));
  return [note, ...kept].slice(0, 5);
}

export function ledgerLine(n: LedgerNote): string {
  return `${n.up ? '▲' : '▼'} Day ${n.day}: ${n.reasons.join('; ')}${n.also.length ? ` · ${n.up ? '▼' : '▲'} ${n.also.join('; ')}` : ''}`;
}

/**
 * What the town is worried about, for the top of the board (bar round 4: "A quiet night. Nothing
 * needs you." with six food for eleven people).
 */
export function townWorries(state: SimState): string[] {
  const out: string[] = [];
  const need = dayOfMeals(state);
  const larder = Math.floor(state.stock.food);
  const granary = Math.floor(state.granary ?? 0);
  const have = larder + granary;
  if (need > 0 && have < need) out.push(have <= 0 ? `The larder is empty, and everyone knows it.` : `The larder holds ${have} food: less than a day's meals for ${Math.round(need)}. People are starting to worry.`);
  // Bar round 5: the granary feeding the town is a worry too (a week of near-empty larder went unremarked).
  else if (need > 0 && larder < need && granary > 0) out.push(`The larder is nearly bare, and the granary is feeding the town: ${granary} food left in it.`);
  return out;
}

/**
 * The board's line when nothing major happened overnight (bar round 5: "A quiet night. Nothing needs
 * you." above three people asking for work). Never says nothing needs you while something does.
 */
export function quietLine(state: SimState, worries: number, minorOvernight: number): string {
  const waiting = state.requests.some((q) => q.status === 'open') || state.story.dilemmas.some((d) => d.status === 'open');
  if (worries > 0) return 'Nothing else new this morning.';
  if (waiting) return 'Nothing new overnight.';
  return minorOvernight ? 'A quiet night. Nothing needs you.' : 'Nothing new on the board.';
}

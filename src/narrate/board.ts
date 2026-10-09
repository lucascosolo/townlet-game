// What the notice board and the standing ledger show, as pure functions so a test checks the
// same rule the page uses (bar round 3: ten identical "asks for more food" cards; five
// "kept me waiting N days" lines in a row).
import type { Request } from '../sim/types.js';

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

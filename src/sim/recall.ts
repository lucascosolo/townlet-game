// Memories in conversation (M3b, 2026-10-08): when the steward talks with a resident, they may
// bring up something they lived through, a real episode from their long-term memory. Which one
// is a pure function of what they hold, the question, and when, so a replay says the same thing.

import { STEWARD, type Episode, type ResidentState, type SubjectId, type TalkQuestion } from './types.js';
import { TICKS_PER_DAY } from './time.js';

/**
 * How worth retelling each kind of memory is. Kinds not listed (a peaceful spot, a crowded room,
 * a pleasant chat somewhere) are everyday impressions and never retold.
 */
export const RETELLABLE: Record<string, number> = {
  granted_wish: 1.4,
  lost_place: 1.3,
  destroyed_place: 1.2,
  wonderful_time: 1.2,
  made_amends: 1.2,
  improves_town: 1,
  listens_to_me: 1,
  spoils_town: 1,
  turned_me_down: 1,
  ignores_me: 1,
  decided_well: 0.9,
  decided_badly: 1,
  looks_out_for_me: 1,
  kind_to_me: 1,
  let_me_down: 1,
  argued_with_me: 1,
  rude_to_me: 0.9,
  weathered_together: 1.1,
  kept_awake: 0.8,
  glorious_failure: 1,
  too_noisy: 0.7,
  noisy_at_night: 1,
  my_workplace: 1,
  asks_too_much: 0.9,
  smells_lovely: 0.4,
};

/** A story (a kind of memory about one thing) is not told to the steward again for this long. */
export const RETELL_GAP = 3 * TICKS_PER_DAY;
/** "How are you?" and "What's on your mind?" bring a memory up only when it is this vivid. */
export const VIVID = 0.3;

/** A memory as it comes up in talk: the episode, as data. */
export interface Recollection {
  episodeId: number;
  tick: number;
  subject: SubjectId;
  aspect: string;
  valence: number;
  note: string;
  placeId?: number;
}

/** The story a memory tells: the same kind about the same thing is the same story, whichever night it was. */
export const storyKey = (ep: { subject: SubjectId; aspect: string }): string => `${ep.subject}|${ep.aspect}`;

/** How vivid an episode is now: its weight, how strongly it was felt, fading slowly with the days. */
export function vividness(ep: Episode, now: number): number {
  const w = RETELLABLE[ep.aspect];
  if (!w) return 0;
  const days = (now - ep.tick) / TICKS_PER_DAY;
  return w * ep.intensity * Math.abs(ep.valence) * Math.pow(0.97, days);
}

/** Episodes a resident could retell as their own: lived through, kind worth telling, at least a day old. */
export function retellable(r: ResidentState, now: number): Episode[] {
  return r.episodes.filter((ep) => ep.source === 'witnessed' && RETELLABLE[ep.aspect] !== undefined && now - ep.tick >= TICKS_PER_DAY);
}

/** Their most vivid memories, for their page: up to `n` different stories, most vivid first. */
export function vividMemories(r: ResidentState, now: number, n = 3): Episode[] {
  const seen = new Set<string>();
  return retellable(r, now)
    .map((ep) => ({ ep, v: vividness(ep, now) }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v || a.ep.id - b.ep.id)
    .filter((x) => !seen.has(storyKey(x.ep)) && (seen.add(storyKey(x.ep)), true))
    .slice(0, n)
    .map((x) => x.ep);
}

/** Which memory, if any, comes up when asked `question` (about `about`, for "what do you think of…"). */
export function recallFor(r: ResidentState, now: number, question: TalkQuestion, about?: SubjectId): Recollection | null {
  if (question === 'hope') return null;
  const want: SubjectId | null = question === 'me' ? STEWARD : question === 'opinion' ? (about ?? STEWARD) : null;
  const told = r.recalled ?? {};
  let best: Episode | null = null;
  let bestV = 0;
  for (const ep of retellable(r, now)) {
    if (want !== null && ep.subject !== want) continue;
    const last = told[storyKey(ep)];
    if (last !== undefined && now - last < RETELL_GAP) continue;
    const v = vividness(ep, now);
    if (v > bestV || (v === bestV && best && ep.id < best.id)) {
      best = ep;
      bestV = v;
    }
  }
  if (!best || bestV <= 0) return null;
  if (want === null && bestV < VIVID) return null;
  return {
    episodeId: best.id,
    tick: best.tick,
    subject: best.subject,
    aspect: best.aspect,
    valence: best.valence,
    note: best.note,
    ...(best.placeId !== undefined ? { placeId: best.placeId } : {}),
  };
}

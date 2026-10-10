// Talking back (bar round 1, 2026-10-08): after a resident answers, the steward can reply in one
// of four ways. Each reply is a logged command, lands differently depending on who is listening,
// and is remembered like anything else. Which replies are offered is a pure function of what the
// resident holds, so the same conversation replays the same.

import { residentDef } from '../content/residents.js';
import { beliefKey } from './mind/memory.js';
import { adjust } from './mind/relationships.js';
import { TICKS_PER_DAY } from './time.js';
import { STEWARD, type ResidentState, type SimState, type TalkAnswer } from './types.js';

export type ReplyKind = 'agree' | 'disagree' | 'sorry' | 'explain';

/** How the reply landed, which picks the resident's response. */
export type ReplyStance = 'warm' | 'respect' | 'sulk' | 'forgiven' | 'enough' | 'convinced' | 'unconvinced' | 'puzzled' | 'owned' | 'insist' | 'differ' | 'seen' | 'with_you' | 'encouraged' | 'mulled' | 'bristled' | 'fine' | 'nudged' | 'cheap' | 'too_soon' | 'best_of' | 'we_ll_see';

/** What an answer said, which decides how agreeing or disagreeing with it lands (bar round 3). */
export type ReplyTone = 'praise' | 'complaint' | 'view' | 'mood' | 'hope';

/**
 * What of an answer was actually said (bar round 4): the narrator trims a long answer, and the
 * replies follow the words that survived, not the whole answer.
 */
export interface AnswerCut {
  topics: number;
  memory: boolean;
  because: boolean;
  /** The words never named the subject ("Is it a crime to be this happy?"), so the chips do not either. */
  unnamed?: boolean;
}

/** The replies open to what was actually said (bar round 4). */
export function offersForCut(r: ResidentState, answer: TalkAnswer, cut: AnswerCut, now = 0): ReplyOffer[] {
  const offers = offersFor(r, cutAnswer(answer, cut), now);
  if (!cut.unnamed) return offers;
  return offers.map((o) => {
    if ((o.kind !== 'agree' && o.kind !== 'disagree') || !o.about || o.about === STEWARD) return o;
    const { about: _a, ...rest } = o;
    return rest;
  });
}

/** The part of an answer that was said. */
export function cutAnswer(a: TalkAnswer, cut: AnswerCut): TalkAnswer {
  const out: TalkAnswer = { ...a, ...(a.topics ? { topics: a.topics.slice(0, cut.topics) } : {}) };
  if (!cut.memory) delete out.memory;
  if (!cut.because) delete out.because;
  return out;
}

export interface ReplyOffer {
  kind: ReplyKind;
  /** For sorry and explain: the grievance it answers (a belief or trace key about the steward). */
  aspect?: string;
  /** What the reply names (bar round 2): the grievance's note in their words ("took away the old oak"), or a subject id for agree and disagree. */
  about?: string;
  /** For agree and disagree: what kind of thing was said (bar round 3). */
  tone?: ReplyTone;
  /** For a "how are you" answer: whether they said they were well. */
  well?: boolean;
  /** For a hope answer between dreams (bar round 4). */
  rest?: boolean;
}

/** Grievances about a decision, which an explanation can answer. */
const DECISION_GRIEVANCES = new Set(['turned_me_down', 'decided_badly']);
/**
 * Bar round 6: explain is for a proposal answered (or left unanswered), not for an ask left unmet
 * ("Let me explain why I never got him a fuller larder" was accepted).
 */
export function explainable(aspect: string, note: string): boolean {
  return DECISION_GRIEVANCES.has(aspect) || (aspect === 'ignores_me' && /\bidea\b/.test(note));
}
/** A second sorry for the same thing within this long changes nothing. */
export const SORRY_GAP = 3 * TICKS_PER_DAY;
/** Bar round 7: a sorry for a loss you caused, this soon after it, is "not yet". */
export const TOO_SOON = 2 * TICKS_PER_DAY;
/** Bar round 8: for a day after a loss you caused, every answer offers a sorry for it (so "not yet" can be heard). */
export const HURT_SORRY = TICKS_PER_DAY;
/** Bar round 8: below zero standing, a sorry moves standing by no more than this. */
export const WE_LL_SEE_GAIN = 0.01;

/** Bar round 7: a grievance forgiven in the last week is not raised again (Juniper brought one up the day after forgiving it). */
export const FORGIVEN_QUIET = 7 * TICKS_PER_DAY;
export function recentlyForgiven(r: ResidentState, aspect: string, now: number): boolean {
  const t = r.forgiven?.[aspect];
  return t !== undefined && now - t < FORGIVEN_QUIET;
}

/** Everything they hold against the steward, strongest first: settled beliefs and feelings still forming. */
export function grievances(r: ResidentState, now = 0): Array<{ aspect: string; weight: number; settled: boolean; last: number }> {
  const out: Array<{ aspect: string; weight: number; settled: boolean; last: number }> = [];
  // Audit 2026-10-10: telling you about it again is not something new you did.
  const lastOf = (sources: Array<{ tick: number; kind?: string }>) => sources.filter((x) => x.kind !== 'recalled').reduce((m, x) => Math.max(m, x.tick), -1);
  for (const b of Object.values(r.beliefs)) if (b.subject === STEWARD && b.valence < -0.1 && !recentlyForgiven(r, b.aspect, now)) out.push({ aspect: b.aspect, weight: b.strength * -b.valence, settled: true, last: Math.max(b.reinforcedTick, lastOf(b.sources)) });
  for (const t of Object.values(r.traces)) if (t.subject === STEWARD && t.evidence < -0.1 && !recentlyForgiven(r, t.aspect, now)) out.push({ aspect: t.aspect, weight: -t.evidence * 0.5, settled: false, last: lastOf(t.sources) });
  // Something that happened in the last three days comes first: a sorry is for what is fresh.
  const fresh = (g: { last: number }) => (now - g.last < 3 * TICKS_PER_DAY ? 1 : 0);
  return out.sort((a, b) => fresh(b) - fresh(a) || b.weight - a.weight);
}

/** The latest note behind a grievance about the steward: what they would say it was. */
function grievanceNote(r: ResidentState, aspect: string): string {
  const k = beliefKey(STEWARD, aspect);
  // Audit 2026-10-10: not the note of telling you about it ("I'm sorry I told the steward about it").
  const sources = [...(r.beliefs[k]?.sources ?? []), ...(r.traces[k]?.sources ?? [])].filter((x) => x.kind !== 'recalled').sort((a, b) => b.tick - a.tick);
  return sources[0]?.note ?? '';
}

/** Bar round 8: what they would say you took, even before it has settled into a grievance (still in the day's memories). */
function lossNote(r: ResidentState): string {
  const fresh = [...r.buffer, ...r.episodes].filter((e) => e.subject === STEWARD && e.aspect === 'destroyed_place').sort((a, b) => b.tick - a.tick)[0];
  return grievanceNote(r, 'destroyed_place') || fresh?.note || '';
}

const DARK_BANDS = new Set(['low', 'bad', 'dislike', 'hate']);

/**
 * The grievance an answer carries, if any (bar round 2): a bad memory about the steward it brought
 * up, the reason given for thinking ill of the steward, or a let-down voiced in "how" or "mind".
 * A sorry or an explanation is offered only for that, so it answers the sentence before it.
 */
export function carriedGrievance(r: ResidentState, answer: TalkAnswer, now = 0): { aspect: string; note: string } | null {
  // Audit 2026-10-10: nothing they forgave you for in the last week, however it comes up (a recalled
  // memory every three days re-offered the same sorry, and each one was forgiven again).
  if (answer.memory && answer.memory.subject === STEWARD && answer.memory.valence < 0 && !recentlyForgiven(r, answer.memory.aspect, now)) return { aspect: answer.memory.aspect, note: answer.memory.note };
  if (answer.but && !recentlyForgiven(r, answer.but.aspect, now)) return answer.but;
  const fresh = answer.topics?.find((t) => t.key === 'steward:fresh');
  if (fresh && !recentlyForgiven(r, fresh.vars.aspect ?? '', now)) return { aspect: fresh.vars.aspect ?? '', note: fresh.vars.x ?? '' };
  if (answer.question === 'me' && DARK_BANDS.has(answer.band ?? '') && answer.because && answer.because.subject === STEWARD && !recentlyForgiven(r, answer.because.aspect, now)) {
    return { aspect: answer.because.aspect, note: grievanceNote(r, answer.because.aspect) };
  }
  // Bar round 8: grief for a place you took away is something to say sorry for ("what's on your mind" about the jetty offered none).
  const mourns = answer.topics?.some((t) => (t.about?.startsWith('b:') ?? false) && (t.key === 'feel:grief' || t.key === 'feel:sadness' || t.vars.aspect === 'lost_place'));
  if (mourns && !recentlyForgiven(r, 'destroyed_place', now)) {
    const note = lossNote(r);
    if (note) return { aspect: 'destroyed_place', note };
  }
  const letDown = answer.topics?.some((t) => t.key === 'leaving' || t.key === 'steward:-' || (t.about === STEWARD && /^feel:(annoyance|grief|worry)/.test(t.key)));
  if (letDown) {
    const g = grievances(r, now)[0];
    if (g) return { aspect: g.aspect, note: grievanceNote(r, g.aspect) };
  }
  return null;
}

/** The replies open after this answer. Agree is always open; the rest only when the answer itself gives something to answer. */
/** What kind of thing an answer said, and about what (bar round 3). */
export function answerTone(answer: TalkAnswer): { tone: ReplyTone; subject?: string; well?: boolean; rest?: boolean } {
  const top = answer.topics?.[0];
  // An answer that says something against you is a complaint whatever else it says (bar round 4:
  // "Thank you. That means something." was offered under "you kept me waiting 7 days").
  const aggrieved = !!answer.but || (answer.memory?.subject === STEWARD && answer.memory.valence < 0) || !!answer.topics?.some((t) => t.key === 'leaving' || t.key === 'steward:fresh' || t.key === 'steward:-' || (t.about === STEWARD && /^feel:(annoyance|grief|worry)/.test(t.key)));
  // Bar round 7: a neutral view of you is neither praise nor complaint ("I don't know you well enough yet" was offered "Thank you").
  if (answer.question === 'me') return { tone: DARK_BANDS.has(answer.band ?? '') || aggrieved ? 'complaint' : answer.band === 'neutral' || answer.band === 'cool' ? 'view' : 'praise', subject: STEWARD };
  if (answer.question === 'opinion') return { tone: 'view', ...(answer.about ? { subject: answer.about } : {}) };
  if (answer.question === 'how') return { tone: 'mood', well: answer.band === 'good' || answer.band === 'great' };
  if (answer.question === 'hope') return { tone: 'hope', ...(!answer.hope || answer.hope.done || !answer.hope.next ? { rest: true } : {}) };
  if (top?.about === STEWARD) return { tone: !aggrieved && (top.key === 'steward:+' || top.key === 'feel:gratitude') ? 'praise' : 'complaint', subject: STEWARD };
  if (aggrieved) return { tone: 'complaint', subject: STEWARD };
  const subject = top?.about ?? (answer.memory?.subject && answer.memory.subject !== STEWARD ? answer.memory.subject : undefined);
  return { tone: 'view', ...(subject ? { subject } : {}) };
}

export function offersFor(r: ResidentState, answer: TalkAnswer, now = 0): ReplyOffer[] {
  const t = answerTone(answer);
  const named = { tone: t.tone, ...(t.subject ? { about: t.subject } : {}), ...(t.well !== undefined ? { well: t.well } : {}), ...(t.rest ? { rest: true } : {}) };
  const offers: ReplyOffer[] = [{ kind: 'agree', ...named }];
  // Anything that says something can be disagreed with (bar round 3: 43 of 95 answers offered only "That's fair").
  // A hope can be doubted too (bar round 4: every hope answer offered only "That's fair").
  const saysSomething = (answer.band !== undefined && answer.band !== 'neutral') || (answer.topics?.length ?? 0) > 0 || !!answer.memory || answer.question === 'hope';
  if (saysSomething) offers.push({ kind: 'disagree', ...named });
  let g = carriedGrievance(r, answer, now);
  // Bar round 8: the day after a loss you caused, anything they say can be answered with a sorry for it.
  if (!g && r.hurtAt !== undefined && now - r.hurtAt < HURT_SORRY && now >= r.hurtAt) g = { aspect: 'destroyed_place', note: lossNote(r) };
  if (g) {
    offers.push({ kind: 'sorry', aspect: g.aspect, about: g.note });
    if (explainable(g.aspect, g.note)) offers.push({ kind: 'explain', aspect: g.aspect, about: g.note });
  }
  return offers;
}

/** A grievance note in the steward's mouth: "kept me waiting" becomes "I kept you waiting". */
export function ownNote(note: string): string {
  const swapped = note
    .replace(/\bmy\b/g, 'your')
    .replace(/\bme\b/g, 'you')
    .replace(/\bmyself\b/g, 'yourself');
  return /^(nothing|our|the|a|an|everyone|nobody)\b/i.test(swapped) ? swapped : `I ${swapped}`;
}

export interface ReplyResult {
  stance: ReplyStance;
  aspect?: string;
}

/** Audit 2026-10-10: replies to one resident that move trust or liking in a day. */
export const REPLY_MOVES_PER_DAY = 3;

/** The most talk alone can add to someone's liking of you in seven days (bar round 5: everyone adored the steward). */
export const TALK_WARMTH_WEEK = 0.06;

/**
 * Warmth from talk, capped over a rolling week (bar round 5): agreeing, encouraging and being seen
 * are pleasant, but standing is earned by deeds, not by how often you chat.
 */
export function talkWarmth(r: ResidentState, amount: number, tick: number): void {
  const log = (r.talkWarmth ?? []).filter(([t]) => tick - t < 7 * TICKS_PER_DAY);
  const used = log.reduce((s, [, a]) => s + a, 0);
  const give = Math.max(0, Math.min(amount, TALK_WARMTH_WEEK - used));
  if (give > 0) {
    adjust(r, STEWARD, { affinity: give }, tick);
    log.push([tick, give]);
  }
  r.talkWarmth = log;
}

/** Weaken a grievance about the steward: the belief if settled, the trace if still forming. */
function soften(r: ResidentState, aspect: string, keep: number): void {
  const k = beliefKey(STEWARD, aspect);
  const b = r.beliefs[k];
  if (b) b.strength *= keep;
  const t = r.traces[k];
  if (t) {
    t.evidence *= keep;
    t.sumI *= keep;
  }
}

/**
 * Apply a reply. `perceive` records what they make of it, in their own memory, so it can be
 * retold. Returns how it landed, or null when the reply wasn't open to them.
 */
export function applyReply(
  state: SimState,
  r: ResidentState,
  kind: ReplyKind,
  offers: ReplyOffer[],
  perceive: (p: { aspect: string; valence: number; base: number; note: string }) => void,
): ReplyResult | null {
  const offer = offers.find((o) => o.kind === kind);
  if (!offer) return null;
  const def = residentDef(r.id);
  const steady = def.traits.steady > 0 || def.voice.register === 'formal' || def.voice.register === 'plain';
  const tick = state.tick;
  // Audit 2026-10-10: only the first few replies in a day move how they see you; after that they
  // still answer, but asking and pushing back twenty times in a row no longer drove trust to 1.
  const recent = (r.replyMoves ?? []).filter((t) => tick - t < TICKS_PER_DAY);
  const counts = recent.length < REPLY_MOVES_PER_DAY;
  if (counts) recent.push(tick);
  r.replyMoves = recent;
  const move = (d: { affinity?: number; trust?: number; familiarity?: number }, t: number) =>
    adjust(r, STEWARD, counts ? d : { ...(d.familiarity !== undefined ? { familiarity: d.familiarity } : {}) }, t);
  switch (kind) {
    case 'agree':
      // Encouraging a hope (bar round 4).
      // Bar round 5: talk builds familiarity; what it adds to liking is capped weekly, and only
      // owning a complaint is remembered as something you did.
      if (offer.tone === 'hope') {
        move({ familiarity: 0.03 }, tick);
        talkWarmth(r, 0.02, tick);
        return { stance: 'encouraged' };
      }
      // Owning a complaint is worth more than agreeing with praise (bar round 3).
      if (offer.tone === 'complaint') {
        move({ familiarity: 0.03, trust: 0.04 }, tick);
        talkWarmth(r, 0.02, tick);
        perceive({ aspect: 'heard_me_out', valence: 0.5, base: 0.25, note: 'owned up to it' });
        return { stance: 'owned' };
      }
      move({ familiarity: 0.03 }, tick);
      talkWarmth(r, 0.02, tick);
      return { stance: offer.tone === 'praise' ? 'warm' : 'with_you' };
    case 'disagree':
      // Brushing off praise is modesty, not a slight; doubting "I'm fine" is being seen.
      if (offer.tone === 'praise') {
        move({ familiarity: 0.03 }, tick);
        talkWarmth(r, 0.01, tick);
        return { stance: 'insist' };
      }
      // Bar round 5: doubting a pause between dreams is a nudge, with its own answers.
      if (offer.tone === 'hope' && offer.rest) {
        move({ familiarity: 0.03 }, tick);
        return { stance: 'nudged' };
      }
      if (offer.tone === 'hope') {
        // Doubting a dream: the steady take it as care and think again; the touchy bristle.
        if (steady) {
          move({ familiarity: 0.04, trust: 0.02 }, tick);
          return { stance: 'mulled' };
        }
        move({ familiarity: 0.03, affinity: -0.02 }, tick);
        return { stance: 'bristled' };
      }
      if (offer.tone === 'mood') {
        move({ familiarity: 0.04 }, tick);
        // Bar round 7: to someone who says they are well, the challenge is "What's been the best of
        // it?", and they tell you ("You don't seem it" was denied 18 of 18 and led nowhere).
        if (offer.well) {
          talkWarmth(r, 0.01, tick);
          return { stance: 'best_of' };
        }
        talkWarmth(r, 0.01, tick);
        return { stance: 'seen' };
      }
      if (offer.tone === 'view') {
        move(steady ? { trust: 0.03, familiarity: 0.03 } : { affinity: -0.02, familiarity: 0.03 }, tick);
        return { stance: 'differ' };
      }
      if (steady) {
        move({ trust: 0.05, familiarity: 0.03 }, tick);
        perceive({ aspect: 'spoke_plainly', valence: 0.3, base: 0.3, note: 'spoke plainly to me' });
        return { stance: 'respect' };
      }
      move({ affinity: -0.05, familiarity: 0.02 }, tick);
      perceive({ aspect: 'argued_with_me', valence: -0.4, base: 0.35, note: 'argued with me' });
      return { stance: 'sulk' };
    case 'sorry': {
      const aspect = offer.aspect as string;
      const last = r.sorryFor?.[aspect];
      if (last !== undefined && tick - last < SORRY_GAP) return { stance: 'enough', aspect };
      // Bar round 5: someone who thinks ill of you hears a sorry for something old as words, not
      // amends ("You have lost my good opinion entirely" then "let us put it behind us").
      // Bar round 7: and below -0.5 that holds whatever the grievance's age (Juniper at -0.60,
      // "has lost faith in you", took a sorry with "I will try to let it go").
      if ((r.rel[STEWARD]?.affinity ?? 0) < -0.5) {
        (r.sorryFor ??= {})[aspect] = tick;
        move({ familiarity: 0.02 }, tick);
        return { stance: 'cheap', aspect };
      }
      // Bar round 7: too soon after taking away what was theirs ("Not yet. You took my jetty.").
      // Bar round 8: any sorry, for whatever it is, while that loss is fresh.
      if (r.hurtAt !== undefined && tick - r.hurtAt < TOO_SOON && tick >= r.hurtAt) {
        move({ familiarity: 0.02 }, tick);
        return { stance: 'too_soon', aspect };
      }
      // Bar round 8: below zero, a sorry is heard but not yet believed ("we'll see").
      if ((r.rel[STEWARD]?.affinity ?? 0) < 0) {
        (r.sorryFor ??= {})[aspect] = tick;
        // The air clears a little (what is fresh eases), but they wait to see what you do.
        for (const g of grievances(r, tick)) soften(r, g.aspect, tick - g.last < 3 * TICKS_PER_DAY ? 0.8 : 0.92);
        move({ affinity: WE_LL_SEE_GAIN, familiarity: 0.02 }, tick);
        r.sorryOnTrial = { aspect, tick };
        return { stance: 'we_ll_see', aspect };
      }
      (r.sorryFor ??= {})[aspect] = tick;
      // An apology clears the air: everything fresh softens most, older grievances a little.
      for (const g of grievances(r, tick)) soften(r, g.aspect, tick - g.last < 3 * TICKS_PER_DAY ? 0.6 : 0.85);
      move({ affinity: 0.06, trust: 0.03 }, tick);
      perceive({ aspect: 'made_amends', valence: 0.6, base: 0.5, note: 'said sorry' });
      (r.forgiven ??= {})[aspect] = tick;
      return { stance: 'forgiven', aspect };
    }
    case 'explain': {
      const aspect = offer.aspect as string;
      const trusts = (r.rel[STEWARD]?.trust ?? 0) > 0.4;
      if (!trusts) {
        perceive({ aspect: 'excuses', valence: -0.2, base: 0.2, note: 'made excuses to me' });
        return { stance: 'unconvinced', aspect };
      }
      soften(r, aspect, 0.5);
      move({ trust: 0.02 }, tick);
      perceive({ aspect: 'explained', valence: 0.3, base: 0.3, note: 'explained the decision to me' });
      return { stance: 'convinced', aspect };
    }
  }
}

/** Bar round 8: how long a "we'll see" waits for you to show it. */
export const SHOW_IT_WITHIN = 7 * TICKS_PER_DAY;

/**
 * A sorry heard as "we'll see", followed within a week by doing what they asked: now it counts,
 * as a sorry to someone who thought well of you would have. True if it did.
 */
export function showAmends(r: ResidentState, tick: number, perceive: (p: { aspect: string; valence: number; base: number; note: string }) => void): boolean {
  const trial = r.sorryOnTrial;
  if (!trial || tick - trial.tick > SHOW_IT_WITHIN || tick < trial.tick) return false;
  delete r.sorryOnTrial;
  for (const g of grievances(r, tick)) soften(r, g.aspect, tick - g.last < 3 * TICKS_PER_DAY ? 0.6 : 0.85);
  adjust(r, STEWARD, { affinity: 0.06, trust: 0.03 }, tick);
  perceive({ aspect: 'made_amends', valence: 0.6, base: 0.5, note: 'said sorry, and showed it' });
  (r.forgiven ??= {})[trial.aspect] = tick;
  return true;
}

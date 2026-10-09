// The M1 "radio play": turns the sim's event stream into readable text. Overnight news is
// gathered into a notice board read out at dawn (spec section 3); notable moments during the
// day are narrated live. The narrator has its own random stream, so narrating never changes
// the simulation.

import { buildingDef, singularName } from '../content/buildings.js';
import { residentDef } from '../content/residents.js';
import { ASPIRATION_LINES, DILEMMA_NAMES, DREAM_DONE_LINES, GATHERING_START, PREPOSITIONS, PROPOSALS } from '../content/story.js';
import { MIND_LINES, TO_STEWARD_LINES } from '../content/thoughts.js';
import { DAY_WORDS, RECALL_LINES } from '../content/recall.js';
import { FESTIVALS } from '../sim/story/director.js';
import { REPLY_LINES, replySaid } from '../content/replies.js';
import { FAVOUR_DONE, FAVOUR_NO, FAVOUR_YES, TALK_HOPE,
  TALK_HOPE_ONE, TALK_HOPE_DONE, TALK_HOW, TALK_ME, TALK_OPINION, TALK_OPINION_PERSON, TALK_REASON, TALK_BUT } from '../content/talk.js';
import { firstPerson } from '../sim/mind/thoughts.js';
import { opinion } from '../sim/mind/memory.js';
import { ASKS, BELIEF_STATEMENTS, REACTIONS, SPEECH, THOUGHTS, type Lines } from '../content/voice.js';
import { chance, deriveSeed, pick, type RngHolder } from '../sim/rng.js';
import { subjectWords } from '../sim/story/aspirations.js';
import { factSaid, factValue, goalLabel, nextFact, TIER_GIFT } from '../sim/progress.js';
import type { Simulation } from '../sim/sim.js';
import { DAWN_MINUTE, DAYS_PER_SEASON, clock, dayOf, minuteOf, seasonOf } from '../sim/time.js';
import type { Belief, FavourKind, MindMention, Resource, ResidentDef, SimEvent, SimState, SubjectId, TalkAnswer } from '../sim/types.js';
import { distanceTo, sizeOf } from '../sim/world.js';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const STEWARD_ID = 'steward';
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const INDENT = '       ';

/** Capitalise the start of the text and of each sentence. */
function sentenceCase(s: string): string {
  return cap(s).replace(/([.?!] )([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase());
}

type Person = { subj: string; obj: string; poss: string };
/** "listens" to "listen", "misses" to "miss", "worries" to "worry": the verb to follow "you". */
function plainVerb(v: string): string {
  if (/ies$/i.test(v)) return v.slice(0, -3) + 'y';
  if (/(ss|sh|ch|x|zz|o)es$/i.test(v)) return v.slice(0, -2);
  return /ss$/i.test(v) ? v : v.slice(0, -1);
}

const FIRST_PERSON: Person = { subj: 'I', obj: 'me', poss: 'my' };

/** A reply answered with a look, when every line for it has been said lately (bar round 3). */
const GESTURES_WARM = ['smiles', 'nods slowly', 'looks pleased', 'gives you a warm look', 'pats your arm', 'laughs softly', 'nods, satisfied'];
const GESTURES_COOL = ['shrugs', 'frowns', 'looks away', 'sniffs', 'says nothing', 'folds {poss} arms', 'purses {poss} lips'];

/** Building names that are plural take a plural verb (bar round 3: "the garden plots is a lovely spot"). */
const PLURAL_NAMES = ['garden plots', 'beehives'];
const PLURAL_OF: Record<string, string> = { is: 'are', was: 'were', has: 'have', gets: 'get', keeps: 'keep', makes: 'make', does: 'do' };
const PLURAL_VERB = new RegExp(`\\b(${PLURAL_NAMES.join('|')}) (is|was|has|gets|keeps|makes|does)\\b`, 'gi');

/** Sentences in a reply, a verbal tic counting as part of the sentence it opens (bar round 3). */
export function sentenceCount(text: string, tics: readonly string[] = []): number {
  let t = text.replace(/[“”"]/g, '');
  for (const tic of tics) t = t.split(tic).join('');
  return t.split(/[.!?]+(?:\s+|$)/).filter((x) => /[a-z]/i.test(x)).length;
}

/**
 * A grievance note as a whole clause with its subject (bar round 3: "Though you nothing was
 * done"): "took away the old oak" is something the steward did; "nothing was done" and "our wish
 * … came to nothing" already say who.
 */
/** The words a topic is said with: a fresh wrong is a whole clause. */
function topicVars(m: Pick<MindMention, 'key' | 'vars'>): Record<string, string> {
  return m.key === 'steward:fresh' && m.vars.x ? { ...m.vars, x: deedClause(m.vars.x) } : m.vars;
}

export function deedClause(note: string): string {
  return /^(nothing|our|my|the|a|an|everyone|nobody|no one|it)\b/i.test(note) ? note : `the steward ${note}`;
}

export type EntryKind = 'day' | 'board' | 'live' | 'aside' | 'note' | 'thought';

/** How much a line matters to someone following along: the browser log filters and highlights by it. */
export type Importance = 'major' | 'normal' | 'minor';

/** Problems, decisions, people coming and going, dreams: major. Passing thoughts and small talk: minor. */
export function importanceOf(e: SimEvent): Importance {
  switch (e.type) {
    case 'request_posted':
    case 'dilemma_posted':
    case 'dilemma_closed':
    case 'thinking_of_leaving':
    case 'gave_up':
    case 'decided_to_stay':
    case 'left_town':
    case 'disturbed_sleep':
    case 'shortage':
    case 'forage':
    case 'dream_let_go':
    case 'aspiration':
    case 'plot_cleared':
    case 'arrived':
    case 'stores':
    case 'tier':
      return 'major';
    case 'goal':
      return e.phase === 'new' ? 'normal' : 'normal';
    case 'fact':
    case 'renown':
      return 'minor';
    case 'request_closed':
      return e.request.status === 'lapsed' ? 'major' : 'normal';
    case 'wish':
      return e.phase === 'made' ? 'normal' : 'major';
    case 'relationship':
      return e.added.includes('rival') || e.removed.includes('friend') ? 'major' : 'normal';
    case 'exchange':
      return e.kind === 'argue' || e.kind === 'apologize' ? 'major' : e.kind === 'comfort' ? 'normal' : 'minor';
    case 'story':
      return e.id === 'reconcile' || e.id === 'sick_alone' ? 'major' : 'normal';
    case 'thought':
    case 'recall':
    case 'invite':
    case 'belief_faded':
    case 'took_job':
      return 'minor';
    default:
      return 'normal';
  }
}

/** One narrated line, with who it mentions, for UIs that want more than plain text. */
export interface NarratorEntry {
  t: number;
  kind: EntryKind;
  text: string;
  /** Residents named in the text. */
  who: string[];
  importance: Importance;
}

const MAX_ENTRIES = 3000;

export interface NarratorOptions {
  /** Narrate every exchange instead of the notable ones. */
  verbose?: boolean;
  /** Most live exchange lines per day before the rest are only counted. */
  exchangeLinesPerDay?: number;
  /** Narrate the steward's own actions as "you" (the browser, where the player is the steward). */
  stewardIsYou?: boolean;
  /** Most passing thoughts narrated per day, town-wide. */
  thoughtsPerDay?: number;
}

/** Most passing thoughts narrated per resident per day. */
const THOUGHTS_PER_RESIDENT = 3;

export class Narrator {
  readonly lines: string[] = [];
  readonly entries: NarratorEntry[] = [];
  private entryListeners: Array<(e: NarratorEntry) => void> = [];
  /** Notice-board items, rendered at dawn so they read right as of the morning. */
  private board: Array<{ text: () => string; importance: Importance }> = [];
  private digest: Array<() => string> = [];
  /** Importance of the event being narrated now. */
  private importance: Importance = 'normal';
  private rng: RngHolder;
  private exchangesToday = 0;
  private gossipToday = 0;
  private exchangeLinesToday = 0;
  private thoughtsToday = new Map<string, number>();
  /** `${who}|${subject}` -> day last narrated, so daily haunts don't repeat every morning. */
  private lastRecall = new Map<string, number>();
  private toldPairs = new Set<string>();
  private reactedAt = new Set<string>();
  /** When each line was last said, by whom and by anyone (M4: no line on repeat). */
  private saidBy = new Map<string, number>();
  private saidAny = new Map<string, number>();
  /** The last reaction to each building, so a crowd looking it over is one line, not nine. */
  private lastReaction = new Map<string, number>();
  /** When each resident last remarked on the steward, in thought or chat. */
  private stewardTalk = new Map<string, number>();
  /** `${kind}|${a}|${b}` -> day last narrated, for exchanges that would otherwise repeat. */
  private lastPair = new Map<string, number>();
  private readonly opts: Required<NarratorOptions>;

  constructor(
    private readonly sim: Simulation,
    opts: NarratorOptions = {},
  ) {
    this.rng = { rng: deriveSeed(sim.state.seed, 'narrator') };
    this.opts = { verbose: false, exchangeLinesPerDay: 10, stewardIsYou: false, thoughtsPerDay: 10, ...opts };
    sim.on((e) => this.handle(e));
  }

  private get state(): SimState {
    return this.sim.state;
  }

  private out(line: string): void {
    this.lines.push(line);
  }

  onEntry(listener: (e: NarratorEntry) => void): void {
    this.entryListeners.push(listener);
  }

  private pushBoard(text: () => string): void {
    this.board.push({ text, importance: this.importance });
  }

  /** Small changes of heart, folded into one "Around town" line at dawn (review: 67% of the board was bookkeeping). */
  private pushDigest(text: () => string): void {
    this.digest.push(text);
  }

  private entry(kind: EntryKind, t: number, text: string): void {
    const importance = kind === 'day' || kind === 'note' ? 'normal' : kind === 'thought' ? 'minor' : this.importance;
    // The same sentence twice in a week is skipped unless it matters (bar round 3: "Goal done:
    // ask someone a favour" fourteen times in a month). The day headers are not sentences.
    if (kind !== 'day' && importance !== 'major') {
      const last = this.lastSaidLine.get(text);
      if (last !== undefined && t - last < 7 * 1440) return;
      this.lastSaidLine.set(text, t);
    }
    const who = this.state.order.filter((id) => new RegExp(`\\b${this.name(id)}\\b`).test(text));
    const e: NarratorEntry = { t, kind, text, who, importance };
    this.entries.push(e);
    if (this.entries.length > MAX_ENTRIES) this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    for (const l of this.entryListeners) l(e);
  }

  private aside(t: number, text: string): void {
    this.out(`${INDENT}${text}`);
    this.entry('aside', t, text);
  }

  /** The log runs dawn to dawn; small hours are marked so they don't read as the evening before. */
  private live(t: number, text: string): void {
    const night = minuteOf(t) < DAWN_MINUTE && dayOf(t) > 1;
    this.out(`${clock(t)}${night ? '*' : ' '} ${text}`);
    this.entry('live', t, text);
  }

  // ---------------------------------------------------------------- naming

  name(id: string): string {
    return residentDef(id).name;
  }

  subjectName(subject: SubjectId): string {
    if (subject === 'steward') return 'the steward';
    if (subject.startsWith('r:')) return this.name(subject.slice(2));
    if (subject.startsWith('m:')) {
      const m = this.state.story.memories.find((x) => x.id === Number(subject.slice(2)));
      return m ? m.label : 'that day';
    }
    const id = Number(subject.slice(2));
    const b = this.state.buildings.find((x) => x.id === id);
    if (!b) return 'somewhere';
    const def = buildingDef(b.type);
    if (def.kind === 'home') {
      const owners = this.state.order.filter((r) => this.state.residents[r]?.homeId === id).map((r) => this.name(r));
      if (owners.length > 0) return `${owners.join(' and ')}'s ${def.name.toLowerCase()}`;
    }
    return `the ${def.name.toLowerCase()}`;
  }

  /** "on the commons", "at the teahouse", "under the old oak". */
  at(buildingId: number): string {
    const b = this.state.buildings.find((x) => x.id === buildingId);
    return `${PREPOSITIONS[b?.type ?? ''] ?? 'at'} ${this.subjectName(`b:${buildingId}`)}`;
  }

  private where(buildingId: number): string {
    const b = this.state.buildings.find((x) => x.id === buildingId);
    if (!b) return '';
    let best: { d: number; name: string } | null = null;
    for (const id of this.state.order) {
      const r = this.state.residents[id];
      if (!r) continue;
      const home = this.state.buildings.find((x) => x.id === r.homeId);
      if (!home) continue;
      const [hw, hh] = sizeOf(home);
      let d = Infinity;
      for (let dx = 0; dx < hw; dx++) for (let dy = 0; dy < hh; dy++) d = Math.min(d, distanceTo(b, home.x + dx, home.y + dy));
      if (!best || d < best.d) best = { d, name: this.subjectName(`b:${home.id}`) };
    }
    if (!best) return '';
    if (best.d <= 2) return ` right beside ${best.name}`;
    if (best.d <= 5) return ` near ${best.name}`;
    return ' out on the edge of town';
  }

  private fill(template: string, person: Person, vars: Record<string, string>): string {
    return template
      .replace(/\{S\}/g, cap(vars.s ?? ''))
      .replace(/\{s\}/g, vars.s ?? '')
      .replace(/\{other\}/g, vars.other ?? '')
      .replace(/\{statement\}/g, vars.statement ?? '')
      .replace(/\{what\}/g, vars.what ?? '')
      .replace(/\{X\}/g, cap(vars.x ?? ''))
      .replace(/\{x\}/g, vars.x ?? '')
      .replace(/\{next\}/g, vars.next ?? '')
      .replace(/\{title\}/g, vars.title ?? '')
      .replace(/\{label\}/g, vars.label ?? '')
      .replace(/\{clause\}/g, vars.clause ?? '')
      .replace(/\{when\}/g, vars.when ?? '')
      .replace(/\{subj\}/g, person.subj)
      .replace(/\{obj\}/g, person.obj)
      .replace(/\{poss\}/g, person.poss)
      .replace(PLURAL_VERB, (_m: string, name: string, verb: string) => `${name} ${PLURAL_OF[verb.toLowerCase()] ?? verb}`);
  }

  private keepsCapital(text: string): boolean {
    if (/^I\b/.test(text)) return true;
    if (this.state.order.some((id) => text.startsWith(this.name(id)))) return true;
    // Festival and gathering names keep their capitals ("blossom Day", bar round 1).
    const labels = [...Object.values(FESTIVALS), ...this.state.story.gatherings.map((g) => g.label), ...this.state.story.memories.map((m) => m.label)];
    return labels.some((l) => /^[A-Z]/.test(l) && text.startsWith(l));
  }

  /** A line in a resident's own voice, with an occasional verbal tic, in quotes. */
  voice(who: string, lines: Lines | undefined, vars: Record<string, string> = {}, mineGapDays = 3): string {
    return `"${this.utter(who, lines, vars, mineGapDays)}"`;
  }

  /** One of several ways of telling the same thing, the one this resident's story used longest ago. */
  private freshLine(who: string, ways: string[]): string {
    const t = this.state.tick;
    const line = [...ways].sort((a, b) => (this.saidBy.get(`${who}|${a}`) ?? -Infinity) - (this.saidBy.get(`${who}|${b}`) ?? -Infinity))[0] as string;
    this.saidBy.set(`${who}|${line}`, t);
    return line;
  }

  /** The words of a line in a resident's voice, without quotes, so lines can be joined. */
  utter(who: string, lines: Lines | undefined, vars: Record<string, string> = {}, mineGapDays = 3): string {
    const def = residentDef(who);
    const options = lines?.[def.voice.register] ?? lines?.plain ?? ['...'];
    let text = sentenceCase(fixArticles(this.fill(this.freshest(who, options, mineGapDays), FIRST_PERSON, vars)));
    // No tic on a line that already opens with an interjection, a name or a tic of its own
    // ("Honestly, you know, ..." read as a stammer).
    const opensLoud = /^(Oh|Ha|Ooh|Hey|Listen|Kaboom|What)\b/.test(text) || (this.keepsCapital(text) && !/^I\b/.test(text)) || /^[A-Z][a-z']*( [a-z']+)?,/.test(text);
    const today = dayOf(this.state.tick);
    const tics = opensLoud ? [] : def.voice.tics.filter((t) => !text.toLowerCase().includes(t.toLowerCase()) && this.ticUsed.get(`${who}|${t}`) !== today);
    if (tics.length > 0 && chance(this.rng, 0.25)) {
      const tic = pick(this.rng, tics);
      // Once a day each (bar round 1: "Honestly?" opened 15 answers).
      this.ticUsed.set(`${who}|${tic}`, today);
      if (/[.!?]$/.test(tic)) text = `${tic} ${text}`;
      else text = `${cap(tic)}, ${this.keepsCapital(text) ? text : text.charAt(0).toLowerCase() + text.slice(1)}`;
    }
    return text;
  }

  /**
   * Pick a line this resident hasn't said in three days and nobody has said today, if there is
   * one; otherwise the one said longest ago (review: the same line 29 times in 21 days).
   */
  /**
   * Each resident gets one remark that mentions the steward every two days, in thought or chat (review: "the
   * steward listens" in a quarter of everything said). True if this one may be said.
   */
  private stewardOnce(who: string, t: number, said: string): boolean {
    if (this.opts.verbose || !/\bsteward\b/i.test(said)) return true;
    const last = this.stewardTalk.get(who);
    if (last !== undefined && t - last < 2 * 1440) return false;
    this.stewardTalk.set(who, t);
    return true;
  }

  private allStale(who: string, lines: Lines | undefined): boolean {
    const options = lines?.[residentDef(who).voice.register] ?? lines?.plain ?? [];
    const t = this.state.tick;
    return options.length > 0 && options.every((o) => t - (this.saidBy.get(`${who}|${o}`) ?? -Infinity) < 3 * 1440 || t - (this.saidAny.get(o) ?? -Infinity) < 720);
  }

  private freshest(who: string, options: string[], mineGapDays = 3): string {
    const t = this.state.tick;
    const mine = (o: string) => this.saidBy.get(`${who}|${o}`) ?? -Infinity;
    const any = (o: string) => this.saidAny.get(o) ?? -Infinity;
    // Nobody repeats a line they said lately, and nobody says a line anyone in town said in the
    // last eight days (bar round 2: one chatty line twelve times in a month).
    const fresh = options.filter((o) => t - mine(o) >= mineGapDays * 1440 && t - any(o) >= 8 * 1440);
    const line = fresh.length ? pick(this.rng, fresh) : [...options].sort((a, b) => Math.max(mine(a), any(a)) - Math.max(mine(b), any(b)))[0] ?? '...';
    this.saidBy.set(`${who}|${line}`, t);
    this.saidAny.set(line, t);
    return line;
  }

  /** A belief as a third-person clause about its holder: "the bakery keeps her up at night". */
  statement(who: string, b: Pick<Belief, 'subject' | 'aspect'>): string {
    const template = BELIEF_STATEMENTS[b.aspect] ?? `{s} matters (${b.aspect})`;
    return this.tense(b, this.fill(template, residentDef(who).pronouns, { s: this.subjectName(b.subject) }));
  }

  /** Feelings about a place that is gone are spoken of in the past tense. */
  private tense(b: Pick<Belief, 'subject' | 'aspect'>, text: string): string {
    if (b.aspect === 'lost_place' || !b.subject.startsWith('b:')) return text;
    const gone = this.state.buildings.find((x) => x.id === Number(b.subject.slice(2)))?.removed;
    return gone ? text.replace(/ is /, ' was ').replace(/ keeps /, ' kept ').replace(/ makes /, ' made ').replace(/ gets /, ' got ') : text;
  }

  /**
   * A belief as its holder would say it: first person if they lived it, "I hear..." with the
   * original teller's name if it is hearsay.
   */
  spoken(who: string, b: Pick<Belief, 'subject' | 'aspect'>): string {
    const template = BELIEF_STATEMENTS[b.aspect] ?? `{s} matters (${b.aspect})`;
    const held = this.state.residents[who]?.beliefs[`${b.subject}|${b.aspect}`];
    const teller = held && held.sources.every((s) => s.kind === 'told') ? held.sources.find((s) => s.from)?.from : undefined;
    if (teller) {
      const name = this.name(teller);
      return `I hear ${this.tense(b, this.fill(template, { subj: name, obj: name, poss: `${name}'s` }, { s: this.subjectName(b.subject) }))}`;
    }
    return this.tense(b, this.fill(template, FIRST_PERSON, { s: this.subjectName(b.subject) }));
  }

  private thought(who: string, subject: SubjectId, aspect: string, valence: number): string | null {
    const lines = THOUGHTS[`${aspect}${valence >= 0 ? '+' : '-'}`];
    if (!lines) return null;
    return this.voice(who, lines, { s: this.subjectName(subject) });
  }

  // ---------------------------------------------------------------- events

  private handle(e: SimEvent): void {
    this.importance = importanceOf(e);
    switch (e.type) {
      case 'dawn':
        this.dawn(e.day, e.t);
        break;
      case 'built':
        // Laying a path is many little builds; the town log doesn't list each tile.
        if (e.btype === 'path') break;
        this.live(e.t, `${this.you ? 'You build' : 'The steward builds'} ${aOrAn(singularName(e.btype))}${this.where(e.building)}.`);
        break;
      case 'removed':
        if (e.btype === 'path') break;
        this.live(e.t, `${this.you ? 'You have' : 'The steward has'} ${this.subjectName(`b:${e.building}`)} taken down.`);
        break;
      case 'took_job':
        if (e.t > 0) {
          this.live(e.t, `${this.name(e.who)} takes up work at ${this.subjectName(`b:${e.building}`)}.`);
          const line = this.thought(e.who, `b:${e.building}`, 'my_workplace', 1);
          if (line) this.aside(e.t, `${this.name(e.who)}: ${line}`);
        }
        break;
      case 'disturbed_sleep':
        {
          // Several ways to tell a bad night, so a week of them does not read the same (bar round 3).
          const p = residentDef(e.who).pronouns;
          const they = p.subj === 'they';
          const place = this.subjectName(`b:${e.building}`);
          const name = this.name(e.who);
          const ways = [
            `Noise from ${place} wakes ${name}. ${cap(p.subj)} lie${they ? '' : 's'} awake till dawn.`,
            `${name} is up in the small hours again, kept awake by ${place}.`,
            `${cap(place)} clatters through the night, and ${name} hears every minute of it.`,
            `${name} gives up on sleep and sits by the window; ${place} is at it again.`,
            `Another broken night for ${name}, courtesy of ${place}.`,
          ];
          this.live(e.t, this.freshLine(e.who, ways));
        }
        break;
      case 'reaction': {
        const b = this.state.buildings.find((x) => x.id === e.building);
        const key = `${Math.floor(e.t / 30)}|${e.who}|${b?.type}|${e.change}`;
        if (this.reactedAt.has(key)) break;
        this.reactedAt.add(key);
        const s = this.subjectName(`b:${e.building}`);
        // Others looking over the same new building in the same hour nod along, quietly.
        const group = `${e.building}|${e.detail}|${e.valence >= 0}`;
        const prev = this.lastReaction.get(group);
        this.lastReaction.set(group, e.t);
        if (prev !== undefined && e.t - prev < 90) {
          this.aside(e.t, `${this.name(e.who)} ${e.valence >= 0 ? pick(this.rng, ['agrees', 'nods along', 'seems pleased too', 'likes it as well']) : pick(this.rng, ['is not keen either', 'frowns at it too', 'agrees, unhappily'])}.`);
          break;
        }
        const line = REACTIONS[e.detail] ? this.voice(e.who, REACTIONS[e.detail], { s }) : this.thought(e.who, `b:${e.building}`, e.aspect, e.valence);
        if (line) this.live(e.t, `${this.noticing(e.who, e.how, e.change, e.building)}: ${line}`);
        break;
      }
      case 'grief': {
        const line = this.thought(e.who, `b:${e.building}`, 'lost_place', -1);
        if (line) this.live(e.t, `${this.noticing(e.who, e.how, 'removed', e.building)}: ${line}`);
        break;
      }
      case 'shortage':
        this.live(e.t, `The larder is bare. ${this.name(e.who)} makes do with a thin supper. ${this.voice(e.who, SPEECH.thinSupper, {}, 8)}`);
        break;
      case 'forage':
        this.live(e.t, `${this.name(e.who)} goes ${this.at(e.placeId)} with a basket and comes back with ${e.food} food. ${this.voice(e.who, SPEECH.forage)}`);
        break;
      case 'dream_let_go':
        this.live(e.t, `${this.name(e.who)} stops waiting for ${/^[aeiou]/i.test(buildingDef(e.wants).name) ? 'an' : 'a'} ${buildingDef(e.wants).name.toLowerCase()}. ${this.voice(e.who, SPEECH.letGo)}`);
        break;
      case 'recall': {
        const key = `${e.who}|${e.subject}`;
        const last = this.lastRecall.get(key);
        if (last !== undefined && dayOf(e.t) - last < 4 && !this.opts.verbose) break;
        this.lastRecall.set(key, dayOf(e.t));
        const line = this.thought(e.who, e.subject, e.aspect, e.valence);
        if (line) this.live(e.t, `${this.name(e.who)}, at ${this.subjectName(e.cue)}, remembers: ${line}`);
        break;
      }
      case 'exchange':
        this.exchange(e);
        break;
      case 'thought':
        this.thinks(e);
        break;
      case 'belief_formed': {
        const from = e.hearsay ? e.belief.sources.find((s) => s.from)?.from : undefined;
        const n = e.belief.sources.filter((s) => s.kind === 'witnessed').length;
        const why = from ? ` (heard it from ${this.name(from)})` : n >= 5 ? ' (time and again)' : n >= 2 ? ' (more than once)' : '';
        this.pushDigest(() => `${this.name(e.who)} has decided ${this.statement(e.who, e.belief)}${why}`);
        break;
      }
      case 'belief_flipped':
        this.pushBoard(() => `${this.name(e.who)} has changed ${residentDef(e.who).pronouns.poss} mind: ${this.statement(e.who, e.belief)}${e.belief.valence >= 0 ? '' : ', after all'}.`);
        break;
      case 'belief_faded':
        this.pushDigest(() => `${this.name(e.who)} has stopped dwelling on how ${this.statement(e.who, e)}`);
        break;
      case 'request_posted':
        this.pushBoard(
          () =>
            `${this.name(e.request.by)} asks ${this.you ? 'you' : 'the steward'}: ${this.voice(e.request.by, ASKS[e.request.kind], { s: this.subjectName(e.request.subject), what: e.request.wants ? singularName(e.request.wants) : 'place' })}`,
        );
        break;
      case 'request_closed':
        if (e.request.status === 'resolved') break;
        this.pushBoard(
          () => `${this.name(e.request.by)}: ${this.voice(e.request.by, e.request.status === 'fulfilled' ? (e.request.kind === 'quieter_home' ? SPEECH.fulfilled : SPEECH.thanks) : SPEECH.lapsed, { s: this.subjectName(e.request.subject) })}`,
        );
        break;
      case 'wish':
        if (e.phase === 'made') this.pushBoard(() => `Town Wish for the season: ${e.wish.label}. (${this.names(e.wish.supporters)} would like this.)`);
        else if (e.phase === 'granted') this.announce(e.t, `Wish granted: ${e.wish.label.toLowerCase()}. The whole town feels it.`);
        else if (e.phase === 'dropped') this.pushBoard(() => `The wish for ${e.wish.label.toLowerCase()} leaves with ${this.names(e.wish.supporters)}.`);
        else this.pushBoard(() => `The season ended without ${e.wish.label.toLowerCase()}. ${this.names(e.wish.supporters)} had hoped for it.`);
        break;
      case 'standing': {
        const why = e.reasons[0] ?? '';
        const who = this.name(e.who);
        const towards = this.you ? 'you' : 'the steward';
        if (e.delta > 0) this.pushDigest(() => `${who} thinks better of ${towards} (${why})`);
        else this.pushBoard(() => `${who} thinks less of ${towards}: ${why}.`);
        break;
      }
      case 'relationship':
        for (const tag of e.added) {
          if (tag === 'friend') this.pushDigest(() => `${this.name(e.who)} now counts ${this.name(e.other)} as a friend`);
          if (tag === 'close_friend') this.pushBoard(() => `${this.name(e.who)} now counts ${this.name(e.other)} as a close friend.`);
          if (tag === 'rival') this.pushBoard(() => `${this.name(e.who)} is not getting on with ${this.name(e.other)}.`);
        }
        if (e.removed.includes('friend')) this.pushBoard(() => `${this.name(e.who)} and ${this.name(e.other)} have drifted apart.`);
        break;
      case 'thinking_of_leaving':
        this.pushBoard(() => `${this.name(e.who)} is thinking of leaving. ${this.voice(e.who, SPEECH.leaving)}`);
        break;
      case 'gave_up':
        this.pushBoard(() => `${this.name(e.who)} has stopped asking ${this.you ? 'you' : 'the steward'} for anything. ${this.voice(e.who, SPEECH.gaveUp)}`);
        break;
      case 'decided_to_stay':
        this.pushBoard(() => `${this.name(e.who)} has decided to stay. ${this.voice(e.who, SPEECH.staying)}`);
        break;
      case 'left_town':
        this.pushBoard(() => `${this.name(e.who)} has packed up and left the valley.`);
        break;
      case 'perceived':
      case 'town_memory':
        break;
      case 'gathering':
        this.gathering(e);
        break;
      case 'weather':
        if (e.kind === 'rain') this.pushBoard(() => 'Rain today. The paths will be muddy.');
        else this.live(e.t, 'Dark clouds pile up over the valley. A storm is coming.');
        break;
      case 'dilemma_posted':
        this.pushBoard(
          () =>
            `${this.name(e.dilemma.proposer)} proposes: ${this.voice(e.dilemma.proposer, PROPOSALS[e.dilemma.type])} (Approve or decline on the board.)`,
        );
        break;
      case 'dilemma_closed':
        this.dilemmaClosed(e);
        break;
      case 'story':
        this.story(e);
        break;
      case 'invite': {
        const key = `invite|${[e.a, e.b].sort().join('|')}`;
        const last = this.lastPair.get(key);
        if (last !== undefined && dayOf(e.t) - last < 2 && !this.opts.verbose) break;
        this.lastPair.set(key, dayOf(e.t));
        this.live(e.t, `${this.name(e.a)} calls round for ${this.name(e.b)}, and they walk ${this.at(e.place).replace(/^(on|at|under|by) /, 'to ')} together.`);
        break;
      }
      case 'talk':
        this.talked(e);
        break;
      case 'favour':
        this.favour(e);
        break;
      case 'production':
        this.production(e);
        break;
      case 'arrived': {
        const d = residentDef(e.who);
        this.live(e.t, `Someone new comes up the valley road: ${d.name}, ${d.age}. ${d.background} ${cap(d.pronouns.subj)} ${d.pronouns.subj === 'they' ? 'move' : 'moves'} into ${this.subjectName(`b:${e.home}`).replace(/^.*'s /, 'the ')}.`);
        break;
      }
      case 'tier': {
        const unlocks = e.unlocks.map((t) => buildingDef(t).name.toLowerCase());
        this.live(e.t, `The valley is a ${e.name} now! Word gets round, and the neighbouring towns send ${TIER_GIFT} timber.${unlocks.length ? ` New to build: ${unlocks.join(', ')}.` : ''} Up to ${e.cap} can make their home here.`);
        break;
      }
      case 'goal':
        if (e.phase === 'new' && e.goals?.length) this.pushBoard(() => `Today: ${e.goals!.map((g) => goalLabel(g).toLowerCase()).join('; ')}.`);
        else if (e.phase === 'done' && e.goal) this.aside(e.t, `Goal done: ${goalLabel(e.goal).toLowerCase()}.`);
        else if (e.phase === 'all') this.live(e.t, `All of today's goals done. The town notices.`);
        break;
      case 'fact':
        this.aside(e.t, `${e.first ? `${this.you ? "You've" : 'The steward has'} met ${this.name(e.who)}. ` : ''}${this.you ? 'You learn' : 'The steward learns'} something about ${this.name(e.who)}: ${lowerFirst(factValue(this.state, this.state.residents[e.who]!, e.key))}.`);
        break;
      case 'renown':
        break;
      case 'reply': {
        // A response is not given to you twice in a week by the same person, nor the same line
        // by anyone in town that week; when every line is used up, they answer with a look
        // instead of repeating themselves (bar round 3).
        const def = residentDef(e.who);
        const options = REPLY_LINES[e.stance]?.[def.voice.register] ?? REPLY_LINES[e.stance]?.plain ?? [];
        const fresh = options.filter((o) => e.t - (this.saidBy.get(`${e.who}|${o}`) ?? -Infinity) >= 7 * 1440 && e.t - (this.saidAny.get(o) ?? -Infinity) >= 8 * 1440);
        const warmish = ['warm', 'forgiven', 'convinced', 'owned', 'insist', 'with_you', 'seen'].includes(e.stance);
        const gestures = (warmish ? GESTURES_WARM : GESTURES_COOL).map((g) => `(${this.name(e.who)} ${g.replace('{poss}', def.pronouns.poss)}.)`);
        const freshGesture = gestures.filter((g) => e.t - (this.saidBy.get(`${e.who}|${g}`) ?? -Infinity) >= 7 * 1440);
        let words: string;
        if (fresh.length > 0) words = this.utter(e.who, REPLY_LINES[e.stance], {}, 7);
        else if (freshGesture.length) {
          words = pick(this.rng, freshGesture);
          this.saidBy.set(`${e.who}|${words}`, e.t);
        } else words = '';
        this.lastReply = { who: e.who, t: e.t, text: words };
        const offer = this.state.residents[e.who]?.lastAnswer?.offers.find((o) => o.kind === e.reply) ?? { kind: e.reply };
        this.lastSaid = { who: e.who, t: e.t, text: replySaid(offer, (id) => this.subjectName(id)) };
        // Not every remark needs an answer: with nothing fresh to say, they just listen.
        this.live(e.t, words ? `${this.you ? 'You say' : 'The steward says'} to ${this.name(e.who)}: "${this.lastSaid.text}" ${this.name(e.who)}: "${words}"` : `${this.you ? 'You say' : 'The steward says'} to ${this.name(e.who)}: "${this.lastSaid.text}" ${this.name(e.who)} listens.`);
        break;
      }
      case 'gift':
        this.live(e.t, `A trader's cart rattles into town and leaves ${e.timber} timber and ${e.food} food by the well. "Compliments of the road," says the driver, and is gone.`);
        break;
      case 'stores': {
        const who = this.name(e.who);
        const left = `${e.daysLeft} day${e.daysLeft === 1 ? '' : 's'}`;
        const lines: Record<typeof e.phase, string> = {
          asked: `${who} has a worry: "Winter will come, and I want ${e.target} food put by before it does. We need a granary." Winter stores: ${e.stored} of ${e.target}, ${left} to winter.`,
          reminded: `${who} starts counting sacks again: "${e.target} in the granary by winter, and we have ${e.stored}." ${cap(left)} to go.`,
          progress: `${who} counts the sacks in the granary: ${e.stored} of ${e.target} put by, ${left} to winter. "${e.stored * 4 >= e.target * 3 ? 'Nearly there. One last push.' : e.stored * 2 >= e.target ? 'Halfway! We can do this.' : 'A good start. Keep it coming.'}"`,
          met: `The first morning of winter, and the granary holds ${e.stored} food. ${who} goes door to door to tell everyone. Nobody will go hungry this winter.`,
          short: `Winter comes with ${e.stored} of ${e.target} food put by. ${who}: "It will have to do. We eat carefully, and we start sooner next year."`,
          feast: `Spring, and last year's stores won't keep: ${who} shares out the last ${e.stored} food from the granary, and the whole town eats well. The granary starts again from empty.`,
        };
        this.live(e.t, lines[e.phase]);
        break;
      }
      case 'plot_cleared':
        this.live(e.t, `The wild land${e.by.length ? `, cleared by ${this.names(e.by)},` : ''} is open at last. There is room to build.`);
        break;
      case 'dream_formed':
        this.live(e.t, `${this.name(e.who)} has a new hope: ${(this.you ? e.title.replace(/the steward/g, 'you') : e.title).replace(/^./, (c) => c.toLowerCase())}.`);
        break;
      case 'aspiration': {
        if (e.kind) {
          const line = e.done ? DREAM_DONE_LINES[e.kind] : undefined;
          if (line) {
            const p = residentDef(e.who).pronouns;
            const x = e.subject === 'steward' && this.you ? 'you' : subjectWords(this.state, e.subject);
            this.live(
              e.t,
              line
                .replace(/\{name\}/g, this.name(e.who))
                .replace(/\{x\}/g, x)
                .replace(/\{partner\}/g, e.partner ? this.name(e.partner) : 'a friend')
                .replace(/\{subj\}/g, p.subj)
                .replace(/\{yourStep\}/g, this.you ? 'your step' : "the steward's step"),
            );
          }
          break;
        }
        const line = (e.early ? ASPIRATION_LINES[`${e.who}:${e.stage}:early`] : undefined) ?? ASPIRATION_LINES[`${e.who}:${e.stage}${e.outcome ? `:${e.outcome}` : ''}`];
        if (!line) break;
        const partner = e.partner ? this.name(e.partner) : 'someone';
        this.live(e.t, line.replace(/\{partner\}/g, partner).replace(/\{you\}/g, this.you ? 'you' : 'the steward'));
        break;
      }
    }
  }

  /** "Ada wakes to find a hedge by her door", "Fen hears the old oak is gone", ... */
  private noticing(who: string, how: 'saw' | 'woke' | 'heard', change: 'built' | 'removed', building: number): string {
    const name = this.name(who);
    const poss = residentDef(who).pronouns.poss;
    const b = this.state.buildings.find((x) => x.id === building);
    const thing = b ? buildingDef(b.type).name.toLowerCase() : 'it';
    if (change === 'built') {
      if (how === 'woke') return `${name} wakes to find a new ${thing}${this.where(building)}`;
      if (how === 'heard') return `${name} hears about the new ${thing}`;
      return `${name} spots the new ${thing}`;
    }
    if (how === 'woke') return `${name} wakes to find the ${thing} gone from ${poss} view`;
    if (how === 'heard') return `${name} hears the ${thing} is gone`;
    return `${name} sees the ${thing} is gone`;
  }

  private get you(): boolean {
    return this.opts.stewardIsYou;
  }

  private names(ids: string[]): string {
    const n = ids.map((id) => this.name(id));
    return n.length <= 1 ? (n[0] ?? 'nobody') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
  }

  /** Before dawn it goes on the board; after, it is narrated as it happens. */
  private announce(t: number, text: string): void {
    if (minuteOf(t) < DAWN_MINUTE) this.pushBoard(() => text);
    else this.live(t, text);
  }

  private gathering(e: Extract<SimEvent, { type: 'gathering' }>): void {
    const g = e.gathering;
    const at = this.at(g.placeId);
    if (e.phase === 'announced') {
      if (g.kind === 'festival') this.announce(e.t, `Tomorrow evening: ${g.label}, ${at}.`);
      else if (g.kind === 'trade_cart') this.announce(e.t, `Pip's trade cart is due ${at} this morning.`);
      else if (g.kind === 'market') this.announce(e.t, `It's market day ${at}.`);
      else if (g.kind === 'musician') this.announce(e.t, `A travelling fiddler wanders into the valley. There will be music ${at} tonight.`);
      else if (g.kind === 'contraption') this.announce(e.t, `${g.label} will be unveiled ${at} tomorrow afternoon.`);
      else if (g.kind === 'lantern_walk') this.announce(e.t, `Tomorrow night: a lantern walk, setting off ${at}.`);
      else if (g.kind === 'tales') this.announce(e.t, `Tomorrow evening: a night of tales ${at}.`);
      else if (g.kind === 'bonfire') this.announce(e.t, `Tomorrow evening: a bonfire ${at}.`);
      return;
    }
    if (e.phase === 'start') {
      const template = GATHERING_START[g.kind] ?? '{festival} begins {at}.';
      this.live(e.t, cap(template.replace('{at}', at).replace('{festival}', g.label)));
      return;
    }
    if (g.kind === 'trade_cart' || g.kind === 'musician' || g.kind === 'market' || g.kind === 'lantern_walk' || g.kind === 'tales' || g.kind === 'bonfire') {
      const who = g.attendees.length > 0 ? `${this.names(g.attendees)} came by.` : 'Hardly anyone came.';
      this.live(e.t, `${cap(g.label)} packs up. ${who}`);
    }
  }

  private story(e: Extract<SimEvent, { type: 'story' }>): void {
    const [first, second] = e.cast;
    switch (e.id) {
      case 'favour':
        this.announce(
          e.t,
          e.ok
            ? `${this.name(first as string)} asked ${this.name(second as string)} to help ${e.topic}, and ${this.name(second as string)} did.`
            : `${this.name(first as string)} asked ${this.name(second as string)} to help ${e.topic}. ${this.name(second as string)} was too busy.`,
        );
        break;
      case 'birthday': {
        const givers = e.cast.slice(1);
        this.announce(e.t, `It's ${this.name(first as string)}'s birthday. ${givers.length > 0 ? `${this.names(givers)} remembered.` : 'Nobody seems to have remembered.'}`);
        break;
      }
      case 'cold':
        this.announce(e.t, `${this.name(first as string)} has come down with a cold.`);
        break;
      case 'reconcile':
        this.live(
          e.t,
          e.cast[2]
            ? `With ${this.name(e.cast[2])}'s help, ${this.name(first as string)} and ${this.name(second as string)} finally talk things through.`
            : `${this.name(first as string)} and ${this.name(second as string)} nod to each other on the path. Time has softened things.`,
        );
        break;
      case 'sick_visit':
        this.live(e.t, `${this.name(second as string)} brings ${this.name(first as string)} soup and sits with ${residentDef(first as string).pronouns.obj} a while.`);
        break;
      case 'sick_alone':
        this.live(e.t, `Nobody comes by to see ${this.name(first as string)}.`);
        break;
      case 'storm_passed':
        this.announce(e.t, 'The storm has blown itself out. Neighbours check on one another.');
        break;
      case 'festival_success': {
        const label = e.topic ? this.subjectName(e.topic) : 'The festival';
        const absent = this.state.order.filter((id) => !e.cast.includes(id) && !this.state.residents[id]?.departed);
        this.live(e.t, `${label} winds down. ${e.cast.length > 0 ? `${this.names(e.cast)} were there` : 'Hardly anyone came'}${absent.length > 0 ? `; ${this.names(absent)} stayed away` : ''}.`);
        break;
      }
      case 'contraption_success':
        this.live(e.t, `${e.topic ? this.subjectName(e.topic) : 'The contraption'} whirs, clanks, and works! ${this.names(e.cast)} cheer.`);
        break;
      case 'contraption_failure':
        this.live(e.t, `${e.topic ? this.subjectName(e.topic) : 'The contraption'} goes off with a bang and a puff of smoke.`);
        break;
    }
  }

  private dilemmaClosed(e: Extract<SimEvent, { type: 'dilemma_closed' }>): void {
    const d = e.dilemma;
    const what = `${this.name(d.proposer)}'s ${DILEMMA_NAMES[d.type]}`;
    const pleased = e.reactions.filter((x) => x.valence > 0 && x.who !== d.proposer).map((x) => x.who);
    const displeased = e.reactions.filter((x) => x.valence < 0 && x.who !== d.proposer).map((x) => x.who);
    let text: string;
    if (d.status === 'approved') text = `${this.you ? 'You approve' : 'The steward approves'} ${what}. ${this.name(d.proposer)} is delighted.`;
    else if (d.status === 'declined') text = `${this.you ? 'You decline' : 'The steward declines'} ${what}. ${this.name(d.proposer)} is disappointed.`;
    else text = `${cap(what)} went unanswered. ${this.name(d.proposer)} takes it badly.`;
    if (pleased.length > 0) text += ` ${this.names(pleased)} ${pleased.length > 1 ? 'are' : 'is'} glad.`;
    if (displeased.length > 0) text += ` ${this.names(displeased)} ${displeased.length > 1 ? 'are' : 'is'} not pleased.`;
    this.announce(e.t, text);
  }

  private exchange(e: Extract<SimEvent, { type: 'exchange' }>): void {
    this.exchangesToday++;
    if (e.kind === 'share_opinion') this.gossipToday++;
    const a = this.name(e.a);
    const b = this.name(e.b);
    const at = e.place !== null ? `At ${this.subjectName(`b:${e.place}`)}, ` : 'On the path, ';
    let text: string | null = null;
    switch (e.kind) {
      case 'share_opinion': {
        if (!e.topic || Math.abs(e.topic.valence) < 0.5) break;
        const key = `${e.a}|${e.b}|${e.topic.subject}|${e.topic.aspect}`;
        if (this.toldPairs.has(key) && !this.opts.verbose) break;
        this.toldPairs.add(key);
        // Talk about the steward is quoted once a day per speaker; after that it is just reported
        // (review: "the steward listens" in a quarter of everything said).
        const statement = this.spoken(e.a, e.topic);
        const said = this.voice(e.a, SPEECH.share_opinion, { s: this.subjectName(e.topic.subject), statement });
        if (!this.stewardOnce(e.a, e.t, said)) {
          text = `${at}${a} tells ${b} what ${residentDef(e.a).pronouns.subj} think${residentDef(e.a).pronouns.subj === 'they' ? '' : 's'} of ${this.you ? 'you' : 'the steward'}.`;
          if (!e.ok) text += ` ${b} isn't convinced.`;
          break;
        }
        text = `${at}${a} tells ${b}: ${said}`;
        if (!e.ok) text += ` ${b} isn't convinced.`;
        break;
      }
      case 'comfort':
        if (e.ok) text = `${at}${a} sees ${b} is low. ${this.voice(e.a, SPEECH.comfort, { other: b })}`;
        break;
      case 'compliment': {
        const key = `compliment|${e.a}|${e.b}`;
        const last = this.lastPair.get(key);
        if (last !== undefined && dayOf(e.t) - last < 3 && !this.opts.verbose) break;
        this.lastPair.set(key, dayOf(e.t));
        text = `${at}${a} to ${b}: ${this.voice(e.a, SPEECH.compliment, { other: b })}`;
        break;
      }
      case 'argue': {
        const about = e.topic ? ` about ${e.topic.subject === STEWARD_ID && this.you ? 'you' : this.subjectName(e.topic.subject)}` : '';
        // What they say is about what they argue over (owner playtest: "words about the steward"
        // quoted a line that wasn't). Between themselves, residents call you "the steward".
        const s = e.topic ? (e.topic.subject === STEWARD_ID ? 'the steward' : this.subjectName(e.topic.subject)) : '';
        // Which side they take: the speaker's own view of it (the event itself carries no side).
        const view = e.topic ? (e.topic.subject === STEWARD_ID ? (this.state.residents[e.a]?.rel.steward?.affinity ?? 0) : opinion(this.state.residents[e.a]!, e.topic.subject)) : 0;
        const lines = e.topic ? (view >= 0 ? SPEECH.argue_for : SPEECH.argue_against) : SPEECH.argue;
        text = `${at}${a} and ${b} have words${about}. ${this.voice(e.a, lines, { other: b, s })}`;
        break;
      }
      case 'apologize':
        text = e.ok
          ? `${at}${a} finds ${b}. ${this.voice(e.a, SPEECH.apologize, { other: b })}`
          : this.freshLine(e.a, [`${a} tries to apologise to ${b}, who isn't ready to hear it.`, `${a} starts to say sorry, but ${b} walks off.`, `${b} hears ${a} out, and says nothing back.`, `${a}'s apology lands on stony ground with ${b}.`, `${b} isn't ready to make it up with ${a} yet.`]);
        break;
      case 'tease':
        if (!e.ok) text = `${at}${a} teases ${b}, and it lands badly.`;
        break;
      case 'reminisce':
        if (e.topic) text = `${at}${a} and ${b} reminisce about ${this.subjectName(e.topic.subject)}.`;
        break;
      case 'chat':
        if (e.mind) {
          const said = this.mindLine(e.a, e.mind);
          if (this.stewardOnce(e.a, e.t, said)) text = `${at}${a} to ${b}: ${said}`;
        }
        else if (this.opts.verbose) text = `${at}${a} and ${b}: chat.`;
        break;
      default:
        if (this.opts.verbose) text = `${at}${a} and ${b}: ${e.kind.replace('_', ' ')}.`;
    }
    if (!text) return;
    const important = e.kind === 'argue' || e.kind === 'apologize' || e.kind === 'comfort';
    if (!important && !this.opts.verbose && this.exchangeLinesToday >= this.opts.exchangeLinesPerDay) return;
    this.exchangeLinesToday++;
    this.live(e.t, text);
  }

  // ---------------------------------------------------------------- memories (2026-10-08)

  /** When something happened, as a resident would say it: yesterday, three days ago, last week, back in the spring. */
  whenSaid(tick: number, now = this.state.tick): string {
    const days = dayOf(now) - dayOf(tick);
    if (days <= 0) return 'earlier today';
    if (days === 1) return 'yesterday';
    if (days < 7) return `${DAY_WORDS[days]} days ago`;
    if (days < 14) return 'last week';
    const season = seasonOf(tick);
    const year = (t: number) => Math.floor((dayOf(t) - 1) / (DAYS_PER_SEASON * 4));
    return year(tick) === year(now) ? `back in the ${season}` : year(now) - year(tick) === 1 ? `last ${season}` : 'years ago';
  }

  /**
   * A memory as a first-person clause: "you built the bakery for me". It is about `rec.subject`,
   * named as the listener hears it ("you" for the steward in talk). Notes are written about the
   * resident ("woke her"), so their own pronouns become "me".
   */
  memoryClause(who: string, rec: { subject: SubjectId; aspect: string; note: string }, youAreSteward = true): string {
    const p = residentDef(who).pronouns;
    const me = (t: string) =>
      t.replace(new RegExp(`\\b${p.subj} (was|were)\\b`, 'g'), 'I was').replace(new RegExp(`\\b${p.obj}\\b`, 'g'), 'me');
    const x = rec.subject === STEWARD_ID ? (youAreSteward ? 'you' : 'the steward') : this.subjectName(rec.subject);
    const note = me(rec.note);
    const verbFirst = /^(built|put|took|granted|planted|said|never|helped|remembered|looked|fed|taught|decided|wouldn't|asked|filled|shared|gave|let)\b/.test(note);
    switch (rec.aspect) {
      case 'argued_with_me':
        return `${x} and I argued`;
      case 'made_amends':
        return `${x} and I made it up`;
      case 'wonderful_time':
        return `the whole valley turned out for ${x}`;
      case 'lost_place':
        return `we lost ${x}`;
      case 'my_workplace':
        return `I got ${x} to work in`;
      case 'smells_lovely':
        return `I ${note}`;
      case 'ignores_me': {
        if (note === 'nothing was done') return `I asked ${x} for something and nothing was done`;
        const wish = /^our wish for (.+) came to nothing$/.exec(note);
        if (wish) return `${x} let our wish for ${wish[1]} come to nothing`;
        return verbFirst ? `${x} ${note}` : note;
      }
      case 'looks_out_for_me':
        // "winter came with the granary short": something the steward let happen.
        return verbFirst ? `${x} ${note}` : `${x} let ${note.replace(/^winter came\b/, 'winter come')}`;
      case 'listens_to_me':
        return verbFirst ? `${x} ${note}` : `${x} listened, and I got ${note}`;
      case 'granted_wish':
        return `${x} ${note.replace(/^granted the town's wish: /, "granted the town's wish for ")}`;
      case 'decided_well':
      case 'decided_badly': {
        // "never answered Marlow's market day" reads as nonsense; say who went unanswered, about what.
        const m = /^never answered (.+)'s (.+)$/.exec(note);
        return m ? `${x} never gave ${m[1]} an answer about the ${m[2]}` : `${x} ${note}`;
      }
      case 'still_waiting':
        return `${x} kept me waiting`;
      case 'went_hungry':
        return `${x} let the larder run bare`;
      case 'kind_to_me':
        if (note.startsWith(x)) return note;
        return verbFirst ? `${x} ${note}` : `${x} gave us ${note}`;
      default:
        // A clause already ("the storm kept me up", "Juniper's contraption went bang") or a deed by them.
        return verbFirst ? `${x} ${note}` : note;
    }
  }

  /** A memory for their page: the same words each time it is drawn (no tic, wording fixed by the memory). */
  memoryQuote(who: string, ep: { id: number; subject: SubjectId; aspect: string; note: string; valence: number; tick: number }): string {
    const lines = ep.valence >= 0 ? RECALL_LINES.good : RECALL_LINES.bad;
    const options = lines[residentDef(who).voice.register] ?? lines.plain;
    const t = options[ep.id % options.length] as string;
    return sentenceCase(fixArticles(this.fill(t, FIRST_PERSON, { clause: this.memoryClause(who, ep, this.you), when: this.whenSaid(ep.tick) })));
  }

  /** A memory, in the resident's voice, with when it happened. */
  memoryLine(who: string, rec: { subject: SubjectId; aspect: string; note: string; valence: number; tick: number }, youAreSteward = true): string {
    // No verbal tic: it follows an answer that may have had one ("I must say ... I must say").
    const lines = rec.valence >= 0 ? RECALL_LINES.good : RECALL_LINES.bad;
    const options = lines[residentDef(who).voice.register] ?? lines.plain;
    return sentenceCase(fixArticles(this.fill(this.freshest(who, options), FIRST_PERSON, { clause: this.memoryClause(who, rec, youAreSteward), when: this.whenSaid(rec.tick) })));
  }

  /** `${who}|${tic}` -> the day it was last used, so a tic is heard at most once a day. */
  private ticUsed = new Map<string, number>();

  /** The last thing a resident said to the steward, for the talk panel. */
  lastReply: { who: string; t: number; text: string } | null = null;
  /** What the steward last said in reply, in words (bar round 2: the chips and the chat show the same). */
  lastSaid: { who: string; t: number; text: string } | null = null;
  /** When each log line was last written, so a minor line is not written twice in a week. */
  private readonly lastSaidLine = new Map<string, number>();

  /** An answer to the steward, in the resident's voice (the words only). */
  answer(who: string, a: TalkAnswer): string {
    const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
    const mind = (m: Pick<MindMention, 'key' | 'vars' | 'about'>) => this.utter(who, (m.about === STEWARD_ID && this.you && TO_STEWARD_LINES[m.key]) || MIND_LINES[m.key], topicVars(m));
    switch (a.question) {
      case 'how': {
        const top = a.topics?.[0];
        return [this.utter(who, TALK_HOW[a.band ?? 'fair']), top ? mind(top) : ''].filter(Boolean).join(' ');
      }
      case 'mind':
        return a.topics && a.topics.length > 0 ? a.topics.map(mind).join(' ') : 'Nothing much, honestly.';
      case 'hope':
        if (!a.hope || a.hope.done || !a.hope.next) return this.utter(who, TALK_HOPE_DONE);
        // When the next step is the dream itself ("make something for Marlow, in the evenings"), say it once.
        if (a.hope.next.toLowerCase().includes(a.hope.title.toLowerCase())) return this.utter(who, TALK_HOPE_ONE, { title: firstPerson(lower(a.hope.next)) });
        return this.utter(who, TALK_HOPE, { title: firstPerson(lower(a.hope.title)), next: firstPerson(lower(a.hope.next)) });
      case 'opinion':
      case 'me': {
        const person = !!a.about?.startsWith('r:');
        const lines = a.question === 'me' ? TALK_ME[a.band ?? 'neutral'] : (person ? TALK_OPINION_PERSON : TALK_OPINION)[a.band ?? 'neutral'];
        const head = this.utter(who, lines, { s: a.about ? this.subjectName(a.about) : 'that' });
        const why = a.because && a.band !== 'neutral' ? this.utter(who, TALK_REASON, { statement: this.spoken(who, a.because) }) : '';
        const but = a.but ? this.utter(who, TALK_BUT, { x: deedClause(a.but.note) }) : '';
        return [head, why, but].filter(Boolean).join(' ');
      }
    }
  }

  private talked(e: Extract<SimEvent, { type: 'talk' }>): void {
    const p = residentDef(e.who).pronouns;
    const name = this.name(e.who);
    const a = e.answer;
    const asking =
      a.question === 'how'
        ? `how ${p.subj} ${p.subj === 'they' ? 'are' : 'is'}`
        : a.question === 'mind'
          ? `what's on ${p.poss} mind`
          : a.question === 'hope'
            ? `what ${p.subj} ${p.subj === 'they' ? 'are' : 'is'} hoping for`
            : a.question === 'me'
              ? `what ${p.subj} ${p.subj === 'they' ? 'think' : 'thinks'} of ${this.you ? 'you' : 'the steward'}`
              : `what ${p.subj} ${p.subj === 'they' ? 'think' : 'thinks'} of ${a.about ? this.subjectName(a.about) : 'things'}`;
    // A fact this question reveals (M4 Folk album) is said in the reply, so the album learns what you were told.
    const fact = nextFact(this.state, e.who, a.question, a.about);
    const told = fact ? factSaid(this.state, this.state.residents[e.who]!, fact) : '';
    // A memory they bring up (2026-10-08), in their own words, after the answer itself.
    let remembered = a.memory ? this.memoryLine(e.who, a.memory, this.you) : '';
    // Four sentences at most (bar round 3): a fact takes the place of a second thing on their
    // mind, then the second thing goes, then the memory waits for another day.
    const tics = residentDef(e.who).voice.tics;
    let shown = told && a.question === 'mind' ? { ...a, topics: a.topics?.slice(0, 1) } : a;
    let head = this.toSteward(this.answer(e.who, shown));
    const total = () => sentenceCount([head, remembered, told].filter(Boolean).join(' '), tics);
    if (total() > 4 && (shown.topics?.length ?? 0) > 1) {
      shown = { ...shown, topics: shown.topics?.slice(0, 1) };
      head = this.toSteward(this.answer(e.who, shown));
    }
    if (total() > 4) remembered = '';
    // "What do you think of me": the reason gives way before the concession does.
    if (total() > 4 && shown.because && shown.but) {
      const { because: _b, ...rest } = shown;
      shown = rest;
      head = this.toSteward(this.answer(e.who, shown));
    }
    if (total() > 4 && (shown.topics?.length ?? 0) > 0) {
      shown = { ...shown, topics: [] };
      head = this.toSteward(this.answer(e.who, shown));
    }
    const words = [head, remembered, told].filter(Boolean).join(' ');
    this.lastReply = { who: e.who, t: e.t, text: words };
    this.live(e.t, `${this.you ? 'You ask' : 'The steward asks'} ${name} ${asking}. "${words}"`);
  }

  /** Said to the steward's face: "the steward listens" becomes "you listen" (in the browser, where you are the steward). */
  toSteward(text: string): string {
    if (!this.you) return text;
    const verbs: Array<[RegExp, string | ((m: string, ...groups: string[]) => string)]> = [
      [/\bwhoever the steward is, they care\b/gi, 'you care'],
      [/\b(the )?steward doesn't\b/gi, "you don't"],
      [/\b(the )?steward does\b/gi, 'you do'],
      [/\bthe steward is\b/gi, 'you are'],
      [/\bthe steward has\b/gi, 'you have'],
      [/\bthe steward's\b/gi, 'your'],
      [/\bthe steward was\b/gi, 'you were'],
      // "The steward really does care" is "you really do care" (bar round 3: "You really does care").
      [/\bthe steward (really|always|never|still|truly|just|certainly|clearly) (does|has|is|was|\w+s)\b/gi, (_m: string, adv?: string, v?: string) => `you ${adv} ${v === 'is' ? 'are' : v === 'was' ? 'were' : v === 'has' ? 'have' : v === 'does' ? 'do' : plainVerb(v ?? '')}`],
      [/\bthe steward (\w+s)\b/gi, (_m: string, v?: string) => `you ${plainVerb(v ?? '')}`],
      [/\bthe steward\b/gi, 'you'],
    ];
    let out = text;
    for (const [re, to] of verbs) out = typeof to === 'string' ? out.replace(re, to) : out.replace(re, to as (m: string, ...g: string[]) => string);
    return out.replace(/(^|[.!?] )you\b/g, (_m, p: string) => `${p}You`);
  }

  private favourWhat(kind: FavourKind, other?: string): string {
    const o = other ? this.name(other) : 'someone';
    return { timber: 'cut some timber', catch: 'bring in a catch', garden: 'work the garden', clear: 'help clear the wild land', visit: `look in on ${o}`, mend: `make peace with ${o}` }[kind];
  }

  private got(y: Partial<Record<Resource, number>> | undefined): string {
    const parts = Object.entries(y ?? {})
      .filter(([, v]) => Math.round(v ?? 0) > 0)
      .map(([k, v]) => `${Math.round(v as number)} ${k}`);
    return parts.length ? parts.join(' and ') : 'nothing to show';
  }

  private favour(e: Extract<SimEvent, { type: 'favour' }>): void {
    const name = this.name(e.who);
    const other = e.other ? this.name(e.other) : '';
    const ask = `${this.you ? 'You ask' : 'The steward asks'} ${name} to ${this.favourWhat(e.kind, e.other)}.`;
    if (e.phase === 'agreed') {
      const words = this.utter(e.who, FAVOUR_YES[e.kind], { other });
      this.lastReply = { who: e.who, t: e.t, text: words };
      this.live(e.t, `${ask} "${words}"`);
    } else if (e.phase === 'refused') {
      if (e.reason === 'asleep' || e.reason === 'gone') {
        const words = e.reason === 'asleep' ? `(${name} is asleep.)` : `(${name} has left the valley.)`;
        this.lastReply = { who: e.who, t: e.t, text: words };
        return;
      }
      const words = this.utter(e.who, FAVOUR_NO[e.reason ?? 'distrust'], { other });
      this.lastReply = { who: e.who, t: e.t, text: words };
      this.live(e.t, `${ask} ${name} says no: "${words}"`);
    } else if (e.phase === 'done') {
      this.live(e.t, FAVOUR_DONE[e.kind].replace(/\{name\}/g, name).replace(/\{other\}/g, other).replace(/\{got\}/g, this.got(e.yield)));
    } else if (e.phase === 'abandoned') {
      this.live(e.t, `${name} never got round to ${this.favourWhat(e.kind, e.other).replace(/^help /, 'helping ')}.`);
    }
  }

  /** Yesterday's work, on the morning board: who brought in what. */
  private production(e: Extract<SimEvent, { type: 'production' }>): void {
    const lines: string[] = [];
    for (const res of ['timber', 'food'] as Resource[]) {
      const by = Object.entries(e.by)
        .map(([k, v]) => [k, v[res] ?? 0] as const)
        .filter(([, v]) => v >= 0.5)
        .sort((a, b) => b[1] - a[1]);
      if (by.length === 0) continue;
      const total = Math.round(by.reduce((s, [, v]) => s + v, 0));
      const who = by.map(([k, v]) => `${this.state.residents[k] ? this.name(k) : `the ${buildingDef(k).name.toLowerCase()}`} ${Math.round(v)}`).join(', ');
      lines.push(`${total} ${res} (${who})`);
    }
    if (lines.length) this.pushBoard(() => `Yesterday's work: ${lines.join('; ')}.`);
  }

  /** What is on someone's mind, in their own voice. */
  mindLine(who: string, m: Pick<MindMention, 'key' | 'vars'>): string {
    return this.voice(who, MIND_LINES[m.key], topicVars(m));
  }

  private thinks(e: Extract<SimEvent, { type: 'thought' }>): void {
    const mine = this.thoughtsToday.get(e.who) ?? 0;
    const total = [...this.thoughtsToday.values()].reduce((x, y) => x + y, 0);
    if (!this.opts.verbose && (mine >= THOUGHTS_PER_RESIDENT || total >= this.opts.thoughtsPerDay)) return;
    // A passing thought is skipped rather than repeated when every way of saying it is stale.
    if (!this.opts.verbose && this.allStale(e.who, MIND_LINES[e.key])) return;
    this.thoughtsToday.set(e.who, mine + 1);
    const verb = /^(grudge|feel:annoyance)$/.test(e.key)
      ? 'mutters'
      : /^(need:|feel:grief|feel:loneliness|feel:worry|leaving|larder)/.test(e.key)
        ? 'sighs'
        : pick(this.rng, ['thinks', 'muses', 'thinks to ' + this.reflexive(e.who)]);
    const line = this.mindLine(e.who, e);
    // Thoughts that mention the steward share a once-a-day allowance with gossip about them.
    if (!this.stewardOnce(e.who, e.t, line)) return;
    const text = `${this.name(e.who)} ${verb}: ${line}`;
    const night = minuteOf(e.t) < DAWN_MINUTE && dayOf(e.t) > 1;
    this.out(`${clock(e.t)}${night ? '*' : ' '} ${text}`);
    this.entry('thought', e.t, text);
  }

  private reflexive(who: string): string {
    const p = residentDef(who).pronouns.obj;
    return p === 'them' ? 'themself' : p === 'me' ? 'myself' : `${p}self`;
  }

  private dawn(day: number, t: number): void {
    if (day > 1) {
      const note = `(${this.exchangesToday} conversations yesterday, ${this.gossipToday} of them gossip.)`;
      this.out(`${INDENT}${note}`);
      this.entry('note', t, note);
    }
    this.out('');
    this.out(`=== Day ${day} · ${cap(seasonOf(t))} ===`);
    this.entry('day', t, `Day ${day} · ${cap(seasonOf(t))}`);
    this.out('Notice board:');
    if (this.digest.length) {
      const items = this.digest.map((f) => f());
      const text = items.length <= 2 ? `Around town: ${items.join('; ')}.` : `Around town: ${items.slice(0, 2).join('; ')}; and ${items.length - 2} more change${items.length - 2 === 1 ? '' : 's'} of heart (in each journal).`;
      this.board.push({ text: () => text, importance: 'minor' });
      this.digest = [];
    }
    if (this.board.length === 0) this.out('  - Nothing new.');
    for (const item of this.board) {
      const text = item.text();
      this.out(`  - ${text}`);
      this.importance = item.importance;
      this.entry('board', t, text);
    }
    this.out('');
    this.board = [];
    this.exchangesToday = 0;
    this.gossipToday = 0;
    this.exchangeLinesToday = 0;
    this.thoughtsToday.clear();
  }

  /** Text for the whole run so far. */
  text(): string {
    return this.lines.join('\n');
  }
}

/** "a orchard" → "an orchard", in any line once its blanks are filled. */
function fixArticles(text: string): string {
  return text.replace(/\b([Aa]) (?=[aeiouAEIOU])/g, '$1n ');
}

function aOrAn(noun: string): string {
  return /^[aeiou]/.test(noun) ? `an ${noun}` : `a ${noun}`;
}

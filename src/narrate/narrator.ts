// The M1 "radio play": turns the sim's event stream into readable text. Overnight news is
// gathered into a notice board read out at dawn (spec section 3); notable moments during the
// day are narrated live. The narrator has its own random stream, so narrating never changes
// the simulation.

import { buildingDef } from '../content/buildings.js';
import { residentDef } from '../content/residents.js';
import { BELIEF_STATEMENTS, SPEECH, THOUGHTS, type Lines } from '../content/voice.js';
import { chance, deriveSeed, pick, type RngHolder } from '../sim/rng.js';
import type { Simulation } from '../sim/sim.js';
import { DAWN_MINUTE, clock, dayOf, minuteOf, seasonOf } from '../sim/time.js';
import type { Belief, ResidentDef, SimEvent, SimState, SubjectId } from '../sim/types.js';
import { distanceTo } from '../sim/world.js';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const INDENT = '       ';

/** Capitalise the start of the text and of each sentence. */
function sentenceCase(s: string): string {
  return cap(s).replace(/([.?!] )([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase());
}

type Person = { subj: string; obj: string; poss: string };
const FIRST_PERSON: Person = { subj: 'I', obj: 'me', poss: 'my' };

export interface NarratorOptions {
  /** Narrate every exchange instead of the notable ones. */
  verbose?: boolean;
  /** Most live exchange lines per day before the rest are only counted. */
  exchangeLinesPerDay?: number;
}

export class Narrator {
  readonly lines: string[] = [];
  /** Notice-board items, rendered at dawn so they read right as of the morning. */
  private board: Array<() => string> = [];
  private rng: RngHolder;
  private exchangesToday = 0;
  private gossipToday = 0;
  private exchangeLinesToday = 0;
  /** `${who}|${subject}` -> day last narrated, so daily haunts don't repeat every morning. */
  private lastRecall = new Map<string, number>();
  private toldPairs = new Set<string>();
  private reactedAt = new Set<string>();
  /** `${kind}|${a}|${b}` -> day last narrated, for exchanges that would otherwise repeat. */
  private lastPair = new Map<string, number>();
  private readonly opts: Required<NarratorOptions>;

  constructor(
    private readonly sim: Simulation,
    opts: NarratorOptions = {},
  ) {
    this.rng = { rng: deriveSeed(sim.state.seed, 'narrator') };
    this.opts = { verbose: false, exchangeLinesPerDay: 10, ...opts };
    sim.on((e) => this.handle(e));
  }

  private get state(): SimState {
    return this.sim.state;
  }

  private out(line: string): void {
    this.lines.push(line);
  }

  /** The log runs dawn to dawn; small hours are marked so they don't read as the evening before. */
  private live(t: number, text: string): void {
    const night = minuteOf(t) < DAWN_MINUTE && dayOf(t) > 1;
    this.out(`${clock(t)}${night ? '*' : ' '} ${text}`);
  }

  // ---------------------------------------------------------------- naming

  name(id: string): string {
    return residentDef(id).name;
  }

  subjectName(subject: SubjectId): string {
    if (subject === 'steward') return 'the steward';
    if (subject.startsWith('r:')) return this.name(subject.slice(2));
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

  private where(buildingId: number): string {
    const b = this.state.buildings.find((x) => x.id === buildingId);
    if (!b) return '';
    let best: { d: number; name: string } | null = null;
    for (const id of this.state.order) {
      const r = this.state.residents[id];
      if (!r) continue;
      const home = this.state.buildings.find((x) => x.id === r.homeId);
      if (!home) continue;
      const [hw, hh] = buildingDef(home.type).size;
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
      .replace(/\{subj\}/g, person.subj)
      .replace(/\{obj\}/g, person.obj)
      .replace(/\{poss\}/g, person.poss);
  }

  private keepsCapital(text: string): boolean {
    if (/^I\b/.test(text)) return true;
    return this.state.order.some((id) => text.startsWith(this.name(id)));
  }

  /** A line in a resident's own voice, with an occasional verbal tic. */
  voice(who: string, lines: Lines | undefined, vars: Record<string, string> = {}): string {
    const def = residentDef(who);
    const options = lines?.[def.voice.register] ?? lines?.plain ?? ['...'];
    let text = sentenceCase(this.fill(pick(this.rng, options), FIRST_PERSON, vars));
    const tics = def.voice.tics.filter((t) => !text.toLowerCase().includes(t.toLowerCase()));
    if (tics.length > 0 && chance(this.rng, 0.25)) {
      const tic = pick(this.rng, tics);
      if (tic.endsWith('.') || tic.endsWith('!')) text = `${tic} ${text}`;
      else text = `${cap(tic)}, ${this.keepsCapital(text) ? text : text.charAt(0).toLowerCase() + text.slice(1)}`;
    }
    return `"${text}"`;
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
    switch (e.type) {
      case 'dawn':
        this.dawn(e.day, e.t);
        break;
      case 'built':
        this.live(e.t, `The steward builds ${aOrAn(buildingDef(e.btype).name.toLowerCase())}${this.where(e.building)}.`);
        break;
      case 'removed':
        this.live(e.t, `The steward has ${this.subjectName(`b:${e.building}`)} taken down.`);
        break;
      case 'took_job':
        if (e.t > 0) {
          this.live(e.t, `${this.name(e.who)} takes up work at ${this.subjectName(`b:${e.building}`)}.`);
          const line = this.thought(e.who, `b:${e.building}`, 'my_workplace', 1);
          if (line) this.out(`${INDENT}${this.name(e.who)}: ${line}`);
        }
        break;
      case 'disturbed_sleep':
        this.live(e.t, `Noise from ${this.subjectName(`b:${e.building}`)} wakes ${this.name(e.who)}. ${cap(residentDef(e.who).pronouns.subj)} lie${residentDef(e.who).pronouns.subj === 'they' ? '' : 's'} awake till dawn.`);
        break;
      case 'reaction': {
        const b = this.state.buildings.find((x) => x.id === e.building);
        const key = `${e.t}|${e.who}|${b?.type}`;
        if (this.reactedAt.has(key)) break;
        this.reactedAt.add(key);
        const line = this.thought(e.who, `b:${e.building}`, e.aspect, e.valence);
        if (line) this.live(e.t, `${this.name(e.who)}, looking at ${this.subjectName(`b:${e.building}`)}: ${line}`);
        break;
      }
      case 'grief': {
        const line = this.thought(e.who, `b:${e.building}`, 'lost_place', -1);
        if (line) this.out(`${INDENT}${this.name(e.who)}: ${line}`);
        break;
      }
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
      case 'belief_formed': {
        const from = e.hearsay ? e.belief.sources.find((s) => s.from)?.from : undefined;
        const n = e.belief.sources.filter((s) => s.kind === 'witnessed').length;
        const why = from ? ` (heard it from ${this.name(from)})` : n >= 2 ? ` (after ${n} times)` : '';
        this.board.push(() => `${this.name(e.who)} has decided ${this.statement(e.who, e.belief)}${why}.`);
        break;
      }
      case 'belief_flipped':
        this.board.push(() => `${this.name(e.who)} has changed ${residentDef(e.who).pronouns.poss} mind: ${this.statement(e.who, e.belief)}${e.belief.valence >= 0 ? '' : ', after all'}.`);
        break;
      case 'belief_faded':
        this.board.push(() => `${this.name(e.who)} has stopped dwelling on how ${this.statement(e.who, e)}.`);
        break;
      case 'request_posted':
        this.board.push(() => `${this.name(e.request.by)} asks: ${this.voice(e.request.by, SPEECH.request, { s: this.subjectName(e.request.subject) })}`);
        break;
      case 'request_closed':
        this.board.push(
          () => `${this.name(e.request.by)}: ${this.voice(e.request.by, e.request.status === 'fulfilled' ? SPEECH.fulfilled : SPEECH.lapsed, { s: this.subjectName(e.request.subject) })}`,
        );
        break;
      case 'relationship':
        for (const tag of e.added) {
          if (tag === 'friend') this.board.push(() => `${this.name(e.who)} now counts ${this.name(e.other)} as a friend.`);
          if (tag === 'close_friend') this.board.push(() => `${this.name(e.who)} now counts ${this.name(e.other)} as a close friend.`);
          if (tag === 'rival') this.board.push(() => `${this.name(e.who)} is not getting on with ${this.name(e.other)}.`);
        }
        if (e.removed.includes('friend')) this.board.push(() => `${this.name(e.who)} and ${this.name(e.other)} have drifted apart.`);
        break;
      case 'thinking_of_leaving':
        this.board.push(() => `${this.name(e.who)} is thinking of leaving. ${this.voice(e.who, SPEECH.leaving)}`);
        break;
      case 'decided_to_stay':
        this.board.push(() => `${this.name(e.who)} has decided to stay. ${this.voice(e.who, SPEECH.staying)}`);
        break;
      case 'left_town':
        this.board.push(() => `${this.name(e.who)} has packed up and left the valley.`);
        break;
      case 'perceived':
        break;
    }
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
        const statement = this.spoken(e.a, e.topic);
        text = `${at}${a} tells ${b}: ${this.voice(e.a, SPEECH.share_opinion, { s: this.subjectName(e.topic.subject), statement })}`;
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
      case 'argue':
        text = `${at}${a} and ${b} have words. ${this.voice(e.a, SPEECH.argue, { other: b })}`;
        break;
      case 'apologize':
        text = e.ok ? `${at}${a} finds ${b}. ${this.voice(e.a, SPEECH.apologize, { other: b })}` : `${a} tries to apologise to ${b}, who isn't ready to hear it.`;
        break;
      case 'tease':
        if (!e.ok) text = `${at}${a} teases ${b}, and it lands badly.`;
        break;
      case 'reminisce':
        if (e.topic) text = `${at}${a} and ${b} reminisce about ${this.subjectName(e.topic.subject)}.`;
        break;
      default:
        if (this.opts.verbose) text = `${at}${a} and ${b}: ${e.kind.replace('_', ' ')}.`;
    }
    if (!text) return;
    if (!this.opts.verbose && this.exchangeLinesToday >= this.opts.exchangeLinesPerDay) return;
    this.exchangeLinesToday++;
    this.live(e.t, text);
  }

  private dawn(day: number, t: number): void {
    if (day > 1) this.out(`${INDENT}(${this.exchangesToday} conversations yesterday, ${this.gossipToday} of them gossip.)`);
    this.out('');
    this.out(`=== Day ${day} · ${cap(seasonOf(t))} ===`);
    this.out('Notice board:');
    if (this.board.length === 0) this.out('  - Nothing new.');
    for (const item of this.board) this.out(`  - ${item()}`);
    this.out('');
    this.board = [];
    this.exchangesToday = 0;
    this.gossipToday = 0;
    this.exchangeLinesToday = 0;
  }

  /** Text for the whole run so far. */
  text(): string {
    return this.lines.join('\n');
  }
}

function aOrAn(noun: string): string {
  return /^[aeiou]/.test(noun) ? `an ${noun}` : `a ${noun}`;
}

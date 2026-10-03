// The M1 "radio play": turns the sim's event stream into readable text. Overnight news is
// gathered into a notice board read out at dawn (spec section 3); notable moments during the
// day are narrated live. The narrator has its own random stream, so narrating never changes
// the simulation.

import { buildingDef } from '../content/buildings.js';
import { residentDef } from '../content/residents.js';
import { DILEMMA_NAMES, GATHERING_START, PREPOSITIONS, PROPOSALS } from '../content/story.js';
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
    // No tic on a line that already opens with an interjection or a name.
    const opensLoud = /^(Oh|Ha|Ooh|Hey|Listen|Kaboom|What)\b/.test(text) || this.keepsCapital(text) && !/^I\b/.test(text);
    const tics = opensLoud ? [] : def.voice.tics.filter((t) => !text.toLowerCase().includes(t.toLowerCase()));
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
      case 'town_memory':
        break;
      case 'gathering':
        this.gathering(e);
        break;
      case 'weather':
        if (e.kind === 'rain') this.board.push(() => 'Rain today. The paths will be muddy.');
        else this.live(e.t, 'Dark clouds pile up over the valley. A storm is coming.');
        break;
      case 'dilemma_posted':
        this.board.push(
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
    }
  }

  private names(ids: string[]): string {
    const n = ids.map((id) => this.name(id));
    return n.length <= 1 ? (n[0] ?? 'nobody') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
  }

  /** Before dawn it goes on the board; after, it is narrated as it happens. */
  private announce(t: number, text: string): void {
    if (minuteOf(t) < DAWN_MINUTE) this.board.push(() => text);
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
      return;
    }
    if (e.phase === 'start') {
      const template = GATHERING_START[g.kind] ?? '{festival} begins {at}.';
      this.live(e.t, cap(template.replace('{at}', at).replace('{festival}', g.label)));
      return;
    }
    if (g.kind === 'trade_cart' || g.kind === 'musician' || g.kind === 'market') {
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
    if (d.status === 'approved') text = `The steward approves ${what}. ${this.name(d.proposer)} is delighted.`;
    else if (d.status === 'declined') text = `The steward declines ${what}. ${this.name(d.proposer)} is disappointed.`;
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
      case 'argue': {
        const about = e.topic ? ` about ${this.subjectName(e.topic.subject)}` : '';
        text = `${at}${a} and ${b} have words${about}. ${this.voice(e.a, SPEECH.argue, { other: b })}`;
        break;
      }
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
    const important = e.kind === 'argue' || e.kind === 'apologize' || e.kind === 'comfort';
    if (!important && !this.opts.verbose && this.exchangeLinesToday >= this.opts.exchangeLinesPerDay) return;
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

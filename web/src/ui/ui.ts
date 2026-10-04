// The paper UI around the diorama: clock, stores and speed; the scroll (notice board, town
// log, journal, and how the town sees you); the build menu; decision popups; the introduction;
// and thought bubbles. Everything it changes, it changes through Game.command.

import { buildingDef } from '../../../src/content/buildings.js';
import { residentDef } from '../../../src/content/residents.js';
import { DILEMMA_NAMES, PROPOSALS } from '../../../src/content/story.js';
import { residentReport, type ResidentReport } from '../../../src/inspect/inspector.js';
import type { NarratorEntry } from '../../../src/narrate/narrator.js';
import { CLEAR_MINUTES, FAVOUR_MINUTES, considerFavour, openPlots, recentAsks } from '../../../src/sim/favours.js';
import { opinion } from '../../../src/sim/mind/memory.js';
import { ambientPrefs, prefScore } from '../../../src/sim/needs.js';
import { wishProgress } from '../../../src/sim/story/director.js';
import { dilemmaDef, stanceScore } from '../../../src/sim/story/dilemmas.js';
import { clock, dayOf, seasonOf } from '../../../src/sim/time.js';
import type { Dilemma, FavourKind, QualityMap, Request, ResidentState, SimEvent, TalkQuestion } from '../../../src/sim/types.js';
import { SPEEDS, type Game } from '../game.js';
import { residentColor } from '../view/meshes.js';
import { greenAroundHome } from '../../../src/sim/world.js';
import { GREEN_ENOUGH } from '../../../src/sim/asks.js';
import type { TownView } from '../view/scene.js';

export const BUILD_MENU: Array<{ category: string; types: string[] }> = [
  { category: 'Green and decor', types: ['hedge', 'flowerbed', 'bench'] },
  { category: 'Gathering', types: ['teahouse', 'commons', 'well'] },
  { category: 'Work and food', types: ['garden', 'jetty', 'woodlot', 'bakery', 'workshop'] },
  { category: 'Homes', types: ['cottage'] },
  { category: 'Dreams', types: ['orchard', 'glasshouse', 'banner'] },
];
interface TalkPanel {
  root: HTMLElement;
  reply: HTMLElement;
  status: HTMLElement;
  controls: Array<HTMLButtonElement | HTMLSelectElement>;
  clear: HTMLButtonElement;
  aboutSelect: HTMLSelectElement;
  visitSelect: HTMLSelectElement;
  mendSelect: HTMLSelectElement;
}

const QUESTIONS: Array<[TalkQuestion, string]> = [
  ['how', 'How are you?'],
  ['mind', "What's on your mind?"],
  ['hope', 'What are you hoping for?'],
  ['me', 'What do you think of me?'],
];

const FAVOUR_LABELS: Record<FavourKind, string> = {
  timber: 'Cut timber',
  catch: 'Bring in a catch',
  garden: 'Work the garden',
  clear: 'Help clear wild land',
  visit: 'Look in on…',
  mend: 'Make peace with…',
};

const FAVOUR_DOING: Record<FavourKind, string> = {
  timber: 'cutting timber',
  catch: 'fishing',
  garden: 'working the garden',
  clear: 'clearing wild land',
  visit: 'going to see someone',
  mend: 'going to make peace',
};

/** The two ends of each trait slider. */
const TRAIT_ENDS: Record<string, [string, string]> = {
  sociable: ['reserved', 'sociable'],
  steady: ['excitable', 'steady'],
  curious: ['settled', 'curious'],
  generous: ['guarded', 'generous'],
  tidy: ['messy', 'tidy'],
};

/** A refusal reason, briefly, for lists. */
const REFUSAL_WORDS: Record<string, string> = {
  asleep: 'asleep',
  busy: 'busy with another favour',
  unwell: 'unwell',
  tired: 'tired',
  low: 'feeling low',
  asked_often: 'asked a lot lately',
  distrust: "doesn't trust you enough",
  not_speaking: 'not speaking to them',
  nowhere: 'nowhere to do it',
  gone: 'gone',
};

type LogFilter = 'highlights' | 'story' | 'everything';
const LOG_FILTERS: Array<[LogFilter, string, string]> = [
  ['highlights', 'Highlights', 'Only what really matters: asks, decisions, comings and goings, quarrels, dreams'],
  ['story', 'Story', 'Everything except passing thoughts and small talk'],
  ['everything', 'Everything', 'Every thought and word'],
];
/** Lines about the same resident within this many minutes fold together. */
const FOLD_MINUTES = 60;

export type Tool = { kind: 'select' } | { kind: 'build'; type: string } | { kind: 'remove' };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

const pct = (v: number) => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
const cssColor = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

const QUALITY_WORDS: Record<string, [string, string]> = {
  noise: ['noise', 'absorbs noise'],
  bustle: ['bustle', 'calm'],
  green: ['green', 'bare'],
  scent: ['scent', ''],
  water: ['water', ''],
};

const ASK_TITLES: Record<Request['kind'], string> = {
  aspiration: 'asks for help with a dream',
  quieter_home: 'asks for quieter nights',
  workplace: 'asks for a place to work',
  more_food: 'asks for more food',
  somewhere_to_sit: 'asks for somewhere to sit',
  more_green: 'asks for more green',
  place_to_gather: 'asks for another place to gather',
};

const ASK_HINTS: Record<Request['kind'], string> = {
  aspiration: 'It matters a great deal to them. Find it in the Build menu.',
  quieter_home: 'A hedge between the noise and their home softens it.',
  workplace: 'Build what they need from the Build menu.',
  more_food: 'Gardens and the fishing jetty fill the larder; gardens grow little in winter.',
  somewhere_to_sit: 'A bench within a few steps of their home.',
  more_green: 'A flower bed or hedge right beside their home counts in full; two tiles away, half.',
  place_to_gather: 'Another place to sit together: a bench, or a teahouse.',
};

const INTRO = [
  {
    title: 'Welcome to the valley',
    body: 'Six people live here: Ada, Bram, Fen, Juniper, Marlow and Wren. They have homes, work, habits and opinions. They notice things and remember them, and they talk.',
  },
  {
    title: 'You are the steward',
    body: 'When they talk about "the steward", they mean you. You decide what gets built and taken away, you answer their proposals, and you hear their requests. They will make up their minds about you from what you do, and they will tell each other.',
  },
  {
    title: 'How to look after the place',
    body: "The notice board shows what people are asking for and the season's Town Wishes. Click anyone to read their journal and see why they feel as they do. Build from the Build menu: buildings cost timber, gardens and the jetty fill the larder. Drag to move, right-drag to turn the view, wheel to zoom.",
  },
];

export class Ui {
  tool: Tool = { kind: 'select' };
  rotation = 0;
  selected: { kind: 'resident'; id: string } | { kind: 'building'; id: number } | null = null;
  private readonly game: Game;
  private readonly view: TownView;
  private readonly root: HTMLElement;
  private readonly clockEl: HTMLElement;
  private readonly stockEl: HTMLElement;
  private readonly speedButtons: HTMLButtonElement[] = [];
  private readonly tabs = new Map<string, { button: HTMLButtonElement; pane: HTMLElement }>();
  private readonly scroll: HTMLElement;
  private readonly boardEl: HTMLElement;
  private readonly logEl: HTMLElement;
  private readonly journalEl: HTMLElement;
  private readonly youEl: HTMLElement;
  private readonly menu: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly bubbles = new Map<string, { el: HTMLElement; until: number }>();
  private readonly bubbleLayer: HTMLElement;
  private readonly openWhy = new Set<string>();
  private readonly standingNotes = new Map<string, string[]>();
  private readonly shownDilemmas = new Set<number>();
  private modal: HTMLElement | null = null;
  private speedBeforeModal = 1;
  private lastBoardKey = '';
  private lastJournalRender = 0;
  private lastYouRender = 0;
  private morning: NarratorEntry[] = [];
  /** One talk panel per resident, kept across journal redraws so its choices stay put. */
  private readonly talkPanels = new Map<string, TalkPanel>();
  /** On-screen panels that speech bubbles must not cover. */
  private readonly panels: HTMLElement[] = [];
  /** The log's list, its filter, and the run of lines being folded together. */
  private logList!: HTMLElement;
  private logFilter: LogFilter = 'story';
  private logGroup: { who: string; t: number; extra: HTMLElement; toggle: HTMLButtonElement; count: number } | null = null;

  constructor(root: HTMLElement, game: Game, view: TownView, opts: { intro: boolean }) {
    this.game = game;
    this.view = view;
    this.root = root;

    // Clock, stores and speed.
    const hud = el('div', { class: 'hud paper' });
    this.clockEl = el('div', { class: 'clock', 'data-testid': 'clock' });
    this.stockEl = el('div', { class: 'stock', 'data-testid': 'stock' });
    const speeds = el('div', { class: 'speeds' });
    const labels = ['❚❚', '▶', '▶▶', '▶▶▶', '⏩'];
    SPEEDS.forEach((s, i) => {
      const b = el('button', { title: s === 0 ? 'Pause (space)' : `${s}× (${i})`, 'data-testid': `speed-${i}` }, labels[i]);
      b.addEventListener('click', () => this.setSpeed(i));
      speeds.appendChild(b);
      this.speedButtons.push(b);
    });
    const rot = el('div', { class: 'speeds' });
    const left = el('button', { title: 'Turn left (Q). Or right-drag to turn freely.' }, '⟲');
    const right = el('button', { title: 'Turn right (E). Or right-drag to turn freely.' }, '⟳');
    const help = el('button', { title: 'How to play', 'data-testid': 'help' }, '?');
    left.addEventListener('click', () => view.rotate(-1));
    right.addEventListener('click', () => view.rotate(1));
    help.addEventListener('click', () => this.showIntro());
    rot.append(left, right, help);
    hud.append(el('div', { class: 'title' }, 'Townlet'), this.clockEl, this.stockEl, speeds, rot);
    root.appendChild(hud);
    this.panels.push(hud);

    // The scroll: rolls up to its top rod.
    this.scroll = el('aside', { class: 'scroll', 'data-testid': 'scroll' });
    const rodTop = el('div', { class: 'rod top' });
    const tabBar = el('nav', { class: 'tabs' });
    const roll = el('button', { class: 'roll', title: 'Roll up or unroll', 'data-testid': 'roll' }, '▴');
    roll.addEventListener('click', () => this.toggleScroll());
    rodTop.append(tabBar, roll);
    const body = el('div', { class: 'scroll-body' });
    this.scroll.append(rodTop, body, el('div', { class: 'rod bottom' }));
    for (const [key, label] of [
      ['board', 'Notice board'],
      ['log', 'Town log'],
      ['journal', 'Journal'],
      ['you', 'You'],
    ] as const) {
      const button = el('button', { 'data-testid': `tab-${key}` }, label);
      const pane = el('section', { class: 'pane', 'data-pane': key });
      button.addEventListener('click', () => this.showTab(key));
      tabBar.appendChild(button);
      body.appendChild(pane);
      this.tabs.set(key, { button, pane });
    }
    this.boardEl = this.tabs.get('board')!.pane;
    this.logEl = this.tabs.get('log')!.pane;
    this.buildLogPane();
    this.journalEl = this.tabs.get('journal')!.pane;
    this.youEl = this.tabs.get('you')!.pane;
    root.appendChild(this.scroll);
    this.panels.push(this.scroll);
    this.showTab('board');

    // The dock: look, build menu, remove, and a status line.
    const dock = el('div', { class: 'dock paper' });
    const look = el('button', { 'data-testid': 'tool-select', title: 'Look and inspect (Esc)' }, 'Look');
    look.addEventListener('click', () => this.setTool({ kind: 'select' }));
    const build = el('button', { 'data-testid': 'open-build' }, 'Build ▾');
    build.addEventListener('click', () => this.toggleMenu());
    const remove = el('button', { 'data-testid': 'tool-remove' }, 'Remove');
    remove.addEventListener('click', () => this.setTool({ kind: 'remove' }));
    this.statusEl = el('div', { class: 'status', 'data-testid': 'palette-status' });
    dock.append(look, build, remove, this.statusEl);
    root.appendChild(dock);
    this.panels.push(dock);
    this.menu = this.buildMenu();
    this.menu.hidden = true;
    root.appendChild(this.menu);
    this.panels.push(this.menu);

    this.bubbleLayer = el('div', { class: 'bubbles' });
    root.appendChild(this.bubbleLayer);

    game.narrator.onEntry((e) => this.onEntry(e));
    game.onEvent((e) => this.onEvent(e));
    this.setSpeed(game.speedIndex);
    this.setTool({ kind: 'select' });
    if (opts.intro) this.showIntro();
  }

  // ---------------------------------------------------------------- controls

  setSpeed(i: number): void {
    this.game.speedIndex = Math.max(0, Math.min(SPEEDS.length - 1, i));
    this.speedButtons.forEach((b, j) => b.classList.toggle('on', j === this.game.speedIndex));
  }

  setTool(tool: Tool): void {
    this.tool = tool;
    this.menu.hidden = true;
    this.view.setGhost(tool.kind === 'build' ? tool.type : null, null, false, this.rotation);
    this.view.highlightBuilding(null);
    this.status(
      tool.kind === 'build'
        ? `Placing a ${buildingDef(tool.type).name.toLowerCase()} (${buildingDef(tool.type).cost ?? 0} timber). R rotates · Esc stops.`
        : tool.kind === 'remove'
          ? 'Click a building to remove it (half its timber back). Homes stay. Esc stops.'
          : 'Click someone or a building. Drag to move, right-drag to turn, wheel to zoom.',
    );
  }

  rotate(): void {
    this.rotation = (this.rotation + 1) % 4;
  }

  status(text: string): void {
    this.statusEl.textContent = text;
  }

  get modalOpen(): boolean {
    return this.modal !== null;
  }

  showTab(key: string): void {
    for (const [k, t] of this.tabs) {
      t.button.classList.toggle('on', k === key);
      t.pane.hidden = k !== key;
    }
    if (this.scroll.classList.contains('rolled')) this.toggleScroll();
    if (key === 'journal') this.renderJournal(true);
    if (key === 'log') this.logEl.scrollTop = this.logEl.scrollHeight;
    if (key === 'you') this.renderYou(true);
  }

  toggleScroll(): void {
    const rolled = this.scroll.classList.toggle('rolled');
    const roll = this.scroll.querySelector('.roll');
    if (roll) roll.textContent = rolled ? '▾' : '▴';
  }

  select(target: Ui['selected']): void {
    this.selected = target;
    this.view.highlightBuilding(target?.kind === 'building' ? target.id : null);
    this.showTab('journal');
  }

  // ---------------------------------------------------------------- build menu

  private toggleMenu(): void {
    this.menu.hidden = !this.menu.hidden;
    if (!this.menu.hidden) this.refreshMenu();
  }

  /** What a building gives off, in words. */
  private givesOff(type: string): string {
    const def = buildingDef(type);
    const parts: string[] = [];
    for (const [q, v] of Object.entries(def.emits) as Array<[keyof QualityMap, number]>) {
      const words = QUALITY_WORDS[q];
      if (!words) continue;
      if (v > 0) parts.push(words[0]);
      else if (v < 0 && words[1]) parts.push(words[1]);
    }
    for (const [q, v] of Object.entries(def.emitsWhenWorked ?? {}) as Array<[keyof QualityMap, number]>) {
      if (v > 0) parts.push(`${QUALITY_WORDS[q]?.[0] ?? q} while worked${def.shift ? ` (${hhmm(def.shift[0])}–${hhmm(def.shift[1])})` : ''}`);
    }
    const made = Object.entries(def.produces ?? {}).map(([r]) => `makes ${r}`);
    return [...parts, ...made].join(', ') || 'nothing in particular';
  }

  /** Who is likely to welcome it, from their tastes and values. */
  private likelyToPlease(type: string): string[] {
    const def = buildingDef(type);
    const emits: QualityMap = { noise: 0, bustle: 0, green: 0, scent: 0, water: 0, ...def.emits };
    return this.game.sim.state.order.filter((id) => {
      const r = residentDef(id);
      const taste = prefScore(ambientPrefs(r), emits);
      const value = def.kind === 'social' ? r.values.community : def.kind === 'work' ? Math.max(r.values.craft, r.values.prosperity) : Math.max(r.values.beauty, r.values.nature);
      return !this.game.sim.resident(id).departed && (taste > 0.25 || value >= 0.7 || r.job === type);
    });
  }

  private buildMenu(): HTMLElement {
    const menu = el('div', { class: 'menu paper', 'data-testid': 'build-menu' });
    const head = el('div', { class: 'menu-head' });
    head.append(el('h3', {}, 'Build'), el('span', { class: 'quiet', 'data-menu-timber': '' }));
    const close = el('button', {}, '✕');
    close.addEventListener('click', () => (menu.hidden = true));
    head.appendChild(close);
    menu.appendChild(head);
    for (const group of BUILD_MENU) {
      menu.appendChild(el('h4', {}, group.category));
      const row = el('div', { class: 'cards' });
      for (const type of group.types) {
        const def = buildingDef(type);
        const card = el('button', { class: 'build-card', 'data-testid': `tool-build-${type}`, 'data-type': type });
        card.appendChild(el('div', { class: 'card-title' }, def.name));
        card.appendChild(el('div', { class: 'cost' }, `${def.cost ?? 0} timber`));
        if (def.blurb) card.appendChild(el('div', { class: 'blurb' }, def.blurb));
        card.appendChild(el('div', { class: 'gives', 'data-testid': 'gives-off' }, `Gives off: ${this.givesOff(type)}`));
        card.appendChild(el('div', { class: 'likes', 'data-likes': '' }));
        card.addEventListener('click', () => {
          if (!this.game.sim.canAfford(type)) {
            this.status(`Not enough timber for a ${def.name.toLowerCase()} (${def.cost} needed).`);
            return;
          }
          this.setTool({ kind: 'build', type });
        });
        row.appendChild(card);
      }
      menu.appendChild(row);
    }
    return menu;
  }

  private refreshMenu(): void {
    const timber = Math.floor(this.game.sim.state.stock.timber);
    const t = this.menu.querySelector('[data-menu-timber]');
    if (t) t.textContent = `${timber} timber in store`;
    for (const card of this.menu.querySelectorAll<HTMLElement>('.build-card')) {
      const type = card.dataset.type as string;
      card.classList.toggle('unaffordable', !this.game.sim.canAfford(type));
      const likes = card.querySelector('[data-likes]');
      const who = this.likelyToPlease(type).map((id) => residentDef(id).name);
      if (likes) likes.textContent = who.length ? `Likely to please: ${who.join(', ')}` : '';
    }
  }

  // ---------------------------------------------------------------- modals

  private openModal(content: HTMLElement): void {
    this.closeModal();
    this.speedBeforeModal = this.game.speedIndex || 1;
    this.setSpeed(0);
    const back = el('div', { class: 'modal-back' });
    const card = el('div', { class: 'modal paper scroll-paper' });
    card.appendChild(content);
    back.appendChild(card);
    this.root.appendChild(back);
    this.modal = back;
  }

  private closeModal(): void {
    if (!this.modal) return;
    this.modal.remove();
    this.modal = null;
    this.setSpeed(this.speedBeforeModal);
  }

  showIntro(page = 0): void {
    const p = INTRO[page];
    if (!p) {
      this.closeModal();
      return;
    }
    const c = el('div', { 'data-testid': 'intro' });
    c.appendChild(el('h2', {}, p.title));
    c.appendChild(el('p', {}, p.body));
    const row = el('div', { class: 'modal-buttons' });
    const next = el('button', { class: 'primary', 'data-testid': 'intro-next' }, page === INTRO.length - 1 ? 'Begin' : 'Next');
    next.addEventListener('click', () => this.showIntro(page + 1));
    row.appendChild(next);
    c.appendChild(row);
    this.openModal(c);
  }

  /** A proposal waiting on the steward gets its own popup, so it can't be missed. */
  private showDilemma(d: Dilemma): void {
    if (this.modal) return;
    this.shownDilemmas.add(d.id);
    const def = residentDef(d.proposer);
    const lines = PROPOSALS[d.type];
    const c = el('div', { 'data-testid': 'decision' });
    c.appendChild(el('div', { class: 'eyebrow' }, 'A decision for you'));
    c.appendChild(el('h2', {}, `${def.name} has a proposal: ${DILEMMA_NAMES[d.type]}`));
    c.appendChild(el('p', { class: 'quote' }, `“${(lines[def.voice.register] ?? lines.plain)[0]}”`));
    const glad: string[] = [];
    const not: string[] = [];
    for (const id of this.game.sim.state.order) {
      if (id === d.proposer || this.game.sim.resident(id).departed) continue;
      const s = stanceScore(this.game.sim.resident(id), dilemmaDef(d.type));
      if (s > 0.3) glad.push(residentDef(id).name);
      else if (s < -0.3) not.push(residentDef(id).name);
    }
    c.appendChild(el('p', {}, `Talk around town: ${glad.length ? `${glad.join(', ')} would welcome it` : 'nobody else is keen'}${not.length ? `; ${not.join(', ')} would rather not` : ''}.`));
    c.appendChild(el('p', { class: 'quiet' }, 'If you never answer, that is an answer too: unanswered proposals lapse after two days.'));
    const row = el('div', { class: 'modal-buttons' });
    const yes = el('button', { class: 'primary', 'data-testid': `approve-${d.id}` }, 'Approve');
    const no = el('button', { 'data-testid': `decline-${d.id}` }, 'Decline');
    const later = el('button', { 'data-testid': `later-${d.id}` }, 'Decide later');
    yes.addEventListener('click', () => {
      this.game.command({ kind: 'decide', dilemma: d.type, option: 'approve' });
      this.closeModal();
    });
    no.addEventListener('click', () => {
      this.game.command({ kind: 'decide', dilemma: d.type, option: 'decline' });
      this.closeModal();
    });
    later.addEventListener('click', () => this.closeModal());
    row.append(yes, no, later);
    c.appendChild(row);
    this.openModal(c);
  }

  // ---------------------------------------------------------------- the log and bubbles

  private nameLinks(text: string): Node[] {
    const ids = this.game.sim.state.order;
    const pattern = new RegExp(`\\b(${ids.map((id) => residentDef(id).name).join('|')})\\b`, 'g');
    const nodes: Node[] = [];
    let last = 0;
    for (const m of text.matchAll(pattern)) {
      if (m.index === undefined) continue;
      nodes.push(document.createTextNode(text.slice(last, m.index)));
      const id = ids.find((x) => residentDef(x).name === m[1]) as string;
      const a = el('a', { href: '#', class: 'who' }, m[1]);
      a.style.borderBottomColor = cssColor(residentColor(id));
      a.addEventListener('click', (ev) => {
        ev.preventDefault();
        this.select({ kind: 'resident', id });
      });
      nodes.push(a);
      last = m.index + (m[1]?.length ?? 0);
    }
    nodes.push(document.createTextNode(text.slice(last)));
    return nodes;
  }

  private buildLogPane(): void {
    const bar = el('div', { class: 'log-filter', role: 'group', 'aria-label': 'Show' });
    for (const [key, label, title] of LOG_FILTERS) {
      const b = el('button', { 'data-testid': `log-${key}`, title }, label);
      b.classList.toggle('on', key === this.logFilter);
      b.addEventListener('click', () => {
        this.logFilter = key;
        for (const x of bar.querySelectorAll('button')) x.classList.toggle('on', x === b);
        this.rerenderLog();
      });
      bar.appendChild(b);
    }
    this.logList = el('div', { class: 'log-list', 'data-testid': 'log-list' });
    this.logEl.append(bar, this.logList);
  }

  private passes(e: NarratorEntry): boolean {
    if (e.kind === 'day') return true;
    if (this.logFilter === 'highlights') return e.importance === 'major';
    if (this.logFilter === 'story') return e.importance !== 'minor';
    return true;
  }

  private rerenderLog(): void {
    this.logList.replaceChildren();
    this.logGroup = null;
    const shown = this.game.narrator.entries.filter((e) => this.passes(e)).slice(-400);
    for (const e of shown) this.appendLog(e);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  private logRow(e: NarratorEntry): HTMLElement {
    const row = el('div', { class: `entry ${e.kind} ${e.importance}` });
    if (e.kind === 'day') row.textContent = e.text;
    else {
      if (e.kind === 'live' || e.kind === 'thought') row.appendChild(el('span', { class: 'time' }, clock(e.t)));
      for (const n of this.nameLinks(e.text)) row.appendChild(n);
    }
    return row;
  }

  /** Add a line to the log, folding a run of lines about the same resident under the first. */
  private appendLog(e: NarratorEntry): void {
    const row = this.logRow(e);
    const who = e.who[0];
    const foldable = (e.kind === 'live' || e.kind === 'thought' || e.kind === 'aside') && e.importance !== 'major' && who !== undefined;
    const g = this.logGroup;
    if (foldable && g && g.who === who && e.t - g.t <= FOLD_MINUTES) {
      g.extra.appendChild(row);
      g.count++;
      g.t = e.t;
      g.toggle.hidden = false;
      g.toggle.textContent = g.extra.hidden ? `+${g.count} more from ${residentDef(who).name}` : 'fewer';
      return;
    }
    const group = el('div', { class: 'log-group' });
    group.appendChild(row);
    if (foldable) {
      const extra = el('div', { class: 'fold' });
      extra.hidden = true;
      const toggle = el('button', { class: 'more', 'data-testid': 'log-more' });
      toggle.hidden = true;
      const fold = { who, t: e.t, extra, toggle, count: 0 };
      toggle.addEventListener('click', () => {
        extra.hidden = !extra.hidden;
        toggle.textContent = extra.hidden ? `+${fold.count} more from ${residentDef(who).name}` : 'fewer';
      });
      group.append(extra, toggle);
      this.logGroup = fold;
    } else this.logGroup = null;
    this.logList.appendChild(group);
    while (this.logList.childElementCount > 400) this.logList.firstElementChild?.remove();
  }

  private onEntry(e: NarratorEntry): void {
    if (e.kind === 'day') this.morning = [];
    if (e.kind === 'board') this.morning.push(e);
    if (this.passes(e)) {
      const atBottom = this.logEl.scrollTop + this.logEl.clientHeight >= this.logEl.scrollHeight - 30;
      this.appendLog(e);
      if (atBottom) this.logEl.scrollTop = this.logEl.scrollHeight;
    }

    // A quoted line becomes a bubble over whoever speaks first in it.
    const quote = /"([^"]+)"/.exec(e.text);
    if (quote && (e.kind === 'live' || e.kind === 'aside' || e.kind === 'thought') && e.who.length > 0) {
      const speaker = [...e.who].sort((a, b) => e.text.indexOf(residentDef(a).name) - e.text.indexOf(residentDef(b).name))[0] as string;
      this.bubble(speaker, quote[1] as string, e.kind === 'thought' ? 'thought' : e.importance === 'major' ? 'major' : '');
    }
    this.lastBoardKey = '';
  }

  private onEvent(e: SimEvent): void {
    if (e.type === 'standing') {
      const notes = this.standingNotes.get(e.who) ?? [];
      notes.unshift(`${e.delta > 0 ? '▲' : '▼'} Day ${dayOf(e.t)}: ${e.reasons.join('; ')}`);
      this.standingNotes.set(e.who, notes.slice(0, 5));
      this.bubble(e.who, e.delta > 0 ? `♥ Thinks better of you: ${e.reasons[0]}` : `☁ Thinks less of you: ${e.reasons[0]}`, e.delta > 0 ? 'up' : 'down');
    }
  }

  private bubble(id: string, text: string, mood = ''): void {
    let b = this.bubbles.get(id);
    if (!b) {
      b = { el: el('div', { class: 'bubble' }), until: 0 };
      b.el.style.borderColor = cssColor(residentColor(id));
      this.bubbleLayer.appendChild(b.el);
      this.bubbles.set(id, b);
    }
    b.el.className = `bubble ${mood}`;
    b.el.textContent = text.length > 90 ? `${text.slice(0, 87)}…` : text;
    b.until = performance.now() + 7000;
  }

  // ---------------------------------------------------------------- the notice board

  private renderBoard(): void {
    const state = this.game.sim.state;
    const open = state.story.dilemmas.filter((d) => d.status === 'open');
    const requests = state.requests.filter((q) => q.status === 'open');
    const wishes = state.story.wishes.filter((w) => w.status === 'open');
    const progress = wishes.map((w) => wishProgress(state, w).met);
    const key = JSON.stringify([open.map((d) => d.id), requests.map((q) => q.id), wishes.map((w) => w.id), progress, this.morning.length, dayOf(state.tick), state.buildings.length]);
    if (key === this.lastBoardKey) return;
    this.lastBoardKey = key;
    const pane = this.boardEl;
    pane.replaceChildren();

    pane.appendChild(el('h3', {}, 'Town Wishes this season'));
    if (wishes.length === 0) pane.appendChild(el('p', { class: 'quiet' }, 'No wishes outstanding.'));
    for (const w of wishes) {
      const p = wishProgress(state, w);
      const card = el('div', { class: 'card wish', 'data-testid': `wish-${w.id}` });
      card.appendChild(el('div', { class: 'card-title' }, w.label));
      card.appendChild(el('p', { class: 'quiet' }, `${p.met} of ${p.of} who wished for it have it: ${w.supporters.map((id) => residentDef(id).name).join(', ')}.`));
      if (w.kind === 'more_green') card.appendChild(el('p', { class: 'quiet', 'data-testid': 'green-progress' }, w.supporters.map((id) => this.greenLine(id)).join(' · ')));
      const track = el('div', { class: 'track' });
      const fill = el('div', { class: 'fill' });
      fill.style.width = pct(p.of ? p.met / p.of : 0);
      track.appendChild(fill);
      card.appendChild(track);
      pane.appendChild(card);
    }

    if (open.length) {
      pane.appendChild(el('h3', {}, 'Waiting on your decision'));
      for (const d of open) {
        const card = el('div', { class: 'card' });
        card.appendChild(el('div', { class: 'card-title' }, `${residentDef(d.proposer).name}: ${DILEMMA_NAMES[d.type]}`));
        const go = el('button', { class: 'primary', 'data-testid': `decide-${d.id}` }, 'Decide…');
        go.addEventListener('click', () => this.showDilemma(d));
        card.appendChild(go);
        pane.appendChild(card);
      }
    }

    pane.appendChild(el('h3', {}, 'Asked of you'));
    if (requests.length === 0) pane.appendChild(el('p', { class: 'quiet' }, 'Nobody is asking for anything just now.'));
    for (const q of requests) {
      const card = el('div', { class: 'card', 'data-testid': `request-${q.id}` });
      const who = residentDef(q.by);
      card.appendChild(el('div', { class: 'card-title' }, `${who.name} ${ASK_TITLES[q.kind]}${q.wants ? `: a ${buildingDef(q.wants).name.toLowerCase()}` : ''}`));
      if (q.kind === 'quieter_home') card.appendChild(el('p', {}, `${cap(this.game.narrator.statement(q.by, { subject: q.subject, aspect: 'noisy_at_night' }))}.`));
      if (q.kind === 'more_green') card.appendChild(el('p', { 'data-testid': 'green-progress' }, this.greenLine(q.by)));
      card.appendChild(el('p', { class: 'quiet' }, ASK_HINTS[q.kind]));
      const show = el('button', {}, 'Show me');
      show.addEventListener('click', () => {
        const home = state.buildings.find((b) => b.id === this.game.sim.resident(q.by).homeId);
        if (home) this.view.focusOn(home.x + 1, home.y + 1);
      });
      card.appendChild(show);
      pane.appendChild(card);
    }

    pane.appendChild(el('h3', {}, 'This morning'));
    if (this.morning.length === 0) pane.appendChild(el('p', { class: 'quiet' }, 'Nothing new on the board.'));
    const list = el('ul');
    for (const e of this.morning) {
      if (e.importance === 'minor') continue;
      const li = el('li', { class: e.importance });
      for (const n of this.nameLinks(e.text)) li.appendChild(n);
      list.appendChild(li);
    }
    pane.appendChild(list);
  }

  /** How green it is around someone's home, against what satisfies them. */
  private greenLine(id: string): string {
    const state = this.game.sim.state;
    const home = state.buildings.find((b) => b.id === this.game.sim.resident(id).homeId);
    if (!home) return '';
    const g = greenAroundHome(state, home);
    return `${residentDef(id).name}: ${g >= GREEN_ENOUGH ? 'green enough ✓' : `${Math.round((g / GREEN_ENOUGH) * 100)}% green enough`}`;
  }

  // ---------------------------------------------------------------- how the town sees you

  private renderYou(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastYouRender < 800) return;
    this.lastYouRender = now;
    const pane = this.youEl;
    pane.replaceChildren();
    pane.appendChild(el('h3', {}, 'How the town sees you'));
    pane.appendChild(el('p', { class: 'quiet' }, 'Everything you do, and everything you leave undone, is weighed by each resident in their own way.'));
    for (const id of this.game.sim.state.order) {
      const r = this.game.sim.resident(id);
      const def = residentDef(id);
      const card = el('div', { class: 'card', 'data-testid': `standing-${id}` });
      const a = r.rel.steward?.affinity ?? 0;
      const word = r.departed
        ? 'has left'
        : a > 0.5
          ? 'thinks the world of you'
          : a > 0.2
            ? 'thinks well of you'
            : a > -0.15
              ? `is making up ${def.pronouns.poss} mind`
              : a > -0.5
                ? 'is unhappy with you'
                : 'has lost faith in you';
      const title = el('div', { class: 'card-title' }, `${def.name} ${word}`);
      title.style.borderLeft = `4px solid ${cssColor(residentColor(id))}`;
      title.style.paddingLeft = '6px';
      card.appendChild(title);
      const track = el('div', { class: 'track two-sided' });
      const fill = el('div', { class: `fill ${a < 0 ? 'neg' : ''}` });
      fill.style.left = a >= 0 ? '50%' : pct(0.5 + a / 2);
      fill.style.width = pct(Math.abs(a) / 2);
      track.appendChild(fill);
      card.appendChild(track);
      const beliefs = Object.values(r.beliefs).filter((b) => b.subject === 'steward');
      if (beliefs.length) card.appendChild(el('p', {}, beliefs.map((b) => `${cap(this.game.narrator.statement(id, b))}.`).join(' ')));
      const notes = this.standingNotes.get(id);
      if (notes?.length) {
        const ul = el('ul', { class: 'quiet' });
        for (const n of notes) ul.appendChild(el('li', {}, n));
        card.appendChild(ul);
      }
      pane.appendChild(card);
    }
  }

  // ---------------------------------------------------------------- the journal

  private why(summary: string, cls: string, testid: string): HTMLDetailsElement {
    const det = el('details', { class: cls, 'data-testid': testid });
    det.appendChild(el('summary', cls.includes('forming') ? { class: 'quiet' } : {}, summary));
    det.open = this.openWhy.has(summary);
    det.addEventListener('toggle', () => {
      if (det.open) this.openWhy.add(summary);
      else this.openWhy.delete(summary);
    });
    return det;
  }

  // ---------------------------------------------------------------- talking and favours

  private talkPanel(id: string): HTMLElement {
    let p = this.talkPanels.get(id);
    if (!p) {
      p = this.buildTalkPanel(id);
      this.talkPanels.set(id, p);
    }
    this.refreshTalkPanel(id, p);
    return p.root;
  }

  private buildTalkPanel(id: string): TalkPanel {
    const name = residentDef(id).name;
    const root = el('div', { class: 'talk', 'data-testid': 'talk' });
    root.appendChild(el('h3', {}, `Talk with ${name}`));
    const controls: Array<HTMLButtonElement | HTMLSelectElement> = [];
    const ask = (question: TalkQuestion, about?: string) => {
      this.game.command({ kind: 'talk', who: id, question, ...(about ? { about } : {}) });
      this.renderJournal(true);
    };
    const qs = el('div', { class: 'talk-row' });
    for (const [q, label] of QUESTIONS) {
      const b = el('button', { 'data-testid': `ask-${q}` }, label);
      b.addEventListener('click', () => ask(q));
      qs.appendChild(b);
      controls.push(b);
    }
    root.appendChild(qs);
    const aboutRow = el('div', { class: 'talk-row' });
    const aboutSelect = el('select', { 'data-testid': 'ask-about' });
    const aboutButton = el('button', { 'data-testid': 'ask-opinion' }, 'What do you think of…');
    aboutButton.addEventListener('click', () => ask('opinion', aboutSelect.value));
    aboutRow.append(aboutButton, aboutSelect);
    root.appendChild(aboutRow);
    controls.push(aboutSelect, aboutButton);

    root.appendChild(el('h3', {}, 'Ask a favour'));
    const favour = (kind: FavourKind, other?: string) => {
      this.game.command({ kind: 'favour', who: id, favour: kind, ...(other ? { other } : {}) });
      this.renderJournal(true);
    };
    const fs = el('div', { class: 'talk-row' });
    let clear!: HTMLButtonElement;
    for (const kind of ['timber', 'catch', 'garden', 'clear'] as FavourKind[]) {
      const b = el('button', { 'data-testid': `favour-${kind}`, title: `About ${Math.round(FAVOUR_MINUTES[kind] / 60)} hours of work` }, FAVOUR_LABELS[kind]);
      b.addEventListener('click', () => favour(kind));
      fs.appendChild(b);
      controls.push(b);
      if (kind === 'clear') clear = b;
    }
    root.appendChild(fs);
    const people = el('div', { class: 'talk-row' });
    const visitSelect = el('select', { 'data-testid': 'favour-visit-who' });
    const visit = el('button', { 'data-testid': 'favour-visit' }, FAVOUR_LABELS.visit);
    visit.addEventListener('click', () => visitSelect.value && favour('visit', visitSelect.value));
    const mendSelect = el('select', { 'data-testid': 'favour-mend-who' });
    const mend = el('button', { 'data-testid': 'favour-mend' }, FAVOUR_LABELS.mend);
    mend.addEventListener('click', () => mendSelect.value && favour('mend', mendSelect.value));
    people.append(visit, visitSelect, mend, mendSelect);
    root.appendChild(people);
    controls.push(visitSelect, visit, mendSelect, mend);

    const reply = el('blockquote', { class: 'reply', 'data-testid': 'talk-reply' });
    const status = el('p', { class: 'quiet', 'data-testid': 'favour-status' });
    root.append(reply, status);
    return { root, reply, status, controls, clear, aboutSelect, visitSelect, mendSelect };
  }

  private fillSelect(sel: HTMLSelectElement, options: Array<[string, string]>): void {
    const key = options.map(([v]) => v).join('|');
    if (sel.dataset.key === key) return;
    const keep = sel.value;
    sel.replaceChildren(...options.map(([v, label]) => el('option', { value: v }, label)));
    sel.dataset.key = key;
    if (options.some(([v]) => v === keep)) sel.value = keep;
  }

  private refreshTalkPanel(id: string, p: TalkPanel): void {
    const state = this.game.sim.state;
    const r = this.game.sim.resident(id);
    const others = state.order.filter((o) => o !== id && !state.residents[o]?.departed);
    const places = state.buildings.filter((b) => !b.removed && b.type !== 'wild' && buildingDef(b.type).kind !== 'home');
    this.fillSelect(p.aboutSelect, [
      ...others.map((o) => [`r:${o}`, residentDef(o).name] as [string, string]),
      ...places.map((b) => [`b:${b.id}`, this.game.narrator.subjectName(`b:${b.id}`)] as [string, string]),
    ]);
    this.fillSelect(p.visitSelect, others.map((o) => [o, residentDef(o).name]));
    const cool = others.filter((o) => (r.rel[o]?.affinity ?? 0) < 0.1);
    this.fillSelect(p.mendSelect, (cool.length ? cool : others).map((o) => [o, residentDef(o).name]));
    const asleep = r.activity?.id === 'sleep' && r.at === r.homeId;
    for (const c of p.controls) c.disabled = asleep || r.departed;
    p.clear.disabled = p.clear.disabled || openPlots(state).length === 0;
    p.clear.title = openPlots(state).length === 0 ? 'No wild land is open for clearing yet: the valley opens as the town thrives' : 'About 6 hours of work';
    const last = this.game.narrator.lastReply;
    p.reply.textContent = asleep ? `${residentDef(id).name} is asleep. Talk in the morning.` : last && last.who === id ? `“${last.text}”` : '';
    p.reply.hidden = p.reply.textContent === '';
    p.status.textContent = this.favourStatus(r);
  }

  private favourStatus(r: ResidentState): string {
    const state = this.game.sim.state;
    const asked = recentAsks(r, state.tick);
    const f = r.favour;
    const doing = f ? `Doing for you: ${FAVOUR_DOING[f.kind]}${f.minutesNeeded > 1 ? ` (${Math.floor(f.minutes / 60)}h of ${Math.round(f.minutesNeeded / 60)}h)` : ''}. ` : '';
    return `${doing}Favours asked this week: ${asked}${asked >= 3 ? ' (that is a lot)' : ''}.`;
  }

  /** A journal section that stays folded unless the player opens it (remembered across redraws). */
  private section(summary: string, key: string): HTMLDetailsElement {
    const det = el('details', { class: 'section', 'data-testid': `section-${key}` });
    det.appendChild(el('summary', {}, summary));
    det.open = this.openWhy.has(`section:${key}`);
    det.addEventListener('toggle', () => {
      if (det.open) this.openWhy.add(`section:${key}`);
      else this.openWhy.delete(`section:${key}`);
    });
    return det;
  }

  private renderJournal(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastJournalRender < 600) return;
    // Mid-choice in the talk panel: refresh it in place rather than redraw (an open dropdown would close).
    const busy = [...this.talkPanels.entries()].find(([, p]) => p.root.isConnected && p.root.contains(document.activeElement));
    if (!force && busy) {
      this.refreshTalkPanel(busy[0], busy[1]);
      this.lastJournalRender = now;
      return;
    }
    if (!force && document.activeElement instanceof HTMLSelectElement && this.journalEl.contains(document.activeElement)) return;
    this.lastJournalRender = now;
    const pane = this.journalEl;
    pane.replaceChildren();
    const roster = el('div', { class: 'roster' });
    for (const id of this.game.sim.state.order) {
      const b = el('button', { 'data-testid': `roster-${id}` }, residentDef(id).name);
      b.style.borderColor = cssColor(residentColor(id));
      b.classList.toggle('on', this.selected?.kind === 'resident' && this.selected.id === id);
      b.addEventListener('click', () => this.select({ kind: 'resident', id }));
      roster.appendChild(b);
    }
    pane.appendChild(roster);
    if (!this.selected) {
      pane.appendChild(el('p', { class: 'quiet' }, 'Click someone in the town, or a name above, to read their journal.'));
      return;
    }
    if (this.selected.kind === 'building') this.renderBuilding(pane, this.selected.id);
    else this.renderResident(pane, residentReport(this.game.sim, this.selected.id, this.game.narrator));
  }

  private renderBuilding(pane: HTMLElement, id: number): void {
    const state = this.game.sim.state;
    const b = state.buildings.find((x) => x.id === id);
    if (!b) return;
    const card = el('div', { class: 'journal', 'data-testid': 'building-card' });
    card.appendChild(el('h2', {}, cap(this.game.narrator.subjectName(`b:${id}`))));
    if (b.type === 'wild') {
      this.renderWild(card, b.id);
      pane.appendChild(card);
      return;
    }
    card.appendChild(
      el('p', { class: 'quiet' }, b.removed ? 'Gone now.' : `${buildingDef(b.type).kind} · ${b.placedBy === 'founding' ? 'here before you' : `built on day ${dayOf(b.placedTick)}`} · gives off ${this.givesOff(b.type)}`),
    );
    if (buildingDef(b.type).kind === 'home') {
      const living = state.order.filter((rid) => !state.residents[rid]?.departed && state.residents[rid]?.homeId === b.id);
      const row = el('div', { class: 'talk-row', 'data-testid': 'home-of' });
      row.appendChild(el('span', { class: 'quiet' }, living.length ? 'Home of:' : 'Nobody lives here yet. Someone new will move in soon.'));
      for (const rid of living) {
        const go = el('button', { 'data-testid': `open-resident-${rid}` }, residentDef(rid).name);
        go.style.borderColor = cssColor(residentColor(rid));
        go.addEventListener('click', () => this.select({ kind: 'resident', id: rid }));
        row.appendChild(go);
      }
      card.appendChild(row);
    }
    card.appendChild(el('h3', {}, 'How people feel about it'));
    const list = el('ul');
    for (const rid of state.order) {
      const v = opinion(this.game.sim.resident(rid), `b:${id}`);
      if (Math.abs(v) < 0.05) continue;
      list.appendChild(el('li', {}, `${residentDef(rid).name}: ${v > 0.3 ? 'loves it' : v > 0 ? 'likes it' : v > -0.3 ? 'not keen' : 'dislikes it'}`));
    }
    if (!list.childElementCount) list.appendChild(el('li', { class: 'quiet' }, 'Nobody has strong feelings yet.'));
    card.appendChild(list);
    pane.appendChild(card);
  }

  /** Wild land: is it open, how far has clearing got, and who could help. */
  private renderWild(card: HTMLElement, id: number): void {
    const state = this.game.sim.state;
    const open = openPlots(state).includes(id);
    const done = state.clearing?.[String(id)] ?? 0;
    card.appendChild(el('p', { class: 'quiet' }, buildingDef('wild').blurb ?? ''));
    card.appendChild(this.meter('Cleared', done / CLEAR_MINUTES));
    if (!open) {
      card.appendChild(el('p', {}, 'Not open for clearing yet. The valley opens next to settled land, once the town is doing well.'));
      return;
    }
    card.appendChild(el('p', {}, `Open for clearing: about ${Math.ceil((CLEAR_MINUTES - done) / 360)} more days of someone's work. Clearing brings in timber, and the land is yours to build on.`));
    const row = el('div', { class: 'talk-row' });
    // Likeliest to say yes first, then whoever you've asked least lately.
    const who = el('select', { 'data-testid': 'clear-who' });
    const people = state.order
      .filter((rid) => !state.residents[rid]?.departed)
      .map((rid) => {
        const r = this.game.sim.resident(rid);
        return { rid, v: considerFavour(state, r, 'clear', undefined, id), asked: recentAsks(r, state.tick) };
      })
      .sort((a, b) => Number(b.v.yes) - Number(a.v.yes) || a.asked - b.asked || b.v.score - a.v.score);
    for (const p of people) {
      const odds = p.v.yes ? 'likely yes' : `unlikely: ${REFUSAL_WORDS[p.v.reason ?? 'distrust']}`;
      who.appendChild(el('option', { value: p.rid }, `${residentDef(p.rid).name} · ${odds} · asked ${p.asked}× this week`));
    }
    const ask = el('button', { 'data-testid': 'clear-ask' }, 'Ask to help clear it');
    ask.addEventListener('click', () => {
      this.game.command({ kind: 'favour', who: who.value, favour: 'clear', plot: id });
      const last = this.game.narrator.lastReply;
      this.status(last && last.who === who.value ? `${residentDef(who.value).name}: “${last.text}”` : '');
    });
    row.append(ask, who);
    card.appendChild(row);
  }

  /** Who they are: traits as two-ended sliders, values as bars. */
  private personality(rep: ResidentReport): HTMLElement {
    const strongest = [...rep.traits].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 2).map(([k, v]) => (TRAIT_ENDS[k] ?? [k, k])[v >= 0 ? 1 : 0]);
    const sec = this.section(`Personality · ${strongest.join(', ')}`, 'personality');
    for (const [k, v] of rep.traits) {
      const [lo, hi] = TRAIT_ENDS[k] ?? [k, k];
      const row = el('div', { class: 'slider', 'data-testid': `trait-${k}` });
      row.appendChild(el('span', { class: 'end' }, lo));
      const track = el('span', { class: 'track' });
      const knob = el('span', { class: 'knob' });
      knob.style.left = pct((v + 1) / 2);
      track.appendChild(knob);
      row.append(track, el('span', { class: 'end' }, hi));
      sec.appendChild(row);
    }
    sec.appendChild(el('p', { class: 'quiet' }, 'Cares about'));
    for (const [k, v] of [...rep.values].sort((a, b) => b[1] - a[1])) {
      const bar = this.meter(cap(k), v);
      bar.className = 'valuebar';
      sec.appendChild(bar);
    }
    return sec;
  }

  private meter(label: string, value: number, setpoint?: number): HTMLElement {
    const row = el('div', { class: 'meter' });
    row.appendChild(el('span', { class: 'label' }, label));
    const track = el('span', { class: 'track' });
    const fill = el('span', { class: 'fill' });
    fill.style.width = pct(value);
    if (setpoint !== undefined && value < setpoint * 0.6) fill.classList.add('low');
    track.appendChild(fill);
    if (setpoint !== undefined) {
      const mark = el('span', { class: 'mark', title: 'what they need' });
      mark.style.left = pct(setpoint);
      track.appendChild(mark);
    }
    row.appendChild(track);
    return row;
  }

  private renderResident(pane: HTMLElement, rep: ResidentReport): void {
    const j = el('div', { class: 'journal', 'data-testid': 'journal' });
    const head = el('h2', {}, `${rep.name}, ${rep.age}`);
    head.style.borderBottomColor = cssColor(residentColor(rep.id));
    j.appendChild(head);
    j.appendChild(el('p', { class: 'quiet' }, rep.background));
    if (rep.hope) {
      const hope = el('div', { class: 'hope', 'data-testid': 'hope' });
      hope.appendChild(el('p', {}, `Hoping to: ${rep.hope.title.charAt(0).toLowerCase()}${rep.hope.title.slice(1)}`));
      const steps = el('span', { class: 'steps' });
      for (let i = 0; i < rep.hope.of; i++) steps.appendChild(el('span', { class: i < rep.hope.stage || rep.hope.done ? 'step done' : 'step' }));
      hope.appendChild(steps);
      hope.appendChild(
        el(
          'p',
          { class: 'quiet', 'data-testid': 'hope-next' },
          rep.hope.done ? (rep.hope.outcome === 'leave' ? 'Decided to go.' : rep.hope.outcome === 'stay' ? 'Decided to stay.' : 'Done!') : `Next: ${rep.hope.next}`,
        ),
      );
      j.appendChild(hope);
    } else j.appendChild(el('p', {}, `Hopes to: ${rep.aspiration.charAt(0).toLowerCase()}${rep.aspiration.slice(1)}`));
    if (rep.departed) {
      j.appendChild(el('p', {}, 'Has left the valley.'));
      pane.appendChild(j);
      return;
    }
    j.appendChild(el('p', { class: 'doing' }, `Now: ${rep.doing}`));
    const homeB = this.game.sim.state.buildings.find((b) => b.id === this.game.sim.resident(rep.id).homeId);
    if (homeB) {
      const homeRow = el('p', { class: 'quiet', 'data-testid': 'home' }, `Lives in: ${this.game.narrator.subjectName(`b:${homeB.id}`)} `);
      const show = el('button', { class: 'link', 'data-testid': 'open-home' }, 'Go to home');
      show.addEventListener('click', () => {
        const [w, h] = buildingDef(homeB.type).size;
        this.view.focusOn(homeB.x + w / 2, homeB.y + h / 2);
        this.select({ kind: 'building', id: homeB.id });
      });
      homeRow.appendChild(show);
      j.appendChild(homeRow);
    }
    if (rep.leavingSince !== null) j.appendChild(el('p', { class: 'warning' }, `Thinking of leaving (since day ${rep.leavingSince}).`));
    j.appendChild(el('h3', {}, 'On their mind'));
    const mind = el('ul', { class: 'mind', 'data-testid': 'on-mind' });
    for (const m of rep.onMind.slice(0, 3)) {
      const li = el('li', {}, m.label);
      li.appendChild(el('span', { class: 'quiet' }, ` (${m.reason})`));
      mind.appendChild(li);
    }
    if (!mind.childElementCount) mind.appendChild(el('li', { class: 'quiet' }, 'Nothing much. Content.'));
    j.appendChild(mind);
    j.appendChild(this.talkPanel(rep.id));
    j.appendChild(this.meter('Mood', rep.mood));
    j.appendChild(this.meter('Settled here', rep.disposition));

    const low = rep.needs.filter((n) => n.level < n.setpoint * 0.6).map((n) => n.need);
    const needs = this.section(`Needs${low.length ? ` · low: ${low.join(', ')}` : ' · all met'}`, 'needs');
    for (const n of rep.needs) needs.appendChild(this.meter(cap(n.need), n.level, n.setpoint));
    j.appendChild(needs);

    j.appendChild(this.personality(rep));
    j.appendChild(el('h3', {}, 'Feeling'));
    const feel = el('p', { 'data-testid': 'feelings' });
    feel.textContent = rep.feelings.length ? rep.feelings.map((f) => `${f.kind}${f.about ? ` about ${f.about}` : ''}`).join(', ') : 'Nothing in particular.';
    j.appendChild(feel);

    j.appendChild(el('h3', {}, 'Opinions, and why'));
    if (rep.opinions.length === 0) j.appendChild(el('p', { class: 'quiet' }, 'No settled opinions yet.'));
    for (const o of rep.opinions) {
      for (const b of o.beliefs) {
        const det = this.why(`${cap(b.statement)}.`, 'why', 'opinion');
        const ul = el('ul');
        for (const s of b.sources) ul.appendChild(el('li', {}, `${s.when}, ${s.how}: ${s.note}`));
        det.appendChild(ul);
        j.appendChild(det);
      }
    }
    if (rep.forming.length) {
      j.appendChild(el('h3', {}, `Still making up ${residentDef(rep.id).pronouns.poss} mind`));
      for (const f of rep.forming) {
        const det = this.why(`Maybe ${f.statement}…`, 'why forming', 'opinion-forming');
        det.appendChild(el('p', { class: 'quiet' }, `${Math.min(99, Math.round((Math.abs(f.evidence) / 0.9) * 100))}% of the way to deciding.`));
        const ul = el('ul');
        for (const s of f.sources) ul.appendChild(el('li', {}, `${s.when}, ${s.how}: ${s.note}`));
        det.appendChild(ul);
        j.appendChild(det);
      }
    }

    const friends = rep.relationships.filter((x) => x.id !== 'steward' && x.tags.includes('friend')).length;
    const peopleSection = this.section(`People · ${friends} friend${friends === 1 ? '' : 's'}`, 'people');
    const people = el('ul', { class: 'people' });
    for (const x of rep.relationships) {
      const word = x.tags.includes('close_friend') ? 'close friend' : x.tags.includes('friend') ? 'friend' : x.tags.includes('rival') ? 'not getting on' : x.affinity > 0.25 ? 'fond of' : x.affinity < -0.15 ? 'wary of' : 'knows';
      people.appendChild(el('li', {}, `${x.id === 'steward' ? 'You' : x.name}: ${word}`));
    }
    peopleSection.appendChild(people);
    j.appendChild(peopleSection);

    const asks = this.game.sim.state.requests.filter((x) => x.by === rep.id);
    if (asks.length) {
      const open = asks.filter((q) => q.status === 'open').length;
      const sec = this.section(`Asked of you · ${open} waiting`, 'asks');
      const ul = el('ul');
      for (const q of asks) ul.appendChild(el('li', {}, `${cap(ASK_TITLES[q.kind].replace('asks for ', ''))}: ${q.status}`));
      sec.appendChild(ul);
      j.appendChild(sec);
    }
    pane.appendChild(j);
  }

  // ---------------------------------------------------------------- per frame

  frame(): void {
    const state = this.game.sim.state;
    const t = state.tick;
    const weather = state.story.weather;
    const w = weather.kind !== 'clear' && t < weather.until ? ` · ${weather.kind}` : '';
    this.clockEl.textContent = `Day ${dayOf(t)} · ${cap(seasonOf(t))} · ${clock(t)}${w}`;
    this.stockEl.textContent = `Food ${Math.floor(state.stock.food)} · Timber ${Math.floor(state.stock.timber)}`;
    this.stockEl.classList.toggle('short', state.stock.food < 3);
    this.renderBoard();
    if (!this.menu.hidden) this.refreshMenu();
    if (!this.tabs.get('journal')!.pane.hidden) this.renderJournal();
    if (!this.tabs.get('you')!.pane.hidden) this.renderYou();
    // New proposals get a popup.
    if (!this.modal) {
      const d = state.story.dilemmas.find((x) => x.status === 'open' && !this.shownDilemmas.has(x.id));
      if (d) this.showDilemma(d);
    }
    const now = performance.now();
    const covers = this.panels.filter((p) => !p.hidden).map((p) => p.getBoundingClientRect());
    for (const [id, b] of this.bubbles) {
      const pos = this.view.residentHead(id);
      let show = pos !== null && pos.visible && now < b.until;
      if (show && pos) {
        b.el.hidden = false;
        b.el.style.left = `${pos.x}px`;
        b.el.style.top = `${pos.y}px`;
        // A bubble that would sit over the scroll, the dock or the top bar waits out of sight.
        const r = b.el.getBoundingClientRect();
        show = !covers.some((c) => r.left < c.right && r.right > c.left && r.top < c.bottom && r.bottom > c.top);
      }
      b.el.hidden = !show;
    }
  }
}

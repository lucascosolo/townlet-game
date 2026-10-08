// The paper UI around the diorama: clock, stores and speed; the scroll (notice board, town
// log, journal, and how the town sees you); the build menu; decision popups; the introduction;
// and thought bubbles. Everything it changes, it changes through Game.command.

import { buildingDef, singularName } from '../../../src/content/buildings.js';
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
import { daysToWinter, granaryRoom, hasGranary } from '../../../src/sim/stores.js';
import { ALL_FACTS, FACTS, TIERS, factValue, goalLabel, knownFacts, nextTier, progressOf, todaysGoals, unlocked, RENOWN } from '../../../src/sim/progress.js';
import type { Dilemma, FavourKind, QualityMap, Request, ResidentState, SimEvent, TalkQuestion } from '../../../src/sim/types.js';
import { SPEEDS, type Game } from '../game.js';
import type { AdResult, RewardedAds } from '../ads.js';
import { TRADER_GIFT } from '../../../src/sim/sim.js';
import type { ReplyKind } from '../../../src/sim/replies.js';
import { REPLY_SAID } from '../../../src/content/replies.js';
import { vividMemories } from '../../../src/sim/recall.js';
import { residentColor } from '../view/meshes.js';
import { ICONS } from './icons.js';
import { thumbnail } from '../view/thumbs.js';
import { portrait, portraitSvg } from './portrait.js';
import { greenAroundHome } from '../../../src/sim/world.js';
import { GREEN_ENOUGH } from '../../../src/sim/asks.js';
import type { TownView } from '../view/scene.js';

export const BUILD_MENU: Array<{ category: string; types: string[] }> = [
  { category: 'Paths and green', types: ['path', 'hedge', 'flowerbed', 'bench'] },
  { category: 'Gathering', types: ['teahouse', 'commons', 'well', 'fountain'] },
  { category: 'Work and food', types: ['garden', 'jetty', 'woodlot', 'bakery', 'workshop', 'granary', 'beehives', 'coop'] },
  { category: 'Homes', types: ['cottage'] },
  { category: 'Dreams', types: ['orchard', 'glasshouse', 'banner'] },
];
interface TalkPanel {
  root: HTMLElement;
  reply: HTMLElement;
  /** Talking back (bar round 1): the replies open after the last answer. */
  replies: HTMLElement;
  status: HTMLElement;
  controls: Array<HTMLButtonElement | HTMLSelectElement>;
  clear: HTMLButtonElement;
  /** Who said the last thing: the steward's question, then the resident's answer. */
  asked: HTMLElement;
  /** Portrait chips to pick a person or place, shown under the button that asked for them. */
  picker: HTMLElement;
  pick: 'opinion' | 'visit' | 'mend' | null;
  pickKey: string;
  pickButtons: Record<'opinion' | 'visit' | 'mend', HTMLButtonElement>;
}

/** Talking back: the chips under an answer. */
const REPLY_LABELS: Record<ReplyKind, string> = { agree: "That's fair", disagree: "I don't see it that way", sorry: "I'm sorry", explain: 'Let me explain' };

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

/** What the steward says when asking, shown above the answer. */
const FAVOUR_ASKS: Record<FavourKind, string> = {
  timber: 'Could you cut some timber for the store?',
  catch: 'Could you bring in a catch?',
  garden: 'Could you work the garden for a while?',
  clear: 'Could you help clear some wild land?',
  visit: 'Could you look in on {o}?',
  mend: 'Could you make peace with {o}?',
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
    body: 'Each morning brings three small goals: see them through to earn renown and grow the valley from a Clearing to a Townlet, opening new things to build. Talk to people to fill in their pages in the Folk album, and ask them favours when the stores run low. Buildings cost timber; gardens, the jetty and the bakery fill the larder, and winter needs food put by.',
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
  private readonly bubbles = new Map<string, { el: HTMLElement; until: number; born: number; major: boolean }>();
  private readonly bubbleLayer: HTMLElement;
  private readonly openWhy = new Set<string>();
  private readonly standingNotes = new Map<string, string[]>();
  private readonly shownDilemmas = new Set<number>();
  private modal: HTMLElement | null = null;
  private speedBeforeModal = 1;
  /** Whether the player has opened a page or tab yet, and the tick the game began on. */
  private lookedAround = false;
  /**
   * Game minutes the player has watched go by. Ticks arriving a few at a time are play and count
   * at most five a frame; a jump of two hours or more in one frame is a fast-forward (a test, a
   * replay), not a first look, and counts in full.
   */
  private watched = 0;
  private watchedFrom: number;
  private lastBoardKey = '';
  private lastJournalRender = 0;
  private lastYouRender = 0;
  private morning: NarratorEntry[] = [];
  private rosterEl: HTMLElement | null = null;
  private journalBody: HTMLElement | null = null;
  private readonly lastStock: Partial<Record<'food' | 'timber', number>> = {};
  /** One talk panel per resident, kept across journal redraws so its choices stay put. */
  private readonly talkPanels = new Map<string, TalkPanel>();
  /** Which page of a resident's journal is open; kept as you move between residents. */
  private residentView: 'about' | 'talk' = 'about';
  /** On-screen panels that speech bubbles must not cover. */
  private readonly panels: HTMLElement[] = [];
  /** The log's list, its filter, and the run of lines being folded together. */
  private logList!: HTMLElement;
  private logFilter: LogFilter = 'story';
  private logGroup: { who: string; t: number; extra: HTMLElement; toggle: HTMLButtonElement; count: number } | null = null;
  // M4: goals, the Folk album, the desktop dashboard and the phone shell.
  private readonly goalsEl: HTMLElement;
  private readonly folkEl: HTMLElement;
  private readonly leftCol: HTMLElement;
  private readonly widgets = new Map<string, HTMLElement>();
  private readonly renownEl: HTMLElement;
  private readonly tabbar: HTMLElement;
  private readonly quick: HTMLElement;
  private readonly toasts: HTMLElement;
  private readonly widgetMenu: HTMLElement;
  private phone = false;
  private lastGoalsKey = '';
  private lastFolkKey = '';
  private lastRenown = -1;

  constructor(root: HTMLElement, game: Game, view: TownView, opts: { intro: boolean }) {
    this.game = game;
    this.watchedFrom = game.sim.tick;
    this.view = view;
    this.root = root;

    // Clock, stores and speed.
    const hud = el('div', { class: 'hud paper' });
    this.clockEl = el('div', { class: 'clock', 'data-testid': 'clock' });
    this.stockEl = el('div', { class: 'stock', 'data-testid': 'stock' });
    for (const [res, icon, label] of [
      ['food', ICONS.wheat, 'Food'],
      ['timber', ICONS.log, 'Timber'],
    ] as const) {
      const item = el('span', { class: `res res-${res}`, title: label });
      item.innerHTML = icon;
      const n = el('b', { 'data-res': res });
      item.append(n, el('span', { class: 'sr' }, ` ${label}`));
      this.stockEl.appendChild(item);
    }
    // The granary's stores, once one stands (winter stores, 2026-10-04).
    const sack = el('span', { class: 'res res-granary', 'data-testid': 'granary-stock' });
    sack.innerHTML = ICONS.sack;
    sack.append(el('b'), el('span', { class: 'sr' }, ' put by'));
    sack.hidden = true;
    this.stockEl.appendChild(sack);
    const speeds = el('div', { class: 'speeds' });
    const icons = [ICONS.pause, ICONS.play, ICONS.fast, ICONS.faster, ICONS.fastest];
    SPEEDS.forEach((s, i) => {
      const b = el('button', { class: 'icon', title: s === 0 ? 'Pause (space)' : `Speed ${s}× (key ${i})`, 'aria-label': s === 0 ? 'Pause' : `Speed ${s}×`, 'data-testid': `speed-${i}` });
      b.innerHTML = icons[i] as string;
      b.addEventListener('click', () => this.setSpeed(i));
      speeds.appendChild(b);
      this.speedButtons.push(b);
    });
    const rot = el('div', { class: 'speeds rot' });
    const left = el('button', { class: 'icon', title: 'Turn left (Q). Or right-drag, or twist two fingers, to turn freely.', 'aria-label': 'Turn left' });
    const right = el('button', { class: 'icon', title: 'Turn right (E). Or right-drag, or twist two fingers, to turn freely.', 'aria-label': 'Turn right' });
    const help = el('button', { class: 'icon', title: 'How to play', 'aria-label': 'How to play', 'data-testid': 'help' });
    left.innerHTML = ICONS.turnLeft;
    right.innerHTML = ICONS.turnRight;
    help.innerHTML = ICONS.help;
    left.addEventListener('click', () => view.rotate(-1));
    right.addEventListener('click', () => view.rotate(1));
    help.addEventListener('click', () => this.showIntro());
    const widgetsB = el('button', { class: 'icon desk-only', title: 'Show or hide panels', 'aria-label': 'Panels', 'data-testid': 'widgets' });
    widgetsB.innerHTML = ICONS.widgets;
    widgetsB.addEventListener('click', () => (this.widgetMenu.hidden = !this.widgetMenu.hidden));
    rot.append(left, right, widgetsB, help);
    // Renown and the town's tier, always in view (M4: goals and rewards).
    this.renownEl = el('button', { class: 'renown', 'data-testid': 'renown', title: 'Renown: what the town has become. Open your goals.' });
    this.renownEl.addEventListener('click', () => this.showTab('goals'));
    hud.append(el('div', { class: 'title' }, 'Townlet'), this.clockEl, this.stockEl, this.renownEl, speeds, rot);
    root.appendChild(hud);
    this.panels.push(hud);

    // The scroll: rolls up to its top rod.
    this.scroll = el('aside', { class: 'scroll', 'data-testid': 'scroll' });
    const rodTop = el('div', { class: 'rod top' });
    const tabBar = el('nav', { class: 'tabs' });
    const roll = el('button', { class: 'roll', title: 'Roll up or unroll', 'data-testid': 'roll' }, '▴');
    roll.addEventListener('click', () => this.toggleScroll());
    rodTop.append(tabBar, roll);
    this.draggable(this.scroll, rodTop);
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
    const hidePanel = el('button', { class: 'roll desk-only', title: 'Hide this panel (bring it back from the panels button)', 'data-testid': 'hide-panel' });
    hidePanel.innerHTML = ICONS.close;
    hidePanel.addEventListener('click', () => this.setWidget('panel', false));
    rodTop.insertBefore(hidePanel, roll);
    root.appendChild(this.scroll);
    this.panels.push(this.scroll);
    this.widgets.set('panel', this.scroll);

    // The dashboard's left column (desktop): today's goals and the Folk album, as docked widgets.
    this.goalsEl = el('section', { class: 'pane', 'data-pane': 'goals', 'data-testid': 'goals' });
    this.folkEl = el('section', { class: 'pane', 'data-pane': 'folk', 'data-testid': 'folk' });
    this.leftCol = el('div', { class: 'dash-left' });
    this.leftCol.append(this.widget('goals', 'Goals', ICONS.star, this.goalsEl), this.widget('folk', 'Folk', ICONS.people, this.folkEl));
    root.appendChild(this.leftCol);
    this.panels.push(this.leftCol);
    this.widgetMenu = el('div', { class: 'widget-menu paper', 'data-testid': 'widget-menu' });
    this.widgetMenu.hidden = true;
    for (const [key, label] of [['goals', 'Goals'], ['folk', 'Folk'], ['panel', 'Board, log and journal']] as const) {
      const b = el('button', { 'data-testid': `show-widget-${key}`, 'data-key': key });
      b.innerHTML = `${ICONS.check}<span>${label}</span>`;
      b.addEventListener('click', () => {
        this.setWidget(key, this.widgets.get(key)?.hidden === true);
        this.widgetMenu.hidden = true;
      });
      this.widgetMenu.appendChild(b);
    }
    root.appendChild(this.widgetMenu);

    // The phone shell: a tab bar within thumb reach, and a card for whoever you tap.
    this.tabbar = el('nav', { class: 'tabbar', 'data-testid': 'tabbar' });
    for (const [key, label, icon] of [
      ['town', 'Town', ICONS.map],
      ['goals', 'Goals', ICONS.star],
      ['folk', 'Folk', ICONS.people],
      ['build', 'Build', ICONS.build],
      ['log', 'Log', ICONS.list],
    ] as const) {
      const b = el('button', { 'data-testid': `nav-${key}`, 'data-nav': key });
      b.innerHTML = `${icon}<span>${label}</span>`;
      b.addEventListener('click', () => this.nav(key));
      this.tabbar.appendChild(b);
    }
    root.appendChild(this.tabbar);
    this.quick = el('div', { class: 'quick-card paper', 'data-testid': 'quick-card' });
    this.quick.hidden = true;
    root.appendChild(this.quick);
    this.panels.push(this.quick);
    this.toasts = el('div', { class: 'toasts', 'aria-live': 'polite' });
    root.appendChild(this.toasts);



    // The dock: look, build menu, remove, and a status line.
    const dock = el('div', { class: 'dock paper' });
    const look = el('button', { 'data-testid': 'tool-select', title: 'Look and inspect (Esc)' });
    look.innerHTML = `${ICONS.look}<span>Look</span>`;
    look.addEventListener('click', () => this.setTool({ kind: 'select' }));
    const build = el('button', { 'data-testid': 'open-build' });
    build.innerHTML = `${ICONS.build}<span>Build</span>`;
    build.addEventListener('click', () => this.toggleMenu());
    const remove = el('button', { 'data-testid': 'tool-remove' });
    remove.innerHTML = `${ICONS.remove}<span>Remove</span>`;
    remove.addEventListener('click', () => this.setTool({ kind: 'remove' }));
    this.statusEl = el('div', { class: 'status', 'data-testid': 'palette-status' });
    dock.append(look, build, remove, this.statusEl);
    root.appendChild(dock);
    this.panels.push(dock);
    this.menu = this.buildMenu();
    this.menu.hidden = true;
    root.appendChild(this.menu);
    this.panels.push(this.menu);

    this.placeBar = el('div', { class: 'place-bar paper', 'data-testid': 'place-bar' });
    this.placeBar.hidden = true;
    const ok = el('button', { class: 'primary', 'data-testid': 'place-ok' }, '✓ Place');
    const rotateB = el('button', { 'data-testid': 'place-rotate' });
    rotateB.innerHTML = `${ICONS.turnRight}<span>Rotate</span>`;
    const cancel = el('button', { 'data-testid': 'place-cancel' }, '✕ Cancel');
    this.placeBar.append(el('span', { class: 'quiet' }, 'Drag the outline to move it'), rotateB, cancel, ok);
    this.placeButtons = { ok, rotate: rotateB, cancel };
    root.appendChild(this.placeBar);
    this.panels.push(this.placeBar);

    this.bubbleLayer = el('div', { class: 'bubbles' });
    root.appendChild(this.bubbleLayer);

    const media = window.matchMedia('(max-width: 760px)');
    this.applyLayout(media.matches);
    media.addEventListener('change', (m) => this.applyLayout(m.matches));
    this.showTab('board');
    // Opening the board ourselves is not the player looking around (bar round 1).
    this.lookedAround = false;

    game.narrator.onEntry((e) => this.onEntry(e));
    game.onEvent((e) => this.onEvent(e));
    this.setSpeed(game.speedIndex);
    this.setTool({ kind: 'select' });
    // On a phone the sheet starts at its peek, so the town is what you see first.
    if (this.phone && !this.scroll.classList.contains('rolled')) this.toggleScroll();
    if (this.phone) this.markNav('town');
    if (opts.intro) this.showIntro();
  }

  // ---------------------------------------------------------------- controls

  setSpeed(i: number): void {
    this.game.speedIndex = Math.max(0, Math.min(SPEEDS.length - 1, i));
    this.speedButtons.forEach((b, j) => b.classList.toggle('on', j === this.game.speedIndex));
  }

  /** Told whenever the tool changes (main.ts uses it for touch placement). */
  onToolChange: ((tool: Tool) => void) | null = null;
  /** Touch placement: a bar with Place, Rotate and Cancel (owner: no way to preview a build on mobile). */
  readonly placeBar: HTMLElement;
  readonly placeButtons: { ok: HTMLButtonElement; rotate: HTMLButtonElement; cancel: HTMLButtonElement };

  showPlaceBar(on: boolean, canPlace = true): void {
    this.placeBar.hidden = !on;
    this.placeButtons.ok.disabled = !canPlace;
    this.placeBar.classList.remove('laying');
    this.placeButtons.cancel.textContent = '✕ Cancel';
  }

  /** Laying paths: no outline to place, just a Done button and how it works. */
  showPathBar(on: boolean): void {
    this.placeBar.hidden = !on;
    this.placeBar.classList.toggle('laying', on);
    this.placeButtons.cancel.textContent = '✓ Done';
    (this.placeBar.querySelector('.quiet') as HTMLElement).textContent = on ? 'Drag across the ground to lay a path' : 'Drag the outline to move it';
  }

  setTool(tool: Tool): void {
    this.tool = tool;
    this.onToolChange?.(tool);
    this.menu.hidden = true;
    this.view.showGrid(tool.kind === 'build');
    this.view.setGhost(tool.kind === 'build' ? tool.type : null, null, false, this.rotation);
    this.view.highlightBuilding(null);
    this.status(
      tool.kind === 'build' && tool.type === 'path'
        ? 'Drag across the ground to lay a path (free). Remove takes tiles up · Esc stops.'
        : tool.kind === 'build'
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
    this.statusEl.title = text;
  }

  get modalOpen(): boolean {
    return this.modal !== null;
  }

  showTab(key: string): void {
    this.lookedAround = true;
    // On a desktop, goals and the Folk album are widgets of their own: bring the one asked for to the fore.
    if (!this.phone && (key === 'goals' || key === 'folk')) {
      this.setWidget(key, true);
      const w = this.widgets.get(key) as HTMLElement;
      w.classList.remove('collapsed', 'flash');
      void w.offsetWidth;
      w.classList.add('flash');
      if (key === 'goals') this.renderGoals(true);
      else this.renderFolk(true);
      return;
    }
    if (!this.phone) this.setWidget('panel', true);
    for (const [k, t] of this.tabs) {
      t.button.classList.toggle('on', k === key);
      // On a phone, Goals shows the notice board beneath today's goals.
      t.pane.hidden = k !== key && !(this.phone && key === 'goals' && k === 'board');
    }
    if (this.phone) {
      this.goalsEl.hidden = key !== 'goals';
      this.folkEl.hidden = key !== 'folk';
      this.scroll.classList.toggle('stacked', key === 'goals');
      (this.scroll.querySelector('.rod.top') as HTMLElement).dataset.title = ({ goals: 'Goals', folk: 'Folk', board: 'Notice board', log: 'Town log', journal: 'Journal', you: 'You' } as Record<string, string>)[key] ?? '';
      this.markNav(key === 'folk' || key === 'journal' ? 'folk' : key === 'log' ? 'log' : 'goals');
      this.quick.hidden = true;
      this.menu.hidden = true;
      if (key === 'goals') this.renderGoals(true);
      if (key === 'folk') this.renderFolk(true);
    }
    if (this.scroll.classList.contains('rolled')) this.toggleScroll();
    if (key === 'journal') this.renderJournal(true);
    if (key === 'log') this.logEl.scrollTop = this.logEl.scrollHeight;
    if (key === 'you') this.renderYou(true);
  }

  toggleScroll(): void {
    const rolled = this.scroll.classList.toggle('rolled');
    const roll = this.scroll.querySelector('.roll:not(.desk-only)');
    if (roll) roll.textContent = rolled ? '▾' : '▴';
    if (this.phone && rolled) this.markNav('town');
  }

  select(target: Ui['selected']): void {
    this.selected = target;
    this.view.highlightBuilding(target?.kind === 'building' ? target.id : null);
    this.view.selectResident(target?.kind === 'resident' ? target.id : null);
    // On a phone with the sheet down, tapping someone shows a small card, not the whole journal.
    if (this.phone && target?.kind === 'resident' && this.scroll.classList.contains('rolled')) {
      this.showQuick(target.id);
      return;
    }
    this.showTab('journal');
  }

  // ---------------------------------------------------------------- layout (M4)

  /** Where a dragged panel came from, so it can be docked back. */
  private readonly homes = new Map<HTMLElement, { parent: HTMLElement; next: Element | null }>();

  /**
   * On desktop a panel can be dragged by its header (owner, 2026-10-08) and docked back with a
   * double-click on it. Buttons in the header still work as buttons.
   */
  private draggable(box: HTMLElement, handle: HTMLElement): void {
    let start: { x: number; y: number; left: number; top: number } | null = null;
    handle.classList.add('grab');
    handle.addEventListener('pointerdown', (e) => {
      if (this.phone || e.button !== 0 || (e.target as HTMLElement).closest('button, a, input, select')) return;
      const r = box.getBoundingClientRect();
      const root = this.root.getBoundingClientRect();
      if (!box.classList.contains('dragged')) {
        // Lifted out of its column at its current place and size.
        this.homes.set(box, { parent: box.parentElement as HTMLElement, next: box.nextElementSibling });
        box.style.width = `${r.width}px`;
        if (box.classList.contains('widget')) box.style.height = `${r.height}px`;
        box.classList.add('dragged');
        this.root.appendChild(box);
      }
      box.style.left = `${r.left - root.left}px`;
      box.style.top = `${r.top - root.top}px`;
      box.style.right = 'auto';
      box.style.bottom = 'auto';
      start = { x: e.clientX, y: e.clientY, left: r.left - root.left, top: r.top - root.top };
      handle.setPointerCapture(e.pointerId);
      handle.classList.add('grabbing');
      e.preventDefault();
    });
    handle.addEventListener('pointermove', (e) => {
      if (!start) return;
      const root = this.root.getBoundingClientRect();
      box.style.left = `${Math.max(0, Math.min(root.width - 80, start.left + e.clientX - start.x))}px`;
      box.style.top = `${Math.max(0, Math.min(root.height - 40, start.top + e.clientY - start.y))}px`;
    });
    const stop = () => {
      start = null;
      handle.classList.remove('grabbing');
    };
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
    handle.addEventListener('dblclick', (e) => {
      if ((e.target as HTMLElement).closest('button, a')) return;
      this.dock(box);
    });
  }

  /** Put a dragged panel back where it came from. */
  private dock(box: HTMLElement): void {
    const home = this.homes.get(box);
    if (!home || !box.classList.contains('dragged')) return;
    box.classList.remove('dragged');
    for (const k of ['left', 'top', 'right', 'bottom', 'width', 'height'] as const) box.style[k] = '';
    if (home.next && home.next.parentElement === home.parent) home.parent.insertBefore(box, home.next);
    else home.parent.appendChild(box);
    this.homes.delete(box);
  }

  /** A docked dashboard widget with a title, fold and hide. */
  private widget(key: string, title: string, icon: string, body: HTMLElement): HTMLElement {
    const w = el('section', { class: 'widget paper', 'data-widget': key, 'data-testid': `widget-${key}` });
    // A widget with more below fades at its foot, so it reads as scrollable, not cut off (bar round 1).
    queueMicrotask(() => {
      const body = w.querySelector('.widget-body') as HTMLElement | null;
      if (!body) return;
      const edges = () => body.classList.toggle('more-below', body.scrollTop + body.clientHeight < body.scrollHeight - 4);
      body.addEventListener('scroll', edges, { passive: true });
      new ResizeObserver(edges).observe(body);
      new MutationObserver(edges).observe(body, { childList: true, subtree: true });
    });
    const head = el('header', { class: 'widget-head' });
    const t = el('h2', {});
    t.innerHTML = `${icon}<span>${title}</span>`;
    t.addEventListener('click', () => w.classList.toggle('collapsed'));
    const fold = el('button', { class: 'icon fold', title: 'Fold', 'aria-label': `Fold ${title}`, 'data-testid': `collapse-${key}` });
    fold.innerHTML = ICONS.chevron;
    fold.addEventListener('click', () => w.classList.toggle('collapsed'));
    const hide = el('button', { class: 'icon', title: 'Hide (bring it back from the panels button)', 'aria-label': `Hide ${title}`, 'data-testid': `hide-${key}` });
    hide.innerHTML = ICONS.close;
    hide.addEventListener('click', () => this.setWidget(key, false));
    head.append(t, fold, hide);
    this.draggable(w, head);
    const b = el('div', { class: 'widget-body' });
    b.appendChild(body);
    w.append(head, b);
    this.widgets.set(key, w);
    return w;
  }

  private setWidget(key: string, on: boolean): void {
    const w = this.widgets.get(key);
    if (!w) return;
    w.hidden = !on;
    for (const b of this.widgetMenu.querySelectorAll<HTMLElement>('button[data-key]')) b.classList.toggle('on', !this.widgets.get(b.dataset.key as string)?.hidden);
  }

  /** Phone (portrait) or desktop: the goals and Folk panes move between the sheet and the widgets. */
  private applyLayout(phone: boolean): void {
    this.phone = phone;
    if (phone) for (const box of [...this.homes.keys()]) this.dock(box);
    document.body.classList.toggle('phone', phone);
    const body = this.scroll.querySelector('.scroll-body') as HTMLElement;
    if (phone) {
      body.prepend(this.folkEl);
      body.prepend(this.goalsEl);
      this.goalsEl.hidden = true;
      this.folkEl.hidden = true;
      this.widgetMenu.hidden = true;
    } else {
      (this.widgets.get('goals')?.querySelector('.widget-body') as HTMLElement).appendChild(this.goalsEl);
      (this.widgets.get('folk')?.querySelector('.widget-body') as HTMLElement).appendChild(this.folkEl);
      this.goalsEl.hidden = false;
      this.folkEl.hidden = false;
      this.scroll.classList.remove('stacked');
      this.quick.hidden = true;
      this.setWidget('panel', true);
    }
    this.renderGoals(true);
    this.renderFolk(true);
  }

  /** The phone's tab bar. */
  private nav(key: 'town' | 'goals' | 'folk' | 'build' | 'log'): void {
    this.lookedAround = true;
    if (key === 'town' || key === 'build') {
      this.quick.hidden = true;
      if (!this.scroll.classList.contains('rolled')) this.toggleScroll();
      this.menu.hidden = key !== 'build';
      if (key === 'build') this.refreshMenu();
      this.markNav(key);
      return;
    }
    this.showTab(key);
  }

  private markNav(key: string): void {
    for (const b of this.tabbar.querySelectorAll<HTMLElement>('button[data-nav]')) b.classList.toggle('on', b.dataset.nav === key);
  }

  /** The card for a resident tapped in the town (phone). */
  private showQuick(id: string): void {
    const rep = residentReport(this.game.sim, id, this.game.narrator);
    const card = this.quick;
    card.replaceChildren();
    const head = el('div', { class: 'quick-head' });
    head.appendChild(portrait(id, 48));
    const words = el('div', {});
    words.append(el('div', { class: 'quick-name' }, rep.name), el('div', { class: 'quiet' }, `Now: ${rep.doing}`));
    head.appendChild(words);
    const close = el('button', { class: 'icon', 'aria-label': 'Close', 'data-testid': 'quick-close' });
    close.innerHTML = ICONS.close;
    close.addEventListener('click', () => (card.hidden = true));
    head.appendChild(close);
    card.appendChild(head);
    card.appendChild(this.meter('Mood', rep.mood));
    const row = el('div', { class: 'quick-actions' });
    for (const [key, label, view] of [
      ['talk', 'Talk', 'talk'],
      ['favour', 'Favour', 'talk'],
      ['profile', 'Profile', 'about'],
    ] as const) {
      const b = el('button', { class: key === 'talk' ? 'primary' : '', 'data-testid': `quick-${key}` }, label);
      b.addEventListener('click', () => {
        this.residentView = view;
        card.hidden = true;
        this.showTab('journal');
        if (key === 'favour') requestAnimationFrame(() => this.journalEl.querySelector('[data-testid="favour-timber"]')?.scrollIntoView({ block: 'center' }));
      });
      row.appendChild(b);
    }
    card.appendChild(row);
    card.hidden = false;
  }

  /** A short note that floats in at the top and fades (goals done, things learned). */
  private toast(html: string, kind = ''): void {
    const t = el('div', { class: `toast ${kind}` });
    t.innerHTML = html;
    this.toasts.appendChild(t);
    while (this.toasts.childElementCount > 3) this.toasts.firstElementChild?.remove();
    setTimeout(() => t.classList.add('out'), 2800);
    setTimeout(() => t.remove(), 3300);
  }

  // ---------------------------------------------------------------- goals and the Folk album (M4)

  /** Today's goals, the town's tier and the winter stores. */
  /** The rewarded-ad provider, once known; null means no offer is ever shown. */
  private ads: RewardedAds | null = null;
  /** What the last offer came to, shown on the card until the next one. */
  private adNote = '';
  private adBusy = false;

  setAds(ads: RewardedAds | null): void {
    this.ads = ads;
    this.renderGoals(true);
  }

  /** The trader's cart (quick wins, 2026-10-08): watch a short ad, by choice, for a small gift once a day. */
  private traderCard(): HTMLElement | null {
    const sim = this.game.sim;
    if (!this.ads) return null;
    const card = el('div', { class: 'trader-card', 'data-testid': 'trader-card' });
    card.appendChild(el('div', { class: 'trader-title' }, "The trader's cart"));
    if (!sim.giftAvailable()) {
      card.appendChild(el('p', { class: 'quiet' }, this.adNote || "The cart has been by today. It'll be back on the road tomorrow."));
      return card;
    }
    card.appendChild(el('p', {}, `Watch a short ad and a trader's cart will stop by with ${TRADER_GIFT.timber} timber and ${TRADER_GIFT.food} food.`));
    if (this.adNote) card.appendChild(el('p', { class: 'quiet small', 'data-testid': 'ad-note' }, this.adNote));
    const go = el('button', { 'data-testid': 'ad-offer' }, this.adBusy ? 'Waiting for the ad…' : 'Watch an ad') as HTMLButtonElement;
    go.disabled = this.adBusy;
    go.addEventListener('click', () => void this.watchAd());
    card.appendChild(go);
    return card;
  }

  private async watchAd(): Promise<void> {
    if (!this.ads || this.adBusy || !this.game.sim.giftAvailable()) return;
    this.adBusy = true;
    this.renderGoals(true);
    let before = this.game.speedIndex;
    const result: AdResult = await this.ads.show({
      pause: () => {
        before = this.game.speedIndex;
        this.game.speedIndex = 0;
      },
      resume: () => {
        this.game.speedIndex = before;
      },
    });
    this.adBusy = false;
    if (result === 'watched') {
      this.game.command({ kind: 'gift', from: 'trader' });
      this.adNote = "The cart came by today. It'll be back on the road tomorrow.";
      this.toast(`<span>A trader's cart: +${TRADER_GIFT.timber} timber, +${TRADER_GIFT.food} food</span>`, 'goal');
    } else if (result === 'dismissed') this.adNote = "The ad didn't play to the end, so the cart didn't stop. The offer's still open.";
    else this.adNote = 'No ad to show just now. Try again in a little while.';
    this.renderGoals(true);
  }

  private renderGoals(force = false): void {
    const state = this.game.sim.state;
    const p = progressOf(state);
    const goals = todaysGoals(state);
    const key = JSON.stringify([goals, p.renown, p.tier, p.goals.bonus, state.stores, Math.floor(state.granary ?? 0), dayOf(state.tick), state.lastGiftDay, this.adNote, this.adBusy, !!this.ads]);
    if (!force && key === this.lastGoalsKey) return;
    this.lastGoalsKey = key;
    const pane = this.goalsEl;
    pane.replaceChildren();
    pane.appendChild(el('h3', {}, `Today · day ${dayOf(state.tick)}`));
    if (goals.length === 0) pane.appendChild(el('p', { class: 'quiet' }, 'New goals arrive each morning.'));
    for (const g of goals) {
      const row = el('div', { class: `goal${g.done ? ' done' : ''}`, 'data-testid': `goal-${g.kind}` });
      const box = el('span', { class: 'box' });
      if (g.done) box.innerHTML = ICONS.check;
      row.append(box, el('span', { class: 'what' }, goalLabel(g)));
      if (g.target > 1) row.appendChild(el('span', { class: 'count' }, `${g.count}/${g.target}`));
      row.appendChild(el('span', { class: 'reward' }, `+${RENOWN.goal} ✦`));
      pane.appendChild(row);
    }
    if (goals.length) pane.appendChild(el('div', { class: `goal bonus${p.goals.bonus ? ' done' : ''}` }, p.goals.bonus ? `All done today: +${RENOWN.allGoals} ✦ bonus earned` : `All three: +${RENOWN.allGoals} ✦ bonus`));

    const nt = nextTier(state);
    const tier = el('div', { class: 'tier-card', 'data-testid': 'tier' });
    tier.append(el('div', { class: 'tier-name' }, TIERS[p.tier] as string), el('div', { class: 'tier-renown' }, `${p.renown} ✦ renown`));
    if (nt) {
      const track = el('div', { class: 'track' });
      const fill = el('div', { class: 'fill' });
      fill.style.width = pct((p.renown - nt.from) / (nt.to - nt.from));
      track.appendChild(fill);
      tier.appendChild(track);
      const opens = ({ Hamlet: 'beehives', Village: 'a chicken coop', Townlet: 'a fountain' } as Record<string, string>)[nt.name];
      tier.appendChild(el('p', { class: 'quiet' }, `${nt.need} ✦ to ${nt.name}: it opens ${opens} and room for more neighbours.`));
    } else tier.appendChild(el('p', { class: 'quiet' }, 'A Townlet: the valley is all it set out to be.'));
    tier.appendChild(el('p', { class: 'quiet small' }, 'Renown comes from goals, granted asks and wishes, dreams come true, the winter stores, newcomers, and getting to know people.'));
    pane.appendChild(tier);
    if (state.stores?.asked) pane.appendChild(this.storesCard());
    const trader = this.traderCard();
    if (trader) pane.appendChild(trader);
    const you = el('button', { class: 'link', 'data-testid': 'open-you' }, 'How the town sees you →');
    you.addEventListener('click', () => this.showTab('you'));
    pane.appendChild(you);
  }

  /** The Folk album: everyone in the valley, filled in as you get to know them. */
  private renderFolk(force = false): void {
    const state = this.game.sim.state;
    const people = state.order.filter((id) => !state.residents[id]?.departed);
    const key = JSON.stringify([people.map((id) => [id, knownFacts(state, id).length]), this.selected]);
    if (!force && key === this.lastFolkKey) return;
    this.lastFolkKey = key;
    const pane = this.folkEl;
    pane.replaceChildren();
    const met = people.filter((id) => knownFacts(state, id).length > 0).length;
    const facts = people.reduce((n, id) => n + knownFacts(state, id).length, 0);
    pane.appendChild(el('p', { class: 'quiet album-summary', 'data-testid': 'album-summary' }, `${met} of ${people.length} met · ${facts} of ${people.length * ALL_FACTS.length} things known. Talk to people to fill in their pages.`));
    const grid = el('div', { class: 'album' });
    for (const id of people) {
      const known = knownFacts(state, id);
      const r = this.game.sim.resident(id);
      const card = el('button', { class: `folk-card${known.length ? '' : ' unmet'}${this.selected?.kind === 'resident' && this.selected.id === id ? ' on' : ''}`, 'data-testid': `folk-${id}` });
      card.style.setProperty('--who', cssColor(residentColor(id)));
      card.appendChild(portrait(id, 52));
      card.appendChild(el('div', { class: 'folk-name' }, residentDef(id).name));
      card.appendChild(el('div', { class: 'folk-line' }, known.includes('job') ? factValue(state, r, 'job') : known.length ? 'Getting to know them' : 'Not met yet: say hello'));
      const pips = el('div', { class: 'pips', title: `${known.length} of ${ALL_FACTS.length} things known` });
      for (let i = 0; i < ALL_FACTS.length; i++) pips.appendChild(el('span', { class: i < known.length ? 'pip on' : 'pip' }));
      card.appendChild(pips);
      card.addEventListener('click', () => this.select({ kind: 'resident', id }));
      grid.appendChild(card);
    }
    pane.appendChild(grid);
  }

  /** What a resident remembers most (2026-10-08): up to three dated memories, in their own words. */
  private memoriesSection(id: string): HTMLElement | null {
    const sim = this.game.sim;
    const eps = vividMemories(sim.resident(id), sim.tick);
    if (eps.length === 0) return null;
    const sec = el('div', { class: 'memories', 'data-testid': 'memories' });
    sec.appendChild(el('h3', {}, 'Remembers most'));
    for (const ep of eps) {
      const row = el('div', { class: `memory ${ep.valence >= 0 ? 'good' : 'bad'}`, 'data-episode': String(ep.id) });
      row.append(el('span', { class: 'day' }, `Day ${dayOf(ep.tick)}`), el('q', {}, this.game.narrator.memoryQuote(id, ep)));
      sec.appendChild(row);
    }
    return sec;
  }

  /** "What you know" on a resident's page: learned facts, and how to learn the rest. */
  private factsSection(id: string): HTMLElement {
    const state = this.game.sim.state;
    const r = this.game.sim.resident(id);
    const known = knownFacts(state, id);
    const sec = el('div', { class: 'facts', 'data-testid': 'facts' });
    sec.appendChild(el('h3', {}, `What you know · ${known.length} of ${ALL_FACTS.length}`));
    const ask = Object.fromEntries((Object.entries(FACTS) as Array<[TalkQuestion, string[]]>).flatMap(([q, keys]) => keys.map((k) => [k, q]))) as Record<string, TalkQuestion>;
    const label = (q: TalkQuestion) => (q === 'opinion' ? 'What do you think of…' : (QUESTIONS.find(([x]) => x === q)?.[1] ?? q));
    const ul = el('ul');
    for (const k of ALL_FACTS) if (known.includes(k)) ul.appendChild(el('li', { 'data-fact': k }, factValue(state, r, k)));
    if (known.length === 0) ul.appendChild(el('li', { class: 'quiet' }, 'Nothing yet. Talk to them to find out.'));
    sec.appendChild(ul);
    // What is left to learn, one line per question rather than one per fact (design pass, 2026-10-08).
    const left = new Map<TalkQuestion, number>();
    for (const k of ALL_FACTS) if (!known.includes(k)) left.set(ask[k] as TalkQuestion, (left.get(ask[k] as TalkQuestion) ?? 0) + 1);
    if (left.size) {
      const todo = el('div', { class: 'to-learn', 'data-testid': 'to-learn' });
      todo.appendChild(el('div', { class: 'to-learn-head' }, 'Still to learn'));
      for (const [q, n] of left) {
        const askedToday = progressOf(state).asked[`${id}|${q}`] === dayOf(state.tick);
        const row = el('div', { class: `ask-row${askedToday ? ' later' : ''}` });
        row.append(el('span', { class: 'q' }, `"${label(q)}"`), el('span', { class: 'n' }, askedToday ? 'ask again tomorrow' : `${n} to learn`));
        todo.appendChild(row);
      }
      sec.appendChild(todo);
    }
    return sec;
  }

  /** Moving up a tier: a moment worth stopping for. */
  private celebrateTier(e: Extract<SimEvent, { type: 'tier' }>): void {
    const c = el('div', { class: 'celebrate', 'data-testid': 'tier-up' });
    const confetti = el('div', { class: 'confetti', 'aria-hidden': 'true' });
    for (let i = 0; i < 28; i++) {
      const bit = el('i');
      bit.style.left = `${(i * 37) % 100}%`;
      bit.style.animationDelay = `${(i % 7) * 0.12}s`;
      bit.style.background = ['#e0a33a', '#b5653e', '#5f9e4f', '#4f8a86', '#c0503c'][i % 5] as string;
      confetti.appendChild(bit);
    }
    c.append(confetti, el('div', { class: 'eyebrow' }, 'The valley grows'), el('h2', {}, `A ${e.name} now!`));
    c.appendChild(el('p', {}, `Word has got round. The neighbouring towns send 15 timber, and up to ${e.cap} can make their home here.`));
    for (const t of e.unlocks) {
      const row = el('div', { class: 'unlock' });
      const img = el('img', { class: 'thumb', alt: '' });
      img.src = thumbnail(t) || 'data:,';
      row.append(img, el('div', {}, `New to build: ${buildingDef(t).name}. ${buildingDef(t).blurb?.replace(/ Opens at \w+\.$/, '') ?? ''}`));
      c.appendChild(row);
    }
    const buttons = el('div', { class: 'modal-buttons' });
    const ok = el('button', { class: 'primary', 'data-testid': 'tier-ok' }, 'Wonderful');
    ok.addEventListener('click', () => this.closeModal());
    buttons.appendChild(ok);
    c.appendChild(buttons);
    this.openModal(c);
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

  /** The build tray: one row of cards along the bottom, details for the card under the pointer above it. */
  private buildMenu(): HTMLElement {
    const menu = el('div', { class: 'menu paper', 'data-testid': 'build-menu' });
    const head = el('div', { class: 'menu-head' });
    head.append(el('h3', {}, 'Build'), el('span', { class: 'quiet', 'data-menu-timber': '' }));
    const removeB = el('button', { class: 'phone-only', 'data-testid': 'tray-remove' });
    removeB.innerHTML = `${ICONS.remove}<span>Remove</span>`;
    removeB.addEventListener('click', () => this.setTool({ kind: 'remove' }));
    const close = el('button', { 'aria-label': 'Close' }, '✕');
    close.addEventListener('click', () => (menu.hidden = true));
    head.append(removeB, close);
    menu.appendChild(head);
    const info = el('div', { class: 'tray-info', 'data-testid': 'tray-info' });
    const hint = window.matchMedia('(pointer: coarse)').matches ? 'Tap a card to place it; its details show here.' : 'Point at a card to see what it gives off and who would like it.';
    info.textContent = hint;
    menu.appendChild(info);
    const row = el('div', { class: 'cards' });
    // Jump to a group (design pass, 2026-10-08: only a few cards showed, with no sign of the rest).
    const jumps = el('div', { class: 'tray-jumps', 'data-testid': 'tray-jumps' });
    menu.insertBefore(jumps, info);
    for (const group of BUILD_MENU) {
      const label = el('div', { class: 'tray-group' }, group.category);
      row.appendChild(label);
      const jump = el('button', { class: 'chip', 'data-testid': `tray-jump-${group.types[0]}` }, group.category);
      jump.addEventListener('click', () => row.scrollTo({ left: label.offsetLeft - row.offsetLeft, behavior: 'smooth' }));
      jumps.appendChild(jump);
      for (const type of group.types) {
        const def = buildingDef(type);
        const card = el('button', { class: 'build-card', 'data-testid': `tool-build-${type}`, 'data-type': type });
        card.appendChild(el('img', { class: 'thumb', alt: '', 'data-thumb': type }));
        card.appendChild(el('span', { class: 'lock', 'aria-hidden': 'true' }));
        card.appendChild(el('div', { class: 'card-title' }, def.name));
        const cost = el('div', { class: 'cost' });
        cost.innerHTML = `${ICONS.log}<span>${def.cost ?? 0} timber</span>`;
        card.appendChild(cost);
        // Details live on the card (for the info line and screen readers) but show above the tray.
        const details = el('div', { class: 'details' });
        if (def.blurb) details.appendChild(el('div', { class: 'blurb' }, def.blurb));
        details.appendChild(el('div', { class: 'gives', 'data-testid': 'gives-off' }, `Gives off: ${this.givesOff(type)}`));
        details.appendChild(el('div', { class: 'likes', 'data-likes': '' }));
        card.appendChild(details);
        const show = () => {
          info.replaceChildren(el('b', {}, def.name), ...[...details.children].map((c) => c.cloneNode(true)));
          if (!unlocked(this.game.sim.state, type)) info.appendChild(el('div', { class: 'need' }, `Opens when the valley is a ${TIERS[def.tier ?? 0]}. Earn renown with your daily goals.`));
          else if (!this.game.sim.canAfford(type)) info.appendChild(el('div', { class: 'need' }, `Needs ${def.cost} timber; you have ${Math.floor(this.game.sim.state.stock.timber)}. Ask someone to cut timber.`));
        };
        card.addEventListener('pointerenter', show);
        card.addEventListener('focus', show);
        card.addEventListener('click', () => {
          if (!unlocked(this.game.sim.state, type)) {
            this.status(`${def.name}: opens when the valley is a ${TIERS[def.tier ?? 0]}.`);
            show();
            this.shake(card);
            return;
          }
          if (!this.game.sim.canAfford(type)) {
            this.status(`Not enough timber for a ${def.name.toLowerCase()} (${def.cost} needed).`);
            show();
            this.shake(card);
            this.shake(this.stockEl.querySelector('[data-res="timber"]')?.parentElement ?? this.stockEl, 'pulse');
            return;
          }
          this.setTool({ kind: 'build', type });
        });
        row.appendChild(card);
      }
    }
    row.addEventListener('pointerleave', () => (info.textContent = hint));
    menu.appendChild(row);
    // A mouse wheel scrolls the row sideways, and the far edge fades while there is more to see.
    row.addEventListener(
      'wheel',
      (e) => {
        if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || row.scrollWidth <= row.clientWidth) return;
        row.scrollLeft += e.deltaY;
        e.preventDefault();
      },
      { passive: false },
    );
    const edges = () => {
      row.classList.toggle('more-right', row.scrollLeft + row.clientWidth < row.scrollWidth - 4);
      row.classList.toggle('more-left', row.scrollLeft > 4);
    };
    row.addEventListener('scroll', edges, { passive: true });
    new ResizeObserver(edges).observe(row);
    return menu;
  }

  /** Replay a one-shot CSS animation on an element. */
  private shake(target: Element, cls = 'shake'): void {
    target.classList.remove(cls);
    void (target as HTMLElement).offsetWidth;
    target.classList.add(cls);
    setTimeout(() => target.classList.remove(cls), 600);
  }

  private refreshMenu(): void {
    // Thumbnails are drawn the first time the menu is open.
    for (const img of this.menu.querySelectorAll<HTMLImageElement>('img[data-thumb]')) {
      if (!img.src) img.src = thumbnail(img.dataset.thumb as string) || 'data:,';
    }
    const timber = Math.floor(this.game.sim.state.stock.timber);
    const t = this.menu.querySelector('[data-menu-timber]');
    if (t) t.textContent = `${timber} timber in store`;
    for (const card of this.menu.querySelectorAll<HTMLElement>('.build-card')) {
      const type = card.dataset.type as string;
      const open = unlocked(this.game.sim.state, type);
      card.classList.toggle('locked', !open);
      card.classList.toggle('unaffordable', open && !this.game.sim.canAfford(type));
      const likes = card.querySelector('[data-likes]');
      const who = this.likelyToPlease(type).map((id) => residentDef(id).name);
      if (likes) likes.textContent = who.length ? `Likely to please: ${who.join(', ')}` : '';
    }
  }

  // ---------------------------------------------------------------- modals

  private openModal(content: HTMLElement): void {
    this.closeModal();
    // The real previous speed, paused included (bar round 1: Decide later used to un-pause the game).
    this.speedBeforeModal = this.game.speedIndex;
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
    c.appendChild(el('div', { class: 'eyebrow' }, `${page + 1} of ${INTRO.length}`));
    c.appendChild(el('h2', {}, p.title));
    // The first page puts faces to the six names.
    if (page === 0) {
      const faces = el('div', { class: 'intro-faces' });
      for (const id of this.game.sim.state.order.slice(0, 6)) {
        const f = el('figure');
        f.append(portrait(id, 52), el('figcaption', {}, residentDef(id).name));
        faces.appendChild(f);
      }
      c.appendChild(faces);
    }
    c.appendChild(el('p', {}, p.body));
    const row = el('div', { class: 'modal-buttons' });
    const last = page === INTRO.length - 1;
    const next = el('button', { class: 'primary', 'data-testid': 'intro-next' }, last ? 'Begin' : 'Next');
    // The scroll stays rolled up behind the welcome (review: a cluttered first frame) and unrolls at the end.
    if (page === 0 && !this.scroll.classList.contains('rolled')) this.toggleScroll();
    next.addEventListener('click', () => {
      if (last && this.scroll.classList.contains('rolled') && window.innerWidth > 600) this.toggleScroll();
      this.showIntro(page + 1);
    });
    row.appendChild(next);
    // Starting over (M4: saves): two taps, so nobody loses a town by accident.
    const fresh = el('button', { class: 'link', 'data-testid': 'new-valley' }, 'Start a new valley');
    fresh.addEventListener('click', () => {
      if (fresh.dataset.sure) {
        location.href = `${location.pathname}?new=1`;
        return;
      }
      fresh.dataset.sure = '1';
      fresh.textContent = 'Tap again to leave this town and start a new one';
    });
    row.appendChild(fresh);
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
    const top = el('div', { class: 'modal-head' });
    top.appendChild(portrait(d.proposer, 64));
    const titles = el('div');
    titles.appendChild(el('div', { class: 'eyebrow' }, 'A decision for you'));
    titles.appendChild(el('h2', {}, `${def.name} has a proposal: ${DILEMMA_NAMES[d.type]}`));
    top.appendChild(titles);
    c.appendChild(top);
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
    const later = el('button', { class: 'link', 'data-testid': `later-${d.id}` }, 'Decide later');
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
    if (e.type === 'goal' && e.phase === 'done' && e.goal) this.toast(`${ICONS.check}<span>${goalLabel(e.goal)}</span><b>+${RENOWN.goal} ✦</b>`, 'goal');
    if (e.type === 'goal' && e.phase === 'all') this.toast(`${ICONS.star}<span>All of today's goals!</span><b>+${RENOWN.allGoals} ✦</b>`, 'goal big');
    if (e.type === 'fact') this.toast(`${portraitSvg(e.who, 26)}<span>${e.first ? 'Met' : 'Getting to know'} ${residentDef(e.who).name}: ${factValue(this.game.sim.state, this.game.sim.resident(e.who), e.key)}</span>`, 'fact');
    if (e.type === 'tier') this.celebrateTier(e);
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
      b = { el: el('div', { class: 'bubble' }), until: 0, born: 0, major: false };
      b.el.style.borderColor = cssColor(residentColor(id));
      this.bubbleLayer.appendChild(b.el);
      this.bubbles.set(id, b);
    }
    b.el.className = `bubble ${mood}`;
    // Who is speaking, so a line never floats over an anonymous figure (review).
    const who = el('span', { class: 'speaker' }, residentDef(id).name);
    who.style.background = cssColor(residentColor(id));
    // Cut long lines at a word, never mid-word (bar round 1: "before the cart's last v…").
    const limit = this.phone ? 110 : 140;
    const cut = text.length > limit ? `${text.slice(0, text.lastIndexOf(' ', limit - 1) > 40 ? text.lastIndexOf(' ', limit - 1) : limit - 1)}…` : text;
    b.el.replaceChildren(who, document.createTextNode(cut));
    b.el.dataset.who = id;
    b.born = performance.now();
    b.until = b.born + 4500;
    b.major = mood === 'major' || mood === 'up' || mood === 'down';
  }

  // ---------------------------------------------------------------- the notice board

  private renderBoard(): void {
    const state = this.game.sim.state;
    const open = state.story.dilemmas.filter((d) => d.status === 'open');
    const requests = state.requests.filter((q) => q.status === 'open');
    const wishes = state.story.wishes.filter((w) => w.status === 'open');
    const progress = wishes.map((w) => wishProgress(state, w).met);
    const key = JSON.stringify([open.map((d) => d.id), requests.map((q) => q.id), wishes.map((w) => w.id), progress, this.morning.length, dayOf(state.tick), state.buildings.length, Math.floor(state.granary ?? 0), state.stores]);
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
      if (w.kind === 'more_green') {
        // Grouped by how green it is round each home: "Nothing green nearby yet: Ada, Fen and Wren."
        const by = new Map<string, string[]>();
        for (const id of w.supporters) {
          const [, how] = this.greenLine(id).split(': ');
          by.set(how as string, [...(by.get(how as string) ?? []), residentDef(id).name]);
        }
        const list = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] ?? ''));
        card.appendChild(el('p', { class: 'quiet', 'data-testid': 'green-progress' }, [...by].map(([how, names]) => `${cap(how)}: ${list(names)}.`).join(' ')));
      }
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
      card.appendChild(el('div', { class: 'card-title' }, `${who.name} ${ASK_TITLES[q.kind]}${q.wants ? `: ${/^[aeiou]/.test(singularName(q.wants)) ? 'an' : 'a'} ${singularName(q.wants)}` : ''}`));
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

    // This morning: only what matters, the rest is in the log (review: the board repeated the log).
    pane.appendChild(el('h3', {}, 'This morning'));
    const worth = this.morning.filter((e) => e.importance === 'major');
    const rest = this.morning.filter((e) => e.importance !== 'major').length;
    if (worth.length === 0) pane.appendChild(el('p', { class: 'quiet' }, rest ? 'A quiet night. Nothing needs you.' : 'Nothing new on the board.'));
    const list = el('ul');
    for (const e of worth) {
      const li = el('li', { class: e.importance });
      for (const n of this.nameLinks(e.text)) li.appendChild(n);
      list.appendChild(li);
    }
    pane.appendChild(list);
    if (rest) {
      const more = el('button', { class: 'link', 'data-testid': 'morning-more' }, `${rest} more in the Town log`);
      more.addEventListener('click', () => this.showTab('log'));
      pane.appendChild(more);
    }
  }

  /** How green it is around someone's home, against what satisfies them. */
  /** Winter stores: the yearly quest, with its count, target and days to winter. */
  private storesCard(): HTMLElement {
    const state = this.game.sim.state;
    const q = state.stores as NonNullable<typeof state.stores>;
    const put = Math.floor(state.granary ?? 0);
    const keeper = q.by ? residentDef(q.by).name : 'The town';
    const card = el('div', { class: 'card quest', 'data-testid': 'stores-card' });
    const head = el('div', { class: 'card-title' });
    head.innerHTML = ICONS.sack;
    head.append(el('span', {}, `Winter stores · ${keeper}'s worry`));
    card.appendChild(head);
    const days = daysToWinter(state.tick);
    const status = q.outcome === 'met'
      ? `${put} food put by. The town is ready for winter.`
      : q.outcome === 'short'
        ? `Winter came with the granary short of ${q.target}. ${keeper} will start sooner next year.`
        : `${put} of ${q.target} food put by in the granary · ${days} day${days === 1 ? '' : 's'} to winter.`;
    card.appendChild(el('p', { 'data-testid': 'stores-progress' }, status));
    if (!q.outcome) {
      const room = granaryRoom(state);
      const hint = room === 0
        ? 'Build a granary (Work and food, 12 timber). Food the larder can\'t hold goes there, and surplus is carried across by day.'
        : room < q.target
          ? `The granaries hold ${room} between them. Another would make room for ${q.target}.`
          : 'Food over what the larder needs is carried across each day. Favours that bring in food help most.';
      card.appendChild(el('p', { class: 'quiet' }, hint));
      const track = el('div', { class: 'track' });
      const fill = el('div', { class: 'fill' });
      fill.style.width = pct(Math.min(1, put / q.target));
      track.appendChild(fill);
      card.appendChild(track);
    }
    return card;
  }

  private greenLine(id: string): string {
    const state = this.game.sim.state;
    const home = state.buildings.find((b) => b.id === this.game.sim.resident(id).homeId);
    if (!home) return '';
    const g = greenAroundHome(state, home);
    // In words, not percentages (design pass, 2026-10-08).
    const f = g / GREEN_ENOUGH;
    return `${residentDef(id).name}: ${f >= 1 ? 'green enough ✓' : f >= 0.5 ? 'nearly green enough' : f > 0 ? 'wants more green nearby' : 'nothing green nearby yet'}`;
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
    // The conversation reads top-down like a chat: your question, then their answer.
    const convo = el('div', { class: 'convo' });
    const asked = el('div', { class: 'said you', 'data-testid': 'talk-asked' });
    const answer = el('div', { class: 'said them' });
    answer.appendChild(portrait(id, 36));
    const reply = el('div', { class: 'bubble-reply', 'data-testid': 'talk-reply' });
    answer.appendChild(reply);
    const replies = el('div', { class: 'replies', 'data-testid': 'talk-replies' });
    convo.append(asked, answer, replies);
    root.appendChild(convo);
    const controls: HTMLButtonElement[] = [];
    let p!: TalkPanel;
    const say = (words: string) => {
      asked.textContent = words;
      p.pick = null;
    };
    const ask = (question: TalkQuestion, label: string, about?: string) => {
      say(label);
      this.game.command({ kind: 'talk', who: id, question, ...(about ? { about } : {}) });
      this.renderJournal(true);
    };
    root.appendChild(el('h3', {}, `Ask ${name}`));
    const qs = el('div', { class: 'talk-grid' });
    for (const [q, label] of QUESTIONS) {
      const b = el('button', { 'data-testid': `ask-${q}` }, label);
      b.addEventListener('click', () => ask(q, label));
      qs.appendChild(b);
      controls.push(b);
    }
    const opinion = el('button', { 'data-testid': 'ask-opinion', class: 'picks' }, 'What do you think of…');
    qs.appendChild(opinion);
    controls.push(opinion);
    root.appendChild(qs);

    root.appendChild(el('h3', {}, 'Ask a favour'));
    const favour = (kind: FavourKind, other?: string) => {
      say(FAVOUR_ASKS[kind].replace('{o}', other ? residentDef(other).name : ''));
      this.game.command({ kind: 'favour', who: id, favour: kind, ...(other ? { other } : {}) });
      this.renderJournal(true);
    };
    const fs = el('div', { class: 'talk-grid' });
    let clear!: HTMLButtonElement;
    for (const kind of ['timber', 'catch', 'garden', 'clear'] as FavourKind[]) {
      const b = el('button', { 'data-testid': `favour-${kind}`, title: `About ${Math.round(FAVOUR_MINUTES[kind] / 60)} hours of work` }, FAVOUR_LABELS[kind]);
      b.addEventListener('click', () => favour(kind));
      fs.appendChild(b);
      controls.push(b);
      if (kind === 'clear') clear = b;
    }
    const visit = el('button', { 'data-testid': 'favour-visit', class: 'picks' }, FAVOUR_LABELS.visit);
    const mend = el('button', { 'data-testid': 'favour-mend', class: 'picks' }, FAVOUR_LABELS.mend);
    fs.append(visit, mend);
    controls.push(visit, mend);
    root.appendChild(fs);
    const picker = el('div', { class: 'picker', 'data-testid': 'talk-picker' });
    picker.hidden = true;
    root.appendChild(picker);
    const status = el('p', { class: 'quiet', 'data-testid': 'favour-status' });
    root.appendChild(status);

    p = { root, reply, replies, status, controls, clear, asked, picker, pick: null, pickKey: '', pickButtons: { opinion, visit, mend } };
    // Talking back: one reply per answer, each a logged command like the question was.
    replies.addEventListener('click', (ev) => {
      const chip = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-reply]');
      if (!chip) return;
      const kind = chip.dataset.reply as ReplyKind;
      say(REPLY_SAID[kind]);
      this.game.command({ kind: 'reply', who: id, reply: kind });
      this.renderJournal(true);
    });
    const open = (mode: 'opinion' | 'visit' | 'mend') => {
      p.pick = p.pick === mode ? null : mode;
      this.refreshTalkPanel(id, p);
    };
    opinion.addEventListener('click', () => open('opinion'));
    visit.addEventListener('click', () => open('visit'));
    mend.addEventListener('click', () => open('mend'));
    picker.addEventListener('click', (ev) => {
      const chip = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-pick]');
      if (!chip || !p.pick) return;
      const value = chip.dataset.pick as string;
      if (p.pick === 'opinion') ask('opinion', `What do you think of ${chip.dataset.label}?`, value);
      else favour(p.pick, value);
    });
    return p;
  }

  /** The chips for the open picker: people (with portraits) and, for opinions, places. */
  private pickOptions(id: string, mode: 'opinion' | 'visit' | 'mend'): Array<{ value: string; label: string; who?: string }> {
    const state = this.game.sim.state;
    const r = this.game.sim.resident(id);
    const others = state.order.filter((o) => o !== id && !state.residents[o]?.departed);
    const person = (o: string, value = o) => ({ value, label: residentDef(o).name, who: o });
    if (mode === 'visit') return others.map((o) => person(o));
    if (mode === 'mend') {
      const cool = others.filter((o) => (r.rel[o]?.affinity ?? 0) < 0.1);
      return (cool.length ? cool : others).map((o) => person(o));
    }
    const places = state.buildings.filter((b) => !b.removed && b.type !== 'wild' && b.type !== 'path' && buildingDef(b.type).kind !== 'home');
    return [
      ...others.map((o) => person(o, `r:${o}`)),
      ...places.map((b) => ({ value: `b:${b.id}`, label: this.game.narrator.subjectName(`b:${b.id}`) })),
    ];
  }

  private refreshTalkPanel(id: string, p: TalkPanel): void {
    const state = this.game.sim.state;
    const r = this.game.sim.resident(id);
    const asleep = r.activity?.id === 'sleep' && r.at === r.homeId;
    for (const c of p.controls) c.disabled = asleep || r.departed;
    p.clear.disabled = p.clear.disabled || openPlots(state).length === 0;
    p.clear.title = openPlots(state).length === 0 ? 'No wild land is open for clearing yet: the valley opens as the town thrives' : 'About 6 hours of work';
    if (asleep) p.pick = null;
    for (const [mode, b] of Object.entries(p.pickButtons)) b.classList.toggle('on', p.pick === mode);
    const options = p.pick ? this.pickOptions(id, p.pick) : [];
    const key = `${p.pick}:${options.map((o) => o.value).join('|')}`;
    if (key !== p.pickKey) {
      p.pickKey = key;
      p.picker.replaceChildren(
        ...options.map((o) => {
          const chip = el('button', { class: 'chip', 'data-pick': o.value, 'data-label': o.label, 'data-testid': `pick-${o.value.replace(':', '-')}` });
          if (o.who) chip.appendChild(portrait(o.who, 28));
          chip.appendChild(el('span', {}, o.label));
          return chip;
        }),
      );
    }
    p.picker.hidden = !p.pick;
    const last = this.game.narrator.lastReply;
    p.reply.textContent = asleep ? `${residentDef(id).name} is asleep. Talk in the morning.` : last && last.who === id ? `“${last.text}”` : '';
    // The replies open to this answer, until one is made.
    const open = !asleep && last && last.who === id && r.lastAnswer && !r.lastAnswer.replied ? r.lastAnswer.offers : [];
    const rkey = open.map((o) => o.kind).join('|');
    if (p.replies.dataset.key !== rkey) {
      p.replies.dataset.key = rkey;
      p.replies.replaceChildren(...open.map((o) => el('button', { class: 'chip reply', 'data-reply': o.kind, 'data-testid': `reply-${o.kind}` }, REPLY_LABELS[o.kind])));
    }
    p.replies.hidden = open.length === 0;
    const answered = p.reply.textContent !== '';
    (p.reply.parentElement as HTMLElement).hidden = !answered;
    p.asked.hidden = !answered || asleep || p.asked.textContent === '';
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
    // The roster is built once and only updated, so a name isn't swapped out under a finger.
    if (!this.rosterEl) {
      this.rosterEl = el('div', { class: 'roster' });
      this.journalBody = el('div');
      this.journalEl.replaceChildren(this.rosterEl, this.journalBody);
    }
    const order = this.game.sim.state.order;
    if (this.rosterEl.childElementCount !== order.length) {
      for (const id of order.slice(this.rosterEl.childElementCount)) {
        const b = el('button', { class: 'chip', 'data-testid': `roster-${id}`, 'data-id': id });
        b.append(portrait(id, 22), el('span', {}, residentDef(id).name));
        b.style.borderColor = cssColor(residentColor(id));
        b.addEventListener('click', () => this.select({ kind: 'resident', id }));
        this.rosterEl.appendChild(b);
      }
    }
    for (const b of this.rosterEl.children) {
      const id = (b as HTMLElement).dataset.id as string;
      b.classList.toggle('on', this.selected?.kind === 'resident' && this.selected.id === id);
      (b as HTMLElement).hidden = !!this.game.sim.state.residents[id]?.departed;
    }
    const pane = this.journalBody as HTMLElement;
    pane.replaceChildren();
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
        const go = el('button', { class: 'chip', 'data-testid': `open-resident-${rid}` });
        go.append(portrait(rid, 22), el('span', {}, residentDef(rid).name));
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
    const headRow = el('div', { class: 'journal-head' });
    headRow.appendChild(portrait(rep.id, 64));
    const head = el('h2', {}, `${rep.name}, ${rep.age}`);
    head.style.borderBottomColor = cssColor(residentColor(rep.id));
    headRow.appendChild(head);
    j.appendChild(headRow);
    if (!rep.departed) {
      const subs = el('div', { class: 'subtabs' });
      for (const [view, label] of [['about', 'About'], ['talk', 'Talk']] as const) {
        const b = el('button', { 'data-testid': `sub-${view}`, class: this.residentView === view ? 'on' : '' }, label);
        b.addEventListener('click', () => {
          this.residentView = view;
          this.renderJournal(true);
        });
        subs.appendChild(b);
      }
      j.appendChild(subs);
    }
    if (this.residentView === 'talk' && !rep.departed) {
      j.appendChild(el('p', { class: 'doing' }, `Now: ${rep.doing}`));
      j.appendChild(this.talkPanel(rep.id));
      pane.appendChild(j);
      return;
    }
    j.appendChild(el('p', { class: 'quiet' }, rep.background));
    if (!rep.departed) j.appendChild(this.factsSection(rep.id));
    if (!rep.departed) {
      const mem = this.memoriesSection(rep.id);
      if (mem) j.appendChild(mem);
    }
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
    const hour = Math.floor((t % 1440) / 60);
    const clockText = `Day ${dayOf(t)} · ${cap(seasonOf(t))} · ${clock(t)}${w}`;
    if (this.clockEl.dataset.text !== clockText) {
      this.clockEl.dataset.text = clockText;
      this.clockEl.innerHTML = `${w ? ICONS.cloud : hour >= 6 && hour < 20 ? ICONS.sun : ICONS.moon}<span><span class="day">Day ${dayOf(t)}</span><span class="season"> · ${cap(seasonOf(t))}</span> · ${clock(t)}<span class="season">${w}</span></span>`;
      this.clockEl.title = clockText;
    }
    for (const res of ['food', 'timber'] as const) {
      const v = Math.floor(state.stock[res]);
      const n = this.stockEl.querySelector(`[data-res="${res}"]`) as HTMLElement;
      const last = this.lastStock[res];
      if (n.textContent !== String(v)) n.textContent = String(v);
      // A little "+3" floats up when the stores rise (review: no feedback when things happen).
      if (last !== undefined && v > last) {
        const f = el('span', { class: `floater ${res}` }, `+${v - last}`);
        n.parentElement?.appendChild(f);
        setTimeout(() => f.remove(), 950);
      }
      this.lastStock[res] = v;
    }
    this.stockEl.classList.toggle('short', state.stock.food < 3);
    const prog = progressOf(state);
    if (prog.renown !== this.lastRenown) {
      const nt = nextTier(state);
      const gained = this.lastRenown >= 0 ? prog.renown - this.lastRenown : 0;
      this.lastRenown = prog.renown;
      this.renownEl.innerHTML = `${ICONS.star}<span class="tier">${TIERS[prog.tier]}</span><b>${prog.renown}</b><span class="bar"><i style="width:${nt ? pct((prog.renown - nt.from) / (nt.to - nt.from)) : '100%'}"></i></span>`;
      this.renownEl.title = nt ? `${prog.renown} renown · ${nt.need} more to ${nt.name}` : `${prog.renown} renown · a Townlet`;
      if (gained > 0) {
        const f = el('span', { class: 'floater renown-up' }, `+${gained}`);
        this.renownEl.appendChild(f);
        setTimeout(() => f.remove(), 950);
      }
    }
    this.renderGoals();
    this.renderFolk();
    const sack = this.stockEl.querySelector('[data-testid="granary-stock"]') as HTMLElement;
    sack.hidden = !hasGranary(state);
    if (!sack.hidden) {
      const put = Math.floor(state.granary ?? 0);
      // The target is shown small, and hidden on phones where the top bar is tight (it is on the Goals tab).
      const target = state.stores?.asked && !state.stores.outcome ? `/${state.stores.target}` : '';
      const b = sack.querySelector('b') as HTMLElement;
      if (b.dataset.text !== `${put}${target}`) {
        b.dataset.text = `${put}${target}`;
        b.replaceChildren(document.createTextNode(String(put)), ...(target ? [el('span', { class: 'of' }, target)] : []));
      }
      sack.title = `Granary: ${put} food put by (room for ${granaryRoom(state)})`;
    }
    this.renderBoard();
    if (!this.menu.hidden) this.refreshMenu();
    if (!this.tabs.get('journal')!.pane.hidden) this.renderJournal();
    if (!this.tabs.get('you')!.pane.hidden) this.renderYou();
    // New proposals get a popup, but not before the player has looked around (bar round 1: on a
    // phone the first thing after the intro was a decision about people you had not met).
    const passed = Math.max(0, state.tick - this.watchedFrom);
    this.watched += passed >= 120 ? passed : Math.min(5, passed);
    this.watchedFrom = state.tick;
    if (!this.modal && (this.lookedAround || this.watched >= 120)) {
      const d = state.story.dilemmas.find((x) => x.status === 'open' && !this.shownDilemmas.has(x.id));
      if (d) this.showDilemma(d);
    }
    const now = performance.now();
    const covers = this.panels.filter((p) => !p.hidden).map((p) => p.getBoundingClientRect());
    // At most two bubbles at once (review: six at a time was noise): whoever you're looking at
    // first, then what matters, then the newest. Zoomed far out, only theirs.
    const selectedId = this.selected?.kind === 'resident' ? this.selected.id : null;
    const zoomedOut = this.view.zoomLevel < 0.8;
    const live = [...this.bubbles.entries()]
      .filter(([id, b]) => now < b.until && (!zoomedOut || id === selectedId))
      .sort(([ia, a], [ib, b]) => Number(ib === selectedId) - Number(ia === selectedId) || Number(b.major) - Number(a.major) || b.born - a.born);
    const allowed = new Set(live.slice(0, 2).map(([id]) => id));
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const placed: DOMRect[] = [];
    for (const [id, b] of this.bubbles) {
      const pos = this.view.residentHead(id);
      let show = allowed.has(id) && pos !== null && pos.visible;
      if (show && pos) {
        b.el.hidden = false;
        b.el.style.left = `${pos.x}px`;
        b.el.style.top = `${pos.y}px`;
        // Keep it on screen, 16px from the edges.
        let r = b.el.getBoundingClientRect();
        const dx = r.left < 16 ? 16 - r.left : r.right > vw - 16 ? vw - 16 - r.right : 0;
        const dy = r.top < 16 ? 16 - r.top : 0;
        if (dx || dy) {
          b.el.style.left = `${pos.x + dx}px`;
          b.el.style.top = `${pos.y + dy}px`;
          r = b.el.getBoundingClientRect();
        }
        // Two bubbles that would overlap: the later one moves up out of the way (bar round 1).
        for (const other of placed) {
          if (r.left < other.right && r.right > other.left && r.top < other.bottom && r.bottom > other.top) {
            const lift = r.bottom - other.top + 8;
            b.el.style.top = `${parseFloat(b.el.style.top) - lift}px`;
            r = b.el.getBoundingClientRect();
          }
        }
        b.el.style.setProperty('--tail', `${Math.max(12, Math.min(r.width - 12, pos.x - r.left))}px`);
        // A bubble that would sit over the scroll, the dock or the top bar waits out of sight.
        show = r.bottom < vh && r.top > 0 && !covers.some((c) => r.left < c.right && r.right > c.left && r.top < c.bottom && r.bottom > c.top);
        if (show) placed.push(r);
      }
      b.el.hidden = !show;
    }
  }
}

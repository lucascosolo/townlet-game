// The paper UI around the diorama: clock and speed, the notice board, the town log, the
// resident journal ("Why?"), the build palette and thought bubbles. Everything it changes,
// it changes through Game.command.

import { buildingDef } from '../../../src/content/buildings.js';
import { residentDef } from '../../../src/content/residents.js';
import { DILEMMA_NAMES, PROPOSALS } from '../../../src/content/story.js';
import { residentReport, type ResidentReport } from '../../../src/inspect/inspector.js';
import type { NarratorEntry } from '../../../src/narrate/narrator.js';
import { opinion } from '../../../src/sim/mind/memory.js';
import { clock, dayOf, seasonOf } from '../../../src/sim/time.js';
import { SPEEDS, type Game } from '../game.js';
import { RESIDENT_COLORS } from '../view/meshes.js';
import type { TownView } from '../view/scene.js';

export const BUILD_TYPES = ['hedge', 'bench', 'flowerbed', 'garden', 'teahouse', 'bakery', 'workshop'] as const;
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

export class Ui {
  tool: Tool = { kind: 'select' };
  selected: { kind: 'resident'; id: string } | { kind: 'building'; id: number } | null = null;
  private readonly game: Game;
  private readonly view: TownView;
  private readonly clockEl: HTMLElement;
  private readonly speedButtons: HTMLButtonElement[] = [];
  private readonly tabs = new Map<string, { button: HTMLButtonElement; pane: HTMLElement }>();
  private readonly boardEl: HTMLElement;
  private readonly logEl: HTMLElement;
  private readonly journalEl: HTMLElement;
  private readonly paletteStatus: HTMLElement;
  private readonly paletteButtons = new Map<string, HTMLButtonElement>();
  private readonly bubbles = new Map<string, { el: HTMLElement; until: number }>();
  private readonly bubbleLayer: HTMLElement;
  private lastBoardKey = '';
  private lastJournalRender = 0;
  private morning: NarratorEntry[] = [];
  /** "Why?" sections the player has opened, kept open across re-renders. */
  private readonly openWhy = new Set<string>();

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

  constructor(root: HTMLElement, game: Game, view: TownView) {
    this.game = game;
    this.view = view;

    // Clock and speed.
    const hud = el('div', { class: 'hud paper' });
    this.clockEl = el('div', { class: 'clock', 'data-testid': 'clock' });
    const speeds = el('div', { class: 'speeds' });
    const labels = ['❚❚', '▶', '▶▶', '▶▶▶', '⏩'];
    SPEEDS.forEach((s, i) => {
      const b = el('button', { title: s === 0 ? 'Pause (space)' : `${s}× (${i})`, 'data-testid': `speed-${i}` }, labels[i]);
      b.addEventListener('click', () => this.setSpeed(i));
      speeds.appendChild(b);
      this.speedButtons.push(b);
    });
    const rot = el('div', { class: 'speeds' });
    const left = el('button', { title: 'Rotate left (Q)' }, '⟲');
    const right = el('button', { title: 'Rotate right (E)' }, '⟳');
    left.addEventListener('click', () => view.rotate(-1));
    right.addEventListener('click', () => view.rotate(1));
    rot.append(left, right);
    hud.append(el('div', { class: 'title' }, 'Townlet'), this.clockEl, speeds, rot);
    root.appendChild(hud);

    // Side panel with tabs.
    const side = el('aside', { class: 'side paper' });
    const tabBar = el('nav', { class: 'tabs' });
    side.appendChild(tabBar);
    for (const [key, label] of [
      ['board', 'Notice board'],
      ['log', 'Town log'],
      ['journal', 'Journal'],
    ] as const) {
      const button = el('button', { 'data-testid': `tab-${key}` }, label);
      const pane = el('section', { class: 'pane', 'data-pane': key });
      button.addEventListener('click', () => this.showTab(key));
      tabBar.appendChild(button);
      side.appendChild(pane);
      this.tabs.set(key, { button, pane });
    }
    this.boardEl = this.tabs.get('board')!.pane;
    this.logEl = this.tabs.get('log')!.pane;
    this.journalEl = this.tabs.get('journal')!.pane;
    root.appendChild(side);
    this.showTab('board');

    // Build palette.
    const palette = el('div', { class: 'palette paper' });
    const select = el('button', { 'data-testid': 'tool-select', title: 'Look and inspect (Esc)' }, 'Look');
    select.addEventListener('click', () => this.setTool({ kind: 'select' }));
    palette.appendChild(select);
    this.paletteButtons.set('select', select);
    for (const type of BUILD_TYPES) {
      const b = el('button', { 'data-testid': `tool-build-${type}` }, buildingDef(type).name);
      b.addEventListener('click', () => this.setTool({ kind: 'build', type }));
      palette.appendChild(b);
      this.paletteButtons.set(type, b);
    }
    const remove = el('button', { 'data-testid': 'tool-remove' }, 'Remove');
    remove.addEventListener('click', () => this.setTool({ kind: 'remove' }));
    palette.appendChild(remove);
    this.paletteButtons.set('remove', remove);
    this.paletteStatus = el('div', { class: 'status', 'data-testid': 'palette-status' });
    palette.appendChild(this.paletteStatus);
    root.appendChild(palette);

    this.bubbleLayer = el('div', { class: 'bubbles' });
    root.appendChild(this.bubbleLayer);

    game.narrator.onEntry((e) => this.onEntry(e));
    this.setSpeed(game.speedIndex);
    this.setTool({ kind: 'select' });
  }

  setSpeed(i: number): void {
    this.game.speedIndex = Math.max(0, Math.min(SPEEDS.length - 1, i));
    this.speedButtons.forEach((b, j) => b.classList.toggle('on', j === this.game.speedIndex));
  }

  setTool(tool: Tool): void {
    this.tool = tool;
    const key = tool.kind === 'build' ? tool.type : tool.kind;
    for (const [k, b] of this.paletteButtons) b.classList.toggle('on', k === key);
    this.view.setGhost(tool.kind === 'build' ? tool.type : null, null, false);
    this.view.highlightBuilding(null);
    this.paletteStatus.textContent =
      tool.kind === 'build' ? `Place a ${buildingDef(tool.type).name.toLowerCase()}: click a free spot.` : tool.kind === 'remove' ? 'Click a building to remove it. Homes stay.' : 'Click a resident or a building.';
  }

  status(text: string): void {
    this.paletteStatus.textContent = text;
  }

  showTab(key: string): void {
    for (const [k, t] of this.tabs) {
      t.button.classList.toggle('on', k === key);
      t.pane.hidden = k !== key;
    }
    if (key === 'journal') this.renderJournal(true);
  }

  select(target: Ui['selected']): void {
    this.selected = target;
    this.view.highlightBuilding(target?.kind === 'building' ? target.id : null);
    this.showTab('journal');
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
      a.style.borderBottomColor = cssColor(RESIDENT_COLORS[id] ?? 0x888888);
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

  private onEntry(e: NarratorEntry): void {
    if (e.kind === 'day') this.morning = [];
    if (e.kind === 'board') this.morning.push(e);
    const row = el('div', { class: `entry ${e.kind}` });
    if (e.kind === 'day') row.textContent = e.text;
    else {
      if (e.kind === 'live') row.appendChild(el('span', { class: 'time' }, clock(e.t)));
      for (const n of this.nameLinks(e.text)) row.appendChild(n);
    }
    const atBottom = this.logEl.scrollTop + this.logEl.clientHeight >= this.logEl.scrollHeight - 30;
    this.logEl.appendChild(row);
    while (this.logEl.childElementCount > 400) this.logEl.firstElementChild?.remove();
    if (atBottom) this.logEl.scrollTop = this.logEl.scrollHeight;

    // A quoted line becomes a bubble over whoever speaks first in it.
    const quote = /"([^"]+)"/.exec(e.text);
    if (quote && (e.kind === 'live' || e.kind === 'aside') && e.who.length > 0) {
      const speaker = [...e.who].sort((a, b) => e.text.indexOf(residentDef(a).name) - e.text.indexOf(residentDef(b).name))[0] as string;
      this.bubble(speaker, quote[1] as string);
    }
    this.lastBoardKey = '';
  }

  private bubble(id: string, text: string): void {
    let b = this.bubbles.get(id);
    if (!b) {
      b = { el: el('div', { class: 'bubble' }), until: 0 };
      b.el.style.borderColor = cssColor(RESIDENT_COLORS[id] ?? 0x888888);
      this.bubbleLayer.appendChild(b.el);
      this.bubbles.set(id, b);
    }
    b.el.textContent = text.length > 90 ? `${text.slice(0, 87)}…` : text;
    b.until = performance.now() + 7000;
  }

  // ---------------------------------------------------------------- the notice board

  private renderBoard(): void {
    const state = this.game.sim.state;
    const open = state.story.dilemmas.filter((d) => d.status === 'open');
    const requests = state.requests.filter((q) => q.status === 'open');
    const key = JSON.stringify([open.map((d) => d.id), requests.map((q) => q.id), this.morning.length, dayOf(state.tick)]);
    if (key === this.lastBoardKey) return;
    this.lastBoardKey = key;
    const pane = this.boardEl;
    pane.replaceChildren();

    pane.appendChild(el('h3', {}, 'Proposals'));
    if (open.length === 0) pane.appendChild(el('p', { class: 'quiet' }, 'Nobody is asking for anything just now.'));
    for (const d of open) {
      const def = residentDef(d.proposer);
      const card = el('div', { class: 'card', 'data-testid': `dilemma-${d.id}` });
      const lines = PROPOSALS[d.type];
      const line = (lines[def.voice.register] ?? lines.plain)[0] as string;
      card.appendChild(el('div', { class: 'card-title' }, `${def.name}: ${DILEMMA_NAMES[d.type]}`));
      card.appendChild(el('p', { class: 'quote' }, `“${line}”`));
      const hours = Math.max(0, Math.round((d.postedTick + 2 * 1440 - state.tick) / 60));
      card.appendChild(el('p', { class: 'quiet' }, `Unanswered proposals lapse in ${hours} h, and that is an answer too.`));
      const yes = el('button', { 'data-testid': `approve-${d.id}` }, 'Approve');
      const no = el('button', { 'data-testid': `decline-${d.id}` }, 'Decline');
      yes.addEventListener('click', () => this.game.command({ kind: 'decide', dilemma: d.type, option: 'approve' }));
      no.addEventListener('click', () => this.game.command({ kind: 'decide', dilemma: d.type, option: 'decline' }));
      card.append(yes, no);
      pane.appendChild(card);
    }

    pane.appendChild(el('h3', {}, 'Requests'));
    if (requests.length === 0) pane.appendChild(el('p', { class: 'quiet' }, 'No open requests.'));
    for (const q of requests) {
      const card = el('div', { class: 'card', 'data-testid': `request-${q.id}` });
      const statement = this.game.narrator.statement(q.by, { subject: q.subject, aspect: 'noisy_at_night' });
      card.appendChild(el('div', { class: 'card-title' }, `${residentDef(q.by).name} asks for quieter nights`));
      card.appendChild(el('p', {}, `${cap(statement)}. Something that softens the noise near ${residentDef(q.by).pronouns.poss} home would help.`));
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
      const li = el('li');
      for (const n of this.nameLinks(e.text)) li.appendChild(n);
      list.appendChild(li);
    }
    pane.appendChild(list);
  }

  // ---------------------------------------------------------------- the journal

  private renderJournal(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastJournalRender < 600) return;
    this.lastJournalRender = now;
    const pane = this.journalEl;
    pane.replaceChildren();
    const roster = el('div', { class: 'roster' });
    for (const id of this.game.sim.state.order) {
      const b = el('button', { 'data-testid': `roster-${id}` }, residentDef(id).name);
      b.style.borderColor = cssColor(RESIDENT_COLORS[id] ?? 0x888888);
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
    card.appendChild(el('p', { class: 'quiet' }, b.removed ? 'Gone now.' : `${buildingDef(b.type).kind} · placed ${b.placedBy === 'founding' ? 'before you arrived' : `on day ${dayOf(b.placedTick)}`}`));
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
    head.style.borderBottomColor = cssColor(RESIDENT_COLORS[rep.id] ?? 0x888888);
    j.appendChild(head);
    j.appendChild(el('p', { class: 'quiet' }, rep.background));
    j.appendChild(el('p', {}, `Hopes to: ${rep.aspiration.charAt(0).toLowerCase()}${rep.aspiration.slice(1)}`));
    if (rep.departed) {
      j.appendChild(el('p', {}, 'Has left the valley.'));
      pane.appendChild(j);
      return;
    }
    j.appendChild(el('p', { class: 'doing' }, `Now: ${rep.doing}`));
    if (rep.leavingSince !== null) j.appendChild(el('p', { class: 'warning' }, `Thinking of leaving (since day ${rep.leavingSince}).`));
    j.appendChild(this.meter('Mood', rep.mood));
    j.appendChild(this.meter('Settled here', rep.disposition));

    j.appendChild(el('h3', {}, 'Needs'));
    for (const n of rep.needs) j.appendChild(this.meter(cap(n.need), n.level, n.setpoint));

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

    j.appendChild(el('h3', {}, 'People'));
    const people = el('ul', { class: 'people' });
    for (const x of rep.relationships) {
      const word = x.tags.includes('close_friend') ? 'close friend' : x.tags.includes('friend') ? 'friend' : x.tags.includes('rival') ? 'not getting on' : x.affinity > 0.25 ? 'fond of' : x.affinity < -0.15 ? 'wary of' : 'knows';
      people.appendChild(el('li', {}, `${x.name}: ${word}`));
    }
    j.appendChild(people);

    if (rep.requests.length) {
      j.appendChild(el('h3', {}, 'Asked the steward'));
      const ul = el('ul');
      for (const q of rep.requests) ul.appendChild(el('li', {}, `About ${q.about}: ${q.status}`));
      j.appendChild(ul);
    }
    pane.appendChild(j);
  }

  // ---------------------------------------------------------------- per frame

  frame(): void {
    const t = this.game.sim.tick;
    const weather = this.game.sim.state.story.weather;
    const w = weather.kind !== 'clear' && t < weather.until ? ` · ${weather.kind}` : '';
    this.clockEl.textContent = `Day ${dayOf(t)} · ${cap(seasonOf(t))} · ${clock(t)}${w}`;
    this.renderBoard();
    if (!this.tabs.get('journal')!.pane.hidden) this.renderJournal();
    const now = performance.now();
    for (const [id, b] of this.bubbles) {
      const pos = this.view.residentHead(id);
      const show = pos !== null && pos.visible && now < b.until;
      b.el.hidden = !show;
      if (show && pos) {
        b.el.style.left = `${pos.x}px`;
        b.el.style.top = `${pos.y}px`;
      }
    }
  }
}

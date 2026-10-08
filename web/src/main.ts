// Townlet greybox: wires the game, the 3D view and the paper UI, and handles input.
// URL parameters: ?scenario=quiet|bakery|neglect|caring&seed=1&steward=none|considerate|...&speed=0..4

import { pickAds } from './ads.js';
import { buildingDef } from '../../src/content/buildings.js';
import { STEWARD_POLICIES, type StewardPolicy } from '../../src/scenarios/steward.js';
import { canPlace, footprint } from '../../src/sim/world.js';
import { Game } from './game.js';
import { clearSave, loadSave, restore, saveGame } from './save.js';
import { Ui } from './ui/ui.js';
import { TownView, seatingOrder } from './view/scene.js';

const params = new URLSearchParams(location.search);
const stewardParam = params.get('steward') as StewardPolicy | null;
// A save is picked up when the page is opened plainly (M4); a URL naming a town, or ?new=1, starts fresh.
const fresh = params.has('new');
if (fresh) {
  clearSave();
  params.delete('new');
  history.replaceState(null, '', `${location.pathname}${params.toString() ? `?${params}` : ''}`);
}
// A link that names a town restores its save when one matches (bar round 2: a shared link used to
// start over every time); only ?new=1 starts fresh.
const found = fresh ? null : loadSave();
const named = params.has('scenario') || params.has('seed');
const saved = found && (!named || (found.scenario === (params.get('scenario') ?? 'quiet') && found.seed === (Number(params.get('seed') ?? 1) || 1))) ? found : null;
const game = new Game(
  saved
    ? { scenario: saved.scenario, seed: saved.seed, steward: saved.steward }
    : {
        scenario: params.get('scenario') ?? 'quiet',
        seed: fresh ? 1 + Math.floor(Math.random() * 1_000_000) : Number(params.get('seed') ?? 1) || 1,
        // In the browser, the player is the steward.
        steward: stewardParam && STEWARD_POLICIES.includes(stewardParam) ? stewardParam : 'none',
      },
);
if (saved) restore(game, saved);
if (params.has('speed')) game.speedIndex = Number(params.get('speed'));

const app = document.getElementById('app') as HTMLElement;
const stage = document.getElementById('stage') as HTMLElement;
const view = new TownView(stage, game);
// ?fx=low forces the cheap renderer (no bloom, no lamp lights), as slow hardware gets anyway.
if (params.get('fx') === 'low') view.setLowQuality();
// A new game opens on a morning, not at midnight (review: the first frame was the dark).
const intro = params.get('intro') !== '0' && !saved;
if (intro && game.sim.tick === 0) game.runTicks(7 * 60 + 30);
const ui = new Ui(app, game, view, { intro });
// A rewarded-ad provider, if this build or page has one; the offer appears only then (2026-10-08).
void pickAds(params).then((ads) => ui.setAds(ads));
game.onEvent((e) => {
  if (e.type === 'exchange') view.facePair(e.a, e.b);
});
// Start with the town centred in the space left of the side panel.
if (window.innerWidth > 760) view.pan(-180, 0);

// ------------------------------------------------------------------ input

const canvas = view.renderer.domElement;
// Left-drag moves the view; right- or middle-drag turns it around the town. On a phone, one
// finger moves the view, two fingers pinch to zoom and twist to turn.
let down: { x: number; y: number; moved: boolean; turn: boolean } | null = null;
let lastHover: [number, number] | null = null;
const pointers = new Map<number, { x: number; y: number }>();
let pinch: { dist: number; angle: number } | null = null;

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function twoFingers(): { dist: number; angle: number } {
  const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
  return { dist: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x) };
}

// Touch building (owner: "drag the object around and then press a button to place or cancel").
// On touch, choosing a building puts an outline mid-view; dragging the outline moves it, dragging
// elsewhere moves the camera, a tap moves it there, and the bar places, rotates or cancels.
let touchUI = window.matchMedia('(pointer: coarse)').matches;
let ghostAt: [number, number] | null = null;
let draggingGhost = false;

function refreshTouchGhost(): void {
  const tool = ui.tool;
  if (tool.kind !== 'build' || !ghostAt) return;
  const ok = canPlace(game.sim.state, tool.type, ghostAt[0], ghostAt[1], ui.rotation) === null && game.sim.canAfford(tool.type);
  view.setGhost(tool.type, ghostAt, ok, ui.rotation);
  ui.showPlaceBar(true, ok);
}

function startTouchPlacement(): void {
  const tool = ui.tool;
  if (tool.kind !== 'build') return;
  const tile = view.tileAt(window.innerWidth / 2, window.innerHeight * 0.4) ?? [12, 12];
  ghostAt = footprintAt(tool.type, tile[0], tile[1]);
  refreshTouchGhost();
}

ui.onToolChange = (tool) => {
  if (tool.kind === 'build' && tool.type === 'path') {
    ghostAt = null;
    ui.showPathBar(true);
  } else if (tool.kind === 'build' && touchUI) setTimeout(startTouchPlacement, 0);
  else {
    ghostAt = null;
    ui.showPlaceBar(false);
  }
};

function placeGhost(): void {
  const tool = ui.tool;
  if (tool.kind !== 'build' || !ghostAt) return;
  const err = canPlace(game.sim.state, tool.type, ghostAt[0], ghostAt[1], ui.rotation);
  if (err) return ui.status(`Can't build there: ${err.replace(/ #\d+/, '')}.`);
  if (!game.sim.canAfford(tool.type)) return ui.status(`Not enough timber (${buildingDef(tool.type).cost} needed).`);
  game.command({ kind: 'build', type: tool.type, x: ghostAt[0], y: ghostAt[1], ...(ui.rotation ? { rot: ui.rotation } : {}) });
  ui.status(`${buildingDef(tool.type).name} placed. Move the outline for another, or Cancel.`);
  game.runTicks(0);
  refreshTouchGhost();
}
ui.placeButtons.ok.addEventListener('click', placeGhost);
ui.placeButtons.rotate.addEventListener('click', () => {
  ui.rotate();
  if (ghostAt && ui.tool.kind === 'build') ghostAt = footprintAt(ui.tool.type, ghostAt[0], ghostAt[1]);
  refreshTouchGhost();
});
ui.placeButtons.cancel.addEventListener('click', () => ui.setTool({ kind: 'select' }));

/** Is this tile on (or right next to) the outline being placed? */
function onGhost(tile: [number, number] | null): boolean {
  const tool = ui.tool;
  if (!tile || !ghostAt || tool.kind !== 'build') return false;
  const [w, d] = footprint(tool.type, ui.rotation);
  return tile[0] >= ghostAt[0] - 1 && tile[0] <= ghostAt[0] + w && tile[1] >= ghostAt[1] - 1 && tile[1] <= ghostAt[1] + d;
}

// Laying paths (2026-10-05): with the Path tool, a press and drag lays a tile on every square the
// pointer crosses, on a mouse or a finger; the view doesn't move while you lay.
let painting = false;
let lastPainted = '';
const isPathTool = () => ui.tool.kind === 'build' && ui.tool.type === 'path';
function paintAt(cx: number, cy: number): void {
  const tile = view.tileAt(cx, cy);
  if (!tile) return;
  const k = `${tile[0]},${tile[1]}`;
  if (k === lastPainted) return;
  lastPainted = k;
  if (canPlace(game.sim.state, 'path', tile[0], tile[1]) !== null) return;
  game.command({ kind: 'build', type: 'path', x: tile[0], y: tile[1] });
  game.runTicks(0);
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'mouse') {
    if (!touchUI) {
      touchUI = true;
      if (ui.tool.kind === 'build') startTouchPlacement();
    }
  } else touchUI = false;
  if (isPathTool() && pointers.size === 0 && e.button === 0) {
    painting = true;
    lastPainted = '';
    paintAt(e.clientX, e.clientY);
  } else if (touchUI && ui.tool.kind === 'build' && pointers.size === 0 && onGhost(view.tileAt(e.clientX, e.clientY))) draggingGhost = true;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  canvas.setPointerCapture(e.pointerId);
  if (pointers.size === 2) {
    // A second finger: this is a pinch or a twist, not a tap or a drag.
    painting = false;
    pinch = twoFingers();
    if (down) down.moved = true;
    return;
  }
  down = { x: e.clientX, y: e.clientY, moved: false, turn: e.button === 1 || e.button === 2 };
});

canvas.addEventListener('pointermove', (e) => {
  const prev = pointers.get(e.pointerId);
  if (prev) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (painting && pointers.size <= 1) {
    paintAt(e.clientX, e.clientY);
    if (down) down.moved = true;
    return;
  }
  if (draggingGhost && ui.tool.kind === 'build') {
    const tile = view.tileAt(e.clientX, e.clientY);
    if (tile) {
      ghostAt = footprintAt(ui.tool.type, tile[0], tile[1]);
      refreshTouchGhost();
    }
    if (down) down.moved = true;
    return;
  }
  if (pinch && pointers.size >= 2) {
    const now = twoFingers();
    if (pinch.dist > 0 && now.dist > 0) view.zoom(now.dist / pinch.dist);
    let turn = now.angle - pinch.angle;
    if (turn > Math.PI) turn -= 2 * Math.PI;
    if (turn < -Math.PI) turn += 2 * Math.PI;
    // orbit() turns 0.008 radians per pixel of drag; turn the town with the fingers, one for one.
    view.orbit(turn / 0.008);
    pinch = now;
    return;
  }
  if (down && prev && (down.moved || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6)) {
    if (!down.moved) down.moved = true;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    if (down.turn) view.orbit(dx);
    else view.pan(dx, dy);
    return;
  }
  if (e.pointerType === 'mouse') {
    lastHover = [e.clientX, e.clientY];
    hover(e.clientX, e.clientY);
  }
});

function release(e: PointerEvent): void {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
}

canvas.addEventListener('pointerup', (e) => {
  const wasClick = down && !down.moved && !down.turn && pointers.size === 1;
  release(e);
  if (pointers.size === 0) down = null;
  draggingGhost = false;
  if (painting) {
    painting = false;
    return;
  }
  // On touch, a tap while building moves the outline there; it never builds by itself.
  if (wasClick && touchUI && ui.tool.kind === 'build') {
    const tile = view.tileAt(e.clientX, e.clientY);
    if (tile) {
      ghostAt = footprintAt(ui.tool.type, tile[0], tile[1]);
      refreshTouchGhost();
    }
    return;
  }
  if (wasClick) {
    if (e.pointerType !== 'mouse') hover(e.clientX, e.clientY);
    click(e.clientX, e.clientY);
  }
});
canvas.addEventListener('pointercancel', (e) => {
  painting = false;
  release(e);
  if (pointers.size === 0) down = null;
});

// No browser zoom or text-selection callouts on phones: the game handles its own gestures.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  view.zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1);
}, { passive: false });

function footprintAt(type: string, x: number, y: number): [number, number] {
  const [w, d] = footprint(type, ui.rotation);
  return [x - Math.floor((w - 1) / 2), y - Math.floor((d - 1) / 2)];
}

function hover(cx: number, cy: number): void {
  const tool = ui.tool;
  if (tool.kind === 'build') {
    const tile = view.tileAt(cx, cy);
    const at = tile ? footprintAt(tool.type, tile[0], tile[1]) : null;
    view.setGhost(tool.type, at, at !== null && canPlace(game.sim.state, tool.type, at[0], at[1], ui.rotation) === null && game.sim.canAfford(tool.type), ui.rotation);
  } else if (tool.kind === 'remove') {
    const p = view.pick(cx, cy, { paths: true });
    view.highlightBuilding(p?.kind === 'building' ? p.id : null);
  }
}

function click(cx: number, cy: number): void {
  const tool = ui.tool;
  if (tool.kind === 'build') {
    const tile = view.tileAt(cx, cy);
    if (!tile) return;
    const [x, y] = footprintAt(tool.type, tile[0], tile[1]);
    const err = canPlace(game.sim.state, tool.type, x, y, ui.rotation);
    if (err) {
      ui.status(`Can't build there: ${err.replace(/ #\d+/, '')}.`);
      return;
    }
    if (!game.sim.canAfford(tool.type)) {
      ui.status(`Not enough timber (${buildingDef(tool.type).cost} needed). The woodlot makes more.`);
      return;
    }
    game.command({ kind: 'build', type: tool.type, x, y, ...(ui.rotation ? { rot: ui.rotation } : {}) });
    ui.status(`${buildingDef(tool.type).name} placed. Click again for another · R rotates · Esc stops.`);
    return;
  }
  const p = view.pick(cx, cy, { people: tool.kind !== 'remove', paths: tool.kind === 'remove' });
  if (tool.kind === 'remove') {
    if (p?.kind !== 'building') return;
    const b = game.sim.state.buildings.find((x) => x.id === p.id);
    if (!b) return;
    if (buildingDef(b.type).kind === 'home') {
      ui.status("Homes can't be removed.");
      return;
    }
    game.command({ kind: 'remove', x: b.x, y: b.y });
    ui.status(`${buildingDef(b.type).name} removed.`);
    return;
  }
  if (p?.kind === 'resident') ui.select({ kind: 'resident', id: p.id });
  else if (p?.kind === 'building') ui.select({ kind: 'building', id: p.id });
}

window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === 'r' && ui.tool.kind === 'build') {
    ui.rotate();
    if (touchUI) refreshTouchGhost();
    else if (lastHover) hover(lastHover[0], lastHover[1]);
  } else if (k === 'q') view.rotate(-1);
  else if (k === 'e') view.rotate(1);
  else if (k === ' ') {
    e.preventDefault();
    ui.setSpeed(game.speedIndex === 0 ? 1 : 0);
  } else if (k >= '0' && k <= '4') ui.setSpeed(Number(k));
  else if (k === 'escape') ui.setTool({ kind: 'select' });
  else if (k === '+' || k === '=') view.zoom(1.15);
  else if (k === '-') view.zoom(1 / 1.15);
  else if (k === 'w' || k === 'arrowup') view.pan(0, 40);
  else if (k === 's' || k === 'arrowdown') view.pan(0, -40);
  else if (k === 'a' || k === 'arrowleft') view.pan(40, 0);
  else if (k === 'd' || k === 'arrowright') view.pan(-40, 0);
});

// ------------------------------------------------------------------ the loop

let last = performance.now();
let fps = 60;
function loop(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  fps = fps * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;
  game.advance(dt);
  view.frame(dt);
  ui.frame();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
// The page's own loading screen (index.html) fades once the first frame is drawn.
requestAnimationFrame(() => {
  const loader = document.getElementById('loader');
  if (!loader) return;
  loader.classList.add('done');
  setTimeout(() => loader.remove(), 400);
});

// ------------------------------------------------------------------ test and debug handle

declare global {
  interface Window {
    __townlet: unknown;
  }
}
window.__townlet = {
  game,
  view,
  ui,
  stats: () => ({ fps, stepMs: game.stepMs, tick: game.sim.tick, eventHash: game.eventHash, eventCount: game.eventCount, commands: game.commandLog }),
  runTicks: (n: number) => game.runTicks(n),
  save: () => saveGame(game),
  residentScreen: (id: string) => view.residentScreen(id),
  buildingScreen: (id: number) => view.buildingScreen(id),
  tileScreen: (x: number, y: number) => view.tileScreen(x, y),
  focus: (x: number, y: number) => view.focusOn(x, y),
  yaw: () => view.yaw,
  seating: (placeId: number) => {
    const ids = game.sim.state.order.filter((id) => game.sim.resident(id).at === placeId);
    return seatingOrder(game.sim.state, ids);
  },
};

// Keep the town: every little while, and whenever the page is put away.
setInterval(() => saveGame(game), 15_000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveGame(game);
});
window.addEventListener('pagehide', () => saveGame(game));

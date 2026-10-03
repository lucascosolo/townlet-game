// Townlet greybox: wires the game, the 3D view and the paper UI, and handles input.
// URL parameters: ?scenario=quiet|bakery|neglect|caring&seed=1&steward=none|considerate|...&speed=0..4

import { buildingDef } from '../../src/content/buildings.js';
import { STEWARD_POLICIES, type StewardPolicy } from '../../src/scenarios/steward.js';
import { canPlace } from '../../src/sim/world.js';
import { Game } from './game.js';
import { Ui } from './ui/ui.js';
import { TownView } from './view/scene.js';

const params = new URLSearchParams(location.search);
const stewardParam = params.get('steward') as StewardPolicy | null;
const game = new Game({
  scenario: params.get('scenario') ?? 'quiet',
  seed: Number(params.get('seed') ?? 1) || 1,
  // In the browser, the player is the steward.
  steward: stewardParam && STEWARD_POLICIES.includes(stewardParam) ? stewardParam : 'none',
});
if (params.has('speed')) game.speedIndex = Number(params.get('speed'));

const app = document.getElementById('app') as HTMLElement;
const stage = document.getElementById('stage') as HTMLElement;
const view = new TownView(stage, game);
const ui = new Ui(app, game, view);
// Start with the town centred in the space left of the side panel.
if (window.innerWidth > 760) view.pan(-180, 0);

// ------------------------------------------------------------------ input

const canvas = view.renderer.domElement;
let down: { x: number; y: number; moved: boolean } | null = null;

canvas.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, moved: false };
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  if (down && (down.moved || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6)) {
    if (!down.moved) down.moved = true;
    view.pan(e.movementX, e.movementY);
    return;
  }
  hover(e.clientX, e.clientY);
});

canvas.addEventListener('pointerup', (e) => {
  const wasClick = down && !down.moved;
  down = null;
  if (wasClick) click(e.clientX, e.clientY);
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  view.zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1);
}, { passive: false });

function footprintAt(type: string, x: number, y: number): [number, number] {
  const [w, d] = buildingDef(type).size;
  return [x - Math.floor((w - 1) / 2), y - Math.floor((d - 1) / 2)];
}

function hover(cx: number, cy: number): void {
  const tool = ui.tool;
  if (tool.kind === 'build') {
    const tile = view.tileAt(cx, cy);
    const at = tile ? footprintAt(tool.type, tile[0], tile[1]) : null;
    view.setGhost(tool.type, at, at !== null && canPlace(game.sim.state, tool.type, at[0], at[1]) === null);
  } else if (tool.kind === 'remove') {
    const p = view.pick(cx, cy);
    view.highlightBuilding(p?.kind === 'building' ? p.id : null);
  }
}

function click(cx: number, cy: number): void {
  const tool = ui.tool;
  if (tool.kind === 'build') {
    const tile = view.tileAt(cx, cy);
    if (!tile) return;
    const [x, y] = footprintAt(tool.type, tile[0], tile[1]);
    const err = canPlace(game.sim.state, tool.type, x, y);
    if (err) {
      ui.status(`Can't build there: ${err.replace(/ #\d+/, '')}.`);
      return;
    }
    game.command({ kind: 'build', type: tool.type, x, y });
    ui.status(`${buildingDef(tool.type).name} placed. Click again to place another; Esc to stop.`);
    return;
  }
  const p = view.pick(cx, cy);
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
  if (k === 'q') view.rotate(-1);
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
  residentScreen: (id: string) => view.residentScreen(id),
  buildingScreen: (id: number) => view.buildingScreen(id),
  tileScreen: (x: number, y: number) => view.tileScreen(x, y),
  focus: (x: number, y: number) => view.focusOn(x, y),
};

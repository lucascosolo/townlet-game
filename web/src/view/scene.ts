// The town in 3D: an isometric diorama with quarter-turn rotation, pan and zoom (DECISIONS,
// M2 camera), time-of-day and seasonal lighting, and picking. It only reads sim state.

import * as THREE from 'three';
import { buildingDef } from '../../../src/content/buildings.js';
import { minuteOf, seasonOf, type Season } from '../../../src/sim/time.js';
import type { BuildingState, ResidentState, SimState } from '../../../src/sim/types.js';
import { WEAR_SHOW, brookSide, footprint, placeTile, shownWear, sizeOf } from '../../../src/sim/world.js';
import type { Game } from '../game.js';
import { buildingMesh, glow, mat, residentMesh, seasonalLeaf } from './meshes.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/** Real point lights placed at the lamps nearest the view (the rest glow by their ground pools). */
const LAMP_LIGHTS = 10;
const LAMP_COLOR = 0xffb75e;
/** Places people stand on rather than around. */
const OPEN_GROUND = new Set(['commons', 'garden', 'jetty', 'bench', 'flowerbed', 'brook']);

export type Pick = { kind: 'resident'; id: string } | { kind: 'building'; id: number } | { kind: 'ground'; x: number; y: number };

const SEASON_GROUND: Record<Season, number> = { spring: 0x9cc77a, summer: 0x86b45e, autumn: 0xc2a861, winter: 0xdfe3e4 };
const SEASON_LEAF: Record<Season, number> = { spring: 0x6dbb5a, summer: 0x4f9a44, autumn: 0xd9862f, winter: 0xb9c4c8 };
const CAMERA_TILT = THREE.MathUtils.degToRad(35);
const FESTOON_LAMP = new THREE.OctahedronGeometry(0.07, 0);

/** How much of night it is, 0 at full day, 1 at full night, with soft dawn and dusk. */
export function nightness(minute: number): number {
  const h = minute / 60;
  if (h >= 7 && h <= 18) return 0;
  if (h > 18 && h < 21) return (h - 18) / 3;
  if (h > 4.5 && h < 7) return 1 - (h - 4.5) / 2.5;
  return 1;
}

/**
 * Order residents around a place so friends are adjacent: start from the first and keep adding
 * whoever likes the last one placed best. Rivals end up as far apart as the ring allows.
 */
export function seatingOrder(state: { residents: Record<string, ResidentState> }, ids: string[]): string[] {
  if (ids.length <= 2) return ids;
  const left = [...ids];
  const order = [left.shift() as string];
  while (left.length) {
    const last = state.residents[order[order.length - 1] as string] as ResidentState;
    left.sort((a, b) => (last.rel[b]?.affinity ?? 0) - (last.rel[a]?.affinity ?? 0));
    order.push(left.shift() as string);
  }
  return order;
}

export class TownView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  private readonly game: Game;
  private readonly target = new THREE.Vector3();
  /** Where the camera is turning to, and where it is now (radians around the town). */
  private azimuthGoal = Math.PI / 4;
  private azimuth = Math.PI / 4;
  private readonly sun = new THREE.DirectionalLight(0xffffff, 1.4);
  private readonly hemi = new THREE.HemisphereLight(0xdfefff, 0x6b5a3a, 0.6);
  /** Cool moonlight from behind the camera at night, so roofs keep their shape (review: silhouettes). */
  private readonly moon = new THREE.DirectionalLight(0x9fb3e6, 0);
  private readonly ground: THREE.Mesh;
  private readonly groundMat = new THREE.MeshLambertMaterial({ color: SEASON_GROUND.spring });
  private readonly leafMat = mat(SEASON_LEAF.spring);
  /** The same seasonal leaf for the woods, whose trees carry their own shade per vertex. */
  private readonly leafMatV = seasonalLeaf.clone();
  private readonly buildings = new Map<number, THREE.Group>();
  private readonly residents = new Map<string, THREE.Group>();
  private readonly ringOffsets = new Map<string, THREE.Vector3>();
  private ghost: THREE.Group | null = null;
  private ghostType: string | null = null;
  private highlighted: number | null = null;
  private readonly rain: THREE.LineSegments;
  private readonly raycaster = new THREE.Raycaster();
  private readonly festoon = new THREE.Group();
  private season: Season = 'spring';
  /** Buildings popping into place, and dust puffs (review: no feedback when things happen). */
  private readonly popping = new Map<THREE.Group, number>();
  private readonly dust: Array<{ mesh: THREE.Mesh; v: THREE.Vector3; born: number }> = [];
  private readonly dustMat = new THREE.MeshLambertMaterial({ color: 0xcdb48c, transparent: true, opacity: 0.8 });
  private firstSync = true;
  /** Worn dirt paths between homes, work and the places people gather (review: no paths). */
  private readonly pathCanvas = document.createElement('canvas');
  private readonly pathTexture: THREE.CanvasTexture;
  private pathsKey = '';
  /** A soft ring under the selected resident. */
  private readonly ring: THREE.Mesh;
  private ringFor: string | null = null;
  private readonly grid: THREE.GridHelper;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly lamps: THREE.PointLight[] = [];
  private lampPoints: THREE.Vector3[] = [];
  private lampsDirty = true;
  private lastLampPick = 0;
  private skyKey = '';
  /** Who is talking to whom, for a few seconds after an exchange. */
  private readonly talking = new Map<string, { with: string; until: number }>();

  /** Called for each exchange: the two turn to face each other. */
  facePair(a: string, b: string): void {
    const until = performance.now() + 4000;
    this.talking.set(a, { with: b, until });
    this.talking.set(b, { with: a, until });
  }

  constructor(container: HTMLElement, game: Game) {
    this.game = game;
    const { width, height } = game.sim.state;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
    // The sky is a CSS gradient behind a transparent canvas: free, where a sky texture cost a full-screen draw.
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
    // Start over the settled valley; the wild land around it is there to be cleared.
    const settled = game.sim.state.settled ?? { width, height };
    this.target.set(settled.width / 2, 0, settled.height / 2);
    this.camera.zoom = 1.35;

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = Math.max(width, height) * 0.75;
    Object.assign(this.sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 120 });
    this.sun.target.position.copy(this.target);
    this.scene.add(this.sun, this.sun.target, this.hemi, this.moon, this.moon.target);

    // Grass with a little variation tile to tile, so the valley isn't one flat colour.
    const groundGeo = new THREE.PlaneGeometry(width, height, width, height);
    const colors: number[] = [];
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < groundGeo.attributes.position!.count; i++) {
      const v = 0.94 + rnd() * 0.12;
      colors.push(v, v * (0.99 + rnd() * 0.03), v);
    }
    groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.groundMat.vertexColors = true;
    this.ground = new THREE.Mesh(groundGeo, this.groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.set(width / 2, 0, height / 2);
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    // The valley is a piece of land, not a tile: earth beneath it, with a darker band of rock.
    // Only the four sides are drawn (a closed box would fill the screen underneath the grass).
    const skirt = (y: number, h: number, color: number, grow: number) => {
      const m = new THREE.MeshLambertMaterial({ color });
      for (const [x, z, w, ry] of [
        [width / 2, height + grow, width + 2 * grow, 0],
        [width / 2, -grow, width + 2 * grow, Math.PI],
        [width + grow, height / 2, height + 2 * grow, Math.PI / 2],
        [-grow, height / 2, height + 2 * grow, -Math.PI / 2],
      ] as const) {
        const side = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
        side.position.set(x, y, z);
        side.rotation.y = ry;
        this.scene.add(side);
      }
    };
    skirt(-0.06, 0.12, SEASON_GROUND.spring, 0.02);
    skirt(-0.7, 1.15, 0x6b4a32, 0);
    skirt(-1.45, 0.4, 0x4e3626, 0.03);
    // Paths: an alpha map over the ground, drawn from the routes people walk.
    this.pathCanvas.width = width * 4;
    this.pathCanvas.height = height * 4;
    this.pathTexture = new THREE.CanvasTexture(this.pathCanvas);
    this.pathTexture.magFilter = THREE.LinearFilter;
    const paths = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshLambertMaterial({ color: 0xb89a6a, alphaMap: this.pathTexture, transparent: true, depthWrite: false }),
    );
    paths.rotation.x = -Math.PI / 2;
    paths.position.set(width / 2, 0.012, height / 2);
    paths.receiveShadow = true;
    paths.renderOrder = 0;
    this.scene.add(paths);
    // The tile grid shows only while building.
    this.grid = new THREE.GridHelper(width, width, 0x000000, 0x000000);
    (this.grid.material as THREE.Material).opacity = 0.08;
    (this.grid.material as THREE.Material).transparent = true;
    this.grid.position.set(width / 2, 0.005, height / 2);
    this.grid.visible = false;
    this.scene.add(this.grid);

    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 32), new THREE.MeshBasicMaterial({ color: 0xfff1c9, transparent: true, opacity: 0.85, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.ring.renderOrder = 2;
    this.scene.add(this.ring);
    // Warm lamplight at night: a handful of real lights placed at the nearest lamps.
    for (let i = 0; i < LAMP_LIGHTS; i++) {
      const l = new THREE.PointLight(LAMP_COLOR, 0, 6, 2);
      this.lamps.push(l);
      this.scene.add(l);
    }


    // Rain: short falling streaks, shown only in wet weather.
    const n = 600;
    const pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const x = Math.random() * width;
      const z = Math.random() * height;
      const y = Math.random() * 12;
      pos.set([x, y, z, x, y - 0.35, z], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xaecbe0, transparent: true, opacity: 0.55 }));
    this.rain.visible = false;
    this.scene.add(this.rain, this.festoon);

    // A soft bloom, so lit windows and lanterns glow (review: the night must read as lantern-lit).
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.4, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Show the tile grid (while building). */
  showGrid(on: boolean): void {
    this.grid.visible = on;
  }

  private paintSky(top: THREE.Color, bottom: THREE.Color): void {
    const key = top.getHexString() + bottom.getHexString();
    if (key === this.skyKey) return;
    this.skyKey = key;
    const host = this.renderer.domElement.parentElement;
    if (host) host.style.background = `linear-gradient(180deg, #${top.getHexString()} 0%, #${bottom.getHexString()} 100%)`;
  }

  /** A window is lit only while someone behind it is awake (owner: houses go dark when everyone sleeps). */
  private lightWindows(state: SimState): void {
    const awake = new Set<number>();
    for (const r of Object.values(state.residents)) {
      if (r.departed || r.at === null || r.activity?.id === 'sleep') continue;
      awake.add(r.at);
    }
    for (const [id, g] of this.buildings) {
      const windows = g.userData.windows as THREE.Mesh[] | undefined;
      if (!windows) continue;
      const lit = awake.has(id);
      const m = lit ? glow.window : glow.windowDark;
      if (windows[0]?.material === m) continue;
      for (const w of windows) w.material = m;
      // The porch lantern goes out with the house, light and all.
      const porch = g.userData.porch as THREE.Object3D | undefined;
      if (porch) porch.visible = lit;
      const lamp = g.userData.porchLamp as THREE.Mesh | undefined;
      if (lamp) lamp.material = lit ? glow.lantern : glow.lanternOut;
      this.lampsDirty = true;
    }
    // Street lamps burn while anyone in the valley is still up, and go out when the last one is in
    // bed (owner, 2026-10-09: "not at a set time").
    const up = Object.values(state.residents).some((r) => !r.departed && r.activity?.id !== 'sleep');
    if (up !== this.streetLit) {
      this.streetLit = up;
      for (const g of this.buildings.values()) {
        g.traverse((o) => {
          if (o.name !== 'street-lamp') return;
          (o.userData.spot as THREE.Object3D).visible = up;
          (o.userData.lamp as THREE.Mesh).material = up ? glow.lantern : glow.lanternOut;
        });
      }
      this.lampsDirty = true;
    }
  }

  /** Whether the street lamps are lit; null until first set, so a new building is brought into line. */
  private streetLit: boolean | null = null;

  /** Put the real lights at the lamps nearest the middle of the view. */
  private placeLamps(night: number): void {
    if (this.lampsDirty) {
      this.lampsDirty = false;
      this.lastLampPick = 0;
      this.lampPoints = [];
      this.scene.updateMatrixWorld();
      for (const g of this.buildings.values()) g.traverse((o) => o.name === 'light' && o.parent?.visible !== false && this.lampPoints.push(o.getWorldPosition(new THREE.Vector3())));
    }
    const now = performance.now();
    if (now - this.lastLampPick > 400) {
      this.lastLampPick = now;
      const near = [...this.lampPoints].sort((a, b) => a.distanceToSquared(this.target) - b.distanceToSquared(this.target));
      this.lamps.forEach((l, i) => {
        const p = near[i];
        l.visible = !!p;
        if (p) l.position.copy(p);
      });
    }
    for (const l of this.lamps) l.intensity = night * 2.2;
  }

  /** The stage size the renderer was last fitted to. */
  private sized: [number, number] = [0, 0];

  resize(): void {
    const el = this.renderer.domElement.parentElement as HTMLElement;
    const w = el.clientWidth || window.innerWidth;
    const h = el.clientHeight || window.innerHeight;
    this.sized = [el.clientWidth, el.clientHeight];
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
    const view = 15;
    const aspect = w / h;
    Object.assign(this.camera, { left: -view * aspect, right: view * aspect, top: view, bottom: -view });
    this.camera.updateProjectionMatrix();
  }

  /** Snap to the next quarter turn (Q/E and the buttons). */
  rotate(dir: 1 | -1): void {
    const q = Math.PI / 2;
    const offset = Math.PI / 4;
    const k = Math.round((this.azimuthGoal - offset) / q);
    this.azimuthGoal = offset + (k + dir) * q;
  }

  /** Turn freely, following a mouse drag in pixels. */
  orbit(dx: number): void {
    this.azimuthGoal -= dx * 0.008;
    this.azimuth = this.azimuthGoal;
  }

  get yaw(): number {
    return this.azimuth;
  }

  get zoomLevel(): number {
    return this.camera.zoom;
  }

  zoom(factor: number): void {
    this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * factor, 0.6, 4);
    this.camera.updateProjectionMatrix();
  }

  /** Pan by a screen-space drag, in pixels. */
  pan(dx: number, dy: number): void {
    const el = this.renderer.domElement;
    const unitsPerPx = (this.camera.right - this.camera.left) / this.camera.zoom / el.clientWidth;
    const right = new THREE.Vector3(Math.cos(this.azimuth), 0, -Math.sin(this.azimuth));
    const forward = new THREE.Vector3(-Math.sin(this.azimuth), 0, -Math.cos(this.azimuth));
    this.target.addScaledVector(right, -dx * unitsPerPx);
    this.target.addScaledVector(forward, (dy * unitsPerPx) / Math.sin(CAMERA_TILT));
    const { width, height } = this.game.sim.state;
    this.target.x = THREE.MathUtils.clamp(this.target.x, 0, width);
    this.target.z = THREE.MathUtils.clamp(this.target.z, 0, height);
  }

  focusOn(x: number, z: number): void {
    this.target.set(x, 0, z);
  }

  private placeCamera(dt: number): void {
    this.azimuth += (this.azimuthGoal - this.azimuth) * Math.min(1, dt * 8);
    const dist = 60;
    this.camera.position.set(
      this.target.x + Math.sin(this.azimuth) * Math.cos(CAMERA_TILT) * dist,
      Math.sin(CAMERA_TILT) * dist,
      this.target.z + Math.cos(this.azimuth) * Math.cos(CAMERA_TILT) * dist,
    );
    this.camera.lookAt(this.target);
  }

  // ---------------------------------------------------------------- sync with the sim

  private syncBuildings(): void {
    const state = this.game.sim.state;
    this.syncBuildingList(state);
    this.firstSync = false;
    this.syncPaths();
  }

  /**
   * Draw the worn tracks the simulation keeps: worn by footsteps, fading when unwalked (owner: they
   * "should be worn down by character activity", not jump when something is built). Redrawn every
   * half hour of town time, or at once on a jump such as loading a save.
   */
  private syncPaths(): void {
    const state = this.game.sim.state;
    const key = String(Math.floor(state.tick / 30));
    if (key === this.pathsKey) return;
    this.pathsKey = key;
    const ctx = this.pathCanvas.getContext('2d') as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, this.pathCanvas.width, this.pathCanvas.height);
    // Only real traffic shows, and only the most-walked tiles (bar rounds 1 and 3).
    for (const [k, w] of shownWear(state)) {
      const [x, y] = k.split(',').map(Number) as [number, number];
      // Worn more, paler. Kept to about half strength since paths can be laid (owner's choice):
      // a hint, not a road.
      const a = Math.min(0.3, 0.04 + (w - WEAR_SHOW) * 0.012);
      const g = ctx.createRadialGradient(x * 4 + 2, y * 4 + 2, 0, x * 4 + 2, y * 4 + 2, 3.2);
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x * 4 - 2, y * 4 - 2, 8, 8);
    }
    this.pathTexture.needsUpdate = true;
  }

  private puff(x: number, z: number, size: number): void {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08 + 0.04 * (i % 3), 0), this.dustMat);
      m.position.set(x + Math.cos(a) * size * 0.35, 0.1, z + Math.sin(a) * size * 0.35);
      this.scene.add(m);
      this.dust.push({ mesh: m, v: new THREE.Vector3(Math.cos(a) * 0.9, 0.6 + (i % 2) * 0.3, Math.sin(a) * 0.9), born: performance.now() });
    }
  }

  private animateJuice(dt: number): void {
    const now = performance.now();
    for (const [g, start] of this.popping) {
      const t = Math.min(1, (now - start) / 450);
      // Ease out with a little overshoot: 0 -> 1.08 -> 1.
      const s = t < 0.7 ? (t / 0.7) * 1.08 : 1.08 - ((t - 0.7) / 0.3) * 0.08;
      g.scale.setScalar(Math.max(0.01, s));
      if (t >= 1) {
        g.scale.setScalar(1);
        this.popping.delete(g);
      }
    }
    for (let i = this.dust.length - 1; i >= 0; i--) {
      const d = this.dust[i] as (typeof this.dust)[number];
      const age = (now - d.born) / 700;
      d.mesh.position.addScaledVector(d.v, dt);
      d.v.y -= dt * 0.8;
      d.mesh.scale.setScalar(1 + age);
      if (age >= 1) {
        this.scene.remove(d.mesh);
        d.mesh.geometry.dispose();
        this.dust.splice(i, 1);
      }
    }
    this.dustMat.opacity = this.dust.length ? 0.7 : 0.8;
    // The selection ring follows its resident and breathes.
    const g = this.ringFor ? this.residents.get(this.ringFor) : undefined;
    this.ring.visible = !!g && g.visible;
    if (g && g.visible) {
      this.ring.position.set(g.position.x, 0.04, g.position.z);
      const pulse = 1 + 0.08 * Math.sin(now / 190);
      this.ring.scale.setScalar(pulse);
    }
  }

  /** Mark a resident with a ring on the ground (null to clear). */
  selectResident(id: string | null): void {
    this.ringFor = id;
  }

  private syncBuildingList(state: typeof this.game.sim.state): void {
    for (const b of state.buildings) {
      const existing = this.buildings.get(b.id);
      if (b.removed) {
        if (existing) {
          this.scene.remove(existing);
          this.buildings.delete(b.id);
          this.lampsDirty = true;
        }
        continue;
      }
      if (existing) continue;
      const g = buildingMesh(b.type, b.id * 7 + b.x);
      this.lampsDirty = true;
      // Built during play (not the founding town): it pops up with a puff of dust.
      if (!this.firstSync && b.type !== 'wild' && b.type !== 'path') {
        this.popping.set(g, performance.now());
        g.scale.setScalar(0.01);
        const [bw, bd] = sizeOf(b);
        this.puff(b.x + bw / 2, b.y + bd / 2, Math.max(bw, bd));
      }
      const [w, d] = sizeOf(b);
      g.position.set(b.x + w / 2, 0, b.y + d / 2);
      g.rotation.y = -(b.type === 'jetty' ? (brookSide(state, b.x, b.y) ?? b.rot ?? 0) : (b.rot ?? 0)) * (Math.PI / 2);
      g.userData.buildingId = b.id;
      const windows: THREE.Mesh[] = [];
      g.traverse((o) => o instanceof THREE.Mesh && o.name === 'window' && windows.push(o));
      if (windows.length) {
        g.userData.windows = windows;
        g.userData.porch = g.getObjectByName('porch');
        g.userData.porchLamp = g.getObjectByName('porch-lamp');
      }
      // A new street lamp takes the town's state (lit or out) on the next frame.
      if (g.getObjectByName('street-lamp')) this.streetLit = null;
      g.traverse((o) => {
        if (o instanceof THREE.Mesh && o.name === 'canopy') o.material = this.leafMat;
        if (o instanceof THREE.Mesh && o.name === 'canopy-v') o.material = this.leafMatV;
      });
      this.scene.add(g);
      this.buildings.set(b.id, g);
    }
  }

  private residentTarget(r: ResidentState, index: Map<number, string[]>): THREE.Vector3 | null {
    const state = this.game.sim.state;
    if (r.departed) return null;
    if (r.at === null) return new THREE.Vector3(r.x + 0.5, 0, r.y + 0.5);
    const b = state.buildings.find((x) => x.id === r.at) as BuildingState;
    const def = buildingDef(b.type);
    const [w, d] = sizeOf(b);
    // Indoors at home for the night, or resting: out of sight.
    if (def.kind === 'home' && (r.activity?.id === 'sleep' || r.activity?.id === 'rest')) return null;
    const [tx, ty] = placeTile(b);
    const here = index.get(b.id) ?? [r.id];
    const i = here.indexOf(r.id);
    const n = here.length;
    const radius = Math.max(w, d) / 2 + (b.type === 'oak' ? 0.75 : 0.25);
    const angle = (i / Math.max(n, 1)) * Math.PI * 2 + 0.6;
    const cx = b.x + w / 2;
    const cz = b.y + d / 2;
    // Solid things (houses, the oak, the well, the teahouse...) are stood around, not inside
    // (review: a villager standing in the tree trunk). Open ground is stood on.
    if (!OPEN_GROUND.has(b.type)) return new THREE.Vector3(cx + Math.cos(angle) * radius, 0, cz + Math.sin(angle) * radius);
    const spread = n > 1 ? 0.45 : 0;
    return new THREE.Vector3(tx + 0.5 + Math.cos(angle) * spread * Math.min(w, 2), 0, ty + 0.5 + Math.sin(angle) * spread * Math.min(d, 2));
  }

  private syncResidents(dt: number): void {
    const state = this.game.sim.state;
    const index = new Map<number, string[]>();
    for (const id of state.order) {
      const r = state.residents[id] as ResidentState;
      if (r.at !== null) index.set(r.at, [...(index.get(r.at) ?? []), id]);
    }
    // Around a place, friends sit side by side and rivals end up on opposite sides.
    for (const [place, ids] of index) index.set(place, seatingOrder(state, ids));
    for (const id of state.order) {
      const r = state.residents[id] as ResidentState;
      let g = this.residents.get(id);
      if (!g) {
        g = residentMesh(id);
        g.userData.residentId = id;
        this.scene.add(g);
        this.residents.set(id, g);
        const t = this.residentTarget(r, index);
        if (t) g.position.copy(t);
      }
      const t = this.residentTarget(r, index);
      g.visible = t !== null;
      if (t) {
        const k = Math.min(1, dt * 6 * Math.max(1, this.game.speed));
        if (g.position.distanceTo(t) > 6) g.position.copy(t);
        else g.position.lerp(t, k);
        const moving = g.position.distanceTo(t) > 0.02;
        // A little walk: a bob, legs and arms swinging opposite.
        const phase = performance.now() / 110 + (g.id % 7);
        g.position.y = moving ? Math.abs(Math.sin(phase)) * 0.04 : 0;
        const swing = moving ? Math.sin(phase) * 0.6 : 0;
        const body = g.getObjectByName('body');
        if (body) {
          (body.getObjectByName('legL') as THREE.Object3D).rotation.x = swing;
          (body.getObjectByName('legR') as THREE.Object3D).rotation.x = -swing;
          (body.getObjectByName('armL') as THREE.Object3D).rotation.x = -swing * 0.7;
          (body.getObjectByName('armR') as THREE.Object3D).rotation.x = swing * 0.7;
        }
        if (moving) g.rotation.y = Math.atan2(t.x - g.position.x, t.z - g.position.z);
        else {
          // Face whoever they are talking to.
          const talk = this.talking.get(id);
          const other = talk && performance.now() < talk.until ? this.residents.get(talk.with) : undefined;
          if (other) g.rotation.y = Math.atan2(other.position.x - g.position.x, other.position.z - g.position.z);
        }
      }
    }
  }

  private syncAtmosphere(): void {
    const state = this.game.sim.state;
    const minute = minuteOf(state.tick);
    const night = nightness(minute);
    const season = seasonOf(state.tick);
    if (season !== this.season) {
      this.season = season;
      this.groundMat.color.setHex(SEASON_GROUND[season]);
      this.leafMat.color.setHex(SEASON_LEAF[season]);
      this.leafMatV.color.setHex(SEASON_LEAF[season]);
    }
    const weather = state.story.weather.kind !== 'clear' && state.tick < state.story.weather.until ? state.story.weather.kind : 'clear';
    const gloom = weather === 'storm' ? 0.55 : weather === 'rain' ? 0.3 : 0;
    // Sun crosses the sky from 6:00 to 20:00.
    const dayFrac = THREE.MathUtils.clamp((minute - 360) / 840, 0, 1);
    const elevation = Math.sin(dayFrac * Math.PI);
    const sunAz = this.azimuth + Math.PI * (0.25 + dayFrac * 0.5);
    this.sun.position.set(this.target.x + Math.cos(sunAz) * 30, 6 + elevation * 30, this.target.z + Math.sin(sunAz) * 30);
    this.sun.target.position.copy(this.target);
    // Day: a warm key light. Night: the same light turns to cool moonlight, low but readable.
    const warm = 1 - elevation;
    const dayKey = new THREE.Color(0xfff1d6).lerp(new THREE.Color(0xffc98f), warm * 0.6);
    this.sun.color.copy(dayKey.lerp(new THREE.Color(0x8fa3d6), night));
    this.sun.intensity = ((0.55 + 1.25 * elevation) * (1 - night) + 0.75 * night) * (1 - gloom * 0.6);
    this.hemi.color.copy(new THREE.Color(0xcfe6ff).lerp(new THREE.Color(0x5a6a9c), night));
    this.hemi.groundColor.copy(new THREE.Color(0x6d7a3a).lerp(new THREE.Color(0x2a3040), night));
    this.hemi.intensity = (0.85 - night * 0.2) * (1 - gloom * 0.4);
    const zenith = new THREE.Color(0x9cc3e0).lerp(new THREE.Color(0x1b2238), night).lerp(new THREE.Color(0x6f7880), gloom);
    const horizon = new THREE.Color(0xf6e7c8).lerp(new THREE.Color(0x3b4a72), night).lerp(new THREE.Color(0x9aa2a8), gloom);
    this.paintSky(zenith, horizon);
    this.renderer.domElement.parentElement?.classList.toggle('night', night > 0.6 && gloom === 0);
    // The moon sits up behind the viewer: rim light on roofs and walls facing the camera.
    this.moon.position.set(this.target.x + Math.cos(this.azimuth) * 20, 25, this.target.z + Math.sin(this.azimuth) * 20);
    this.moon.target.position.copy(this.target);
    this.moon.intensity = night * 0.55;

    glow.window.emissiveIntensity = night * 2.2;
    this.lightWindows(state);
    // Lamps are lit from dusk to dawn only (review: lanterns glowing at noon).
    glow.lantern.emissiveIntensity = night * 2.6;
    glow.pool.opacity = night * 0.55;
    glow.pool.visible = night > 0.02;
    this.placeLamps(night);
    glow.oven.emissiveIntensity = 0;
    for (const r of Object.values(state.residents)) {
      if (r.activity?.id === 'work' && r.at === r.activity.placeId) {
        const b = state.buildings.find((x) => x.id === r.at);
        if (b?.type === 'bakery') glow.oven.emissiveIntensity = 1.5;
      }
    }

    this.rain.visible = weather !== 'clear';
    if (this.rain.visible) {
      const pos = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      const fall = weather === 'storm' ? 0.45 : 0.25;
      for (let i = 0; i < arr.length; i += 6) {
        arr[i + 1] = (arr[i + 1] as number) - fall;
        arr[i + 4] = (arr[i + 4] as number) - fall;
        if ((arr[i + 4] as number) < 0) {
          arr[i + 1] = 12;
          arr[i + 4] = 11.65;
        }
      }
      pos.needsUpdate = true;
    }

    // Lanterns strung over a running festival or gathering.
    this.festoon.clear();
    for (const g of state.story.gatherings) {
      if (state.tick < g.from || state.tick >= g.until) continue;
      const b = state.buildings.find((x) => x.id === g.placeId);
      if (!b) continue;
      const [w, d] = sizeOf(b);
      const n = g.kind === 'festival' ? 14 : 6;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const lamp = new THREE.Mesh(FESTOON_LAMP, glow.lantern);
        lamp.position.set(b.x + w / 2 + Math.cos(a) * (w / 2 + 0.4), 0.9 + 0.08 * Math.sin(a * 3), b.y + d / 2 + Math.sin(a) * (d / 2 + 0.4));
        this.festoon.add(lamp);
      }
    }
  }

  // ---------------------------------------------------------------- build tool visuals

  setGhost(type: string | null, tile: [number, number] | null, valid: boolean, rot = 0): void {
    if (type !== this.ghostType) {
      if (this.ghost) this.scene.remove(this.ghost);
      this.ghost = null;
      this.ghostType = type;
      if (type) {
        this.ghost = buildingMesh(type);
        this.ghost.traverse((o) => {
          // The lamp's light pool is not part of the building: tinted green it read as a second, offset footprint.
          if (o instanceof THREE.Mesh && o.material === glow.pool) o.visible = false;
          if (o instanceof THREE.Mesh) {
            o.material = new THREE.MeshBasicMaterial({ color: 0x6fcf6f, transparent: true, opacity: 0.55 });
            o.castShadow = false;
          }
        });
        this.scene.add(this.ghost);
      }
    }
    if (!this.ghost || !type) return;
    this.ghost.visible = tile !== null;
    if (!tile) return;
    const [w, d] = footprint(type, rot);
    this.ghost.position.set(tile[0] + w / 2, 0.01, tile[1] + d / 2);
    this.ghost.rotation.y = -(type === 'jetty' ? (brookSide(this.game.sim.state, tile[0], tile[1]) ?? rot) : rot) * (Math.PI / 2);
    this.ghost.traverse((o) => {
      if (o instanceof THREE.Mesh) (o.material as THREE.MeshBasicMaterial).color.setHex(valid ? 0x6fcf6f : 0xe05050);
    });
  }

  highlightBuilding(id: number | null): void {
    if (this.highlighted === id) return;
    const prev = this.highlighted !== null ? this.buildings.get(this.highlighted) : undefined;
    prev?.scale.set(1, 1, 1);
    this.highlighted = id;
    const next = id !== null ? this.buildings.get(id) : undefined;
    next?.scale.set(1.08, 1.15, 1.08);
  }

  // ---------------------------------------------------------------- picking and projection

  private ndc(clientX: number, clientY: number): THREE.Vector2 {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  }

  /** What is under the pointer. With people: false, residents don't get in the way (removing). */
  pick(clientX: number, clientY: number, opts: { people?: boolean; paths?: boolean } = {}): Pick | null {
    this.raycaster.setFromCamera(this.ndc(clientX, clientY), this.camera);
    const people = opts.people === false ? [] : [...this.residents.values()].filter((g) => g.visible);
    const hitPerson = this.raycaster.intersectObjects(people, true)[0];
    if (hitPerson) {
      let o: THREE.Object3D | null = hitPerson.object;
      while (o && o.userData.residentId === undefined) o = o.parent;
      if (o) return { kind: 'resident', id: o.userData.residentId as string };
    }
    // Path tiles are only picked when asked for (to take them up); clicking a path otherwise looks past it.
    const state = this.game.sim.state;
    const targets = [...this.buildings.values()].filter((g) => opts.paths || state.buildings.find((b) => b.id === g.userData.buildingId)?.type !== 'path');
    const hitBuilding = this.raycaster.intersectObjects(targets, true)[0];
    if (hitBuilding) {
      let o: THREE.Object3D | null = hitBuilding.object;
      while (o && o.userData.buildingId === undefined) o = o.parent;
      if (o) return { kind: 'building', id: o.userData.buildingId as number };
    }
    const tile = this.tileAt(clientX, clientY);
    return tile ? { kind: 'ground', x: tile[0], y: tile[1] } : null;
  }

  tileAt(clientX: number, clientY: number): [number, number] | null {
    this.raycaster.setFromCamera(this.ndc(clientX, clientY), this.camera);
    const hit = this.raycaster.intersectObject(this.ground)[0];
    if (!hit) return null;
    return [Math.floor(hit.point.x), Math.floor(hit.point.z)];
  }

  /** Screen position (CSS pixels, relative to the canvas) of a world point. */
  toScreen(p: THREE.Vector3): { x: number; y: number; visible: boolean } {
    const v = p.clone().project(this.camera);
    const el = this.renderer.domElement;
    return { x: ((v.x + 1) / 2) * el.clientWidth, y: ((1 - v.y) / 2) * el.clientHeight, visible: v.z > -1 && v.z < 1 };
  }

  residentScreen(id: string): { x: number; y: number; visible: boolean } | null {
    const g = this.residents.get(id);
    if (!g || !g.visible) return null;
    return this.toScreen(g.position.clone().add(new THREE.Vector3(0, 0.35, 0)));
  }

  residentHead(id: string): { x: number; y: number; visible: boolean } | null {
    const g = this.residents.get(id);
    if (!g || !g.visible) return null;
    return this.toScreen(g.position.clone().add(new THREE.Vector3(0, 1.0, 0)));
  }

  tileScreen(x: number, y: number): { x: number; y: number; visible: boolean } {
    return this.toScreen(new THREE.Vector3(x + 0.5, 0, y + 0.5));
  }

  buildingScreen(id: number): { x: number; y: number; visible: boolean } | null {
    const g = this.buildings.get(id);
    return g ? this.toScreen(g.position.clone().add(new THREE.Vector3(0, 0.3, 0))) : null;
  }

  /** Frame times, for dropping bloom on hardware that can't keep up (weak phones, software GL). */
  private slowFrames = 0;
  private frames = 0;

  frame(dt: number): void {
    // The stage can change size without a resize event (iOS Safari restoring a tab or folding its
    // toolbar left the town drawn in a box at the top of the screen, 2026-10-09): check every frame.
    const el = this.renderer.domElement.parentElement as HTMLElement | null;
    if (el && (el.clientWidth !== this.sized[0] || el.clientHeight !== this.sized[1])) this.resize();
    this.syncBuildings();
    this.syncResidents(dt);
    this.placeCamera(dt);
    this.syncAtmosphere();
    this.animateJuice(Math.min(dt, 0.1));
    if (this.bloom.enabled) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    // Low quality on slow hardware: no bloom, no real lamp lights (the ground pools still glow).
    // Judged by the time between frames, since the GPU's work doesn't show in the draw call.
    if (!this.lowQuality && this.frames < 90) {
      this.frames++;
      if (this.frames > 3 && dt > 0.05) this.slowFrames++;
      if (this.slowFrames >= 8) this.setLowQuality();
    }
  }

  private lowQuality = false;

  setLowQuality(): void {
    this.lowQuality = true;
    this.bloom.enabled = false;
    for (const l of this.lamps) this.scene.remove(l);
    this.lamps.length = 0;
    this.renderer.setPixelRatio(1);
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.resize();
  }
}

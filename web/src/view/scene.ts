// The town in 3D: an isometric diorama with quarter-turn rotation, pan and zoom (DECISIONS,
// M2 camera), time-of-day and seasonal lighting, and picking. It only reads sim state.

import * as THREE from 'three';
import { buildingDef } from '../../../src/content/buildings.js';
import { minuteOf, seasonOf, type Season } from '../../../src/sim/time.js';
import type { BuildingState, ResidentState } from '../../../src/sim/types.js';
import { footprint, placeTile, sizeOf } from '../../../src/sim/world.js';
import type { Game } from '../game.js';
import { buildingMesh, glow, mat, residentMesh } from './meshes.js';

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
  private readonly ground: THREE.Mesh;
  private readonly groundMat = new THREE.MeshLambertMaterial({ color: SEASON_GROUND.spring });
  private readonly leafMat = mat(SEASON_LEAF.spring);
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

  constructor(container: HTMLElement, game: Game) {
    this.game = game;
    const { width, height } = game.sim.state;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
    this.target.set(width / 2, 0, height / 2);
    this.camera.zoom = 1.35;

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const s = Math.max(width, height) * 0.75;
    Object.assign(this.sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 120 });
    this.sun.target.position.copy(this.target);
    this.scene.add(this.sun, this.sun.target, this.hemi);

    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(width, height), this.groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.set(width / 2, 0, height / 2);
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    const grid = new THREE.GridHelper(width, width, 0x000000, 0x000000);
    (grid.material as THREE.Material).opacity = 0.06;
    (grid.material as THREE.Material).transparent = true;
    grid.position.set(width / 2, 0.005, height / 2);
    this.scene.add(grid);

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

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const el = this.renderer.domElement.parentElement as HTMLElement;
    const w = el.clientWidth || window.innerWidth;
    const h = el.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
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
    for (const b of state.buildings) {
      const existing = this.buildings.get(b.id);
      if (b.removed) {
        if (existing) {
          this.scene.remove(existing);
          this.buildings.delete(b.id);
        }
        continue;
      }
      if (existing) continue;
      const g = buildingMesh(b.type);
      const [w, d] = sizeOf(b);
      g.position.set(b.x + w / 2, 0, b.y + d / 2);
      g.rotation.y = -(b.rot ?? 0) * (Math.PI / 2);
      g.userData.buildingId = b.id;
      g.traverse((o) => {
        if (o instanceof THREE.Mesh && o.name === 'canopy') o.material = this.leafMat;
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
    const radius = Math.max(w, d) / 2 + 0.25;
    const angle = (i / Math.max(n, 1)) * Math.PI * 2 + 0.6;
    const cx = b.x + w / 2;
    const cz = b.y + d / 2;
    if (def.kind === 'home' || def.kind === 'work') return new THREE.Vector3(cx + Math.cos(angle) * radius, 0, cz + Math.sin(angle) * radius);
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
        g.position.y = moving ? Math.abs(Math.sin(performance.now() / 90)) * 0.05 : 0;
        if (moving) g.rotation.y = Math.atan2(t.x - g.position.x, t.z - g.position.z);
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
    }
    const weather = state.story.weather.kind !== 'clear' && state.tick < state.story.weather.until ? state.story.weather.kind : 'clear';
    const gloom = weather === 'storm' ? 0.55 : weather === 'rain' ? 0.3 : 0;
    // Sun crosses the sky from 6:00 to 20:00.
    const dayFrac = THREE.MathUtils.clamp((minute - 360) / 840, 0, 1);
    const elevation = Math.sin(dayFrac * Math.PI);
    const sunAz = this.azimuth + Math.PI * (0.25 + dayFrac * 0.5);
    this.sun.position.set(this.target.x + Math.cos(sunAz) * 30, 6 + elevation * 30, this.target.z + Math.sin(sunAz) * 30);
    this.sun.target.position.copy(this.target);
    this.sun.intensity = (0.25 + 1.4 * elevation) * (1 - night * 0.85) * (1 - gloom * 0.6);
    const warm = 1 - elevation;
    this.sun.color.setRGB(1, 0.92 - warm * 0.2, 0.85 - warm * 0.35);
    this.hemi.intensity = (0.75 - night * 0.45) * (1 - gloom * 0.4);
    this.hemi.color.setRGB(0.85 - night * 0.45, 0.92 - night * 0.4, 1 - night * 0.2);
    const sky = new THREE.Color().setRGB(0.62 - night * 0.52, 0.78 - night * 0.62, 0.9 - night * 0.6);
    sky.lerp(new THREE.Color(0x6f7880), gloom);
    this.renderer.setClearColor(sky);

    glow.window.emissiveIntensity = night * 1.2;
    glow.lantern.emissiveIntensity = 0.2 + night * 1.6;
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
    this.ghost.rotation.y = -rot * (Math.PI / 2);
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

  pick(clientX: number, clientY: number): Pick | null {
    this.raycaster.setFromCamera(this.ndc(clientX, clientY), this.camera);
    const people = [...this.residents.values()].filter((g) => g.visible);
    const hitPerson = this.raycaster.intersectObjects(people, true)[0];
    if (hitPerson) {
      let o: THREE.Object3D | null = hitPerson.object;
      while (o && o.userData.residentId === undefined) o = o.parent;
      if (o) return { kind: 'resident', id: o.userData.residentId as string };
    }
    const hitBuilding = this.raycaster.intersectObjects([...this.buildings.values()], true)[0];
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
    return this.toScreen(g.position.clone().add(new THREE.Vector3(0, 0.75, 0)));
  }

  tileScreen(x: number, y: number): { x: number; y: number; visible: boolean } {
    return this.toScreen(new THREE.Vector3(x + 0.5, 0, y + 0.5));
  }

  buildingScreen(id: number): { x: number; y: number; visible: boolean } | null {
    const g = this.buildings.get(id);
    return g ? this.toScreen(g.position.clone().add(new THREE.Vector3(0, 0.3, 0))) : null;
  }

  frame(dt: number): void {
    this.syncBuildings();
    this.syncResidents(dt);
    this.placeCamera(dt);
    this.syncAtmosphere();
    this.renderer.render(this.scene, this.camera);
  }
}

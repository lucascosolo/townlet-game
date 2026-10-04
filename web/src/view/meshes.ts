// Greybox low-poly meshes (spec 6, option C: low-poly lantern-light). Flat-shaded primitives;
// lighting and colour do the atmosphere. Windows and lanterns carry emissive materials that
// the scene brightens at night.

import * as THREE from 'three';
import { buildingDef } from '../../../src/content/buildings.js';
import { looksOf } from './looks.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const PALETTE = {
  wall: 0xeadfc8,
  roof: 0xb5653e,
  roofTeal: 0x4f8a86,
  roofSlate: 0x6b7280,
  wood: 0x8a5a3b,
  darkWood: 0x5b3a26,
  stone: 0x9a968c,
  canvas: 0xd9c9a3,
  soil: 0x7a5636,
  leaf: 0x5f9e4f,
  hedge: 0x4e8a46,
  water: 0x5aa7c7,
  window: 0xffcf7a,
  lantern: 0xffb85c,
  trim: 0x5a3a24,
  green: 0x8cc06b,
};

const materials = new Map<string, THREE.MeshLambertMaterial>();

/** Shared flat-shaded materials, by colour. */
export function mat(color: number, emissive = 0): THREE.MeshLambertMaterial {
  const key = `${color}:${emissive}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    if (emissive) m.emissive = new THREE.Color(emissive);
    materials.set(key, m);
  }
  return m;
}

/** Window and lantern glow: one material per kind, so night can brighten them all at once. */
export const glow = {
  window: new THREE.MeshLambertMaterial({ color: PALETTE.window, emissive: new THREE.Color(PALETTE.window), emissiveIntensity: 0 }),
  lantern: new THREE.MeshLambertMaterial({ color: PALETTE.lantern, emissive: new THREE.Color(PALETTE.lantern), emissiveIntensity: 0 }),
  oven: new THREE.MeshLambertMaterial({ color: 0xff8a3d, emissive: new THREE.Color(0xff6a1d), emissiveIntensity: 0 }),
  /** The warm pool a lamp throws on the ground: additive, faded in at dusk. */
  pool: new THREE.MeshBasicMaterial({ map: radialTexture(), color: 0xffb75e, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
};

function radialTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A lamp's light: a pool on the ground, and a marker the scene uses to place real lights. */
function lightSpot(x: number, y: number, z: number, size = 3): THREE.Group {
  const g = new THREE.Group();
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(size, size), glow.pool);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(x, 0.03, z);
  pool.renderOrder = 1;
  g.add(pool);
  const marker = new THREE.Object3D();
  marker.name = 'light';
  marker.position.set(x, y, z);
  g.add(marker);
  return g;
}

/** Roof colours for homes, so a street isn't one colour (review: flat materials). */
const ROOFS = [0xb5532f, 0x7a4b8a, 0x3f7a72, 0xa8743a, 0x8f3f3a];

function box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = h / 2, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function pyramidRoof(w: number, d: number, h: number, material: THREE.Material, y: number): THREE.Mesh {
  const r = Math.max(w, d) * 0.75;
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 4), material);
  m.rotation.y = Math.PI / 4;
  m.scale.set(w / (r * Math.SQRT2), 1, d / (r * Math.SQRT2));
  m.position.y = y + h / 2;
  m.castShadow = true;
  return m;
}

function tree(x: number, z: number, scale = 1, leaf: THREE.Material = mat(PALETTE.leaf)): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.12 * scale, 0.5 * scale, 0.12 * scale, mat(PALETTE.darkWood)));
  const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38 * scale, 0), leaf);
  canopy.position.y = 0.75 * scale;
  canopy.castShadow = true;
  canopy.name = 'canopy';
  g.add(canopy);
  g.position.set(x, 0, z);
  return g;
}

function lanternPost(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.05, 0.6, 0.05, mat(PALETTE.darkWood)));
  const lamp = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), glow.lantern);
  lamp.position.y = 0.65;
  g.add(lamp);
  g.add(lightSpot(0, 0.7, 0, 2.6));
  g.position.set(x, 0, z);
  return g;
}

function house(w: number, d: number, roofColor: number, opts: { chimney?: boolean; oven?: boolean } = {}): THREE.Group {
  const g = new THREE.Group();
  const bw = w * 0.82;
  const bd = d * 0.82;
  const wallH = 0.7;
  g.add(box(bw, wallH, bd, mat(PALETTE.wall)));
  // Timber frame: corner posts and a sill beam under the eaves.
  for (const [x, z] of [
    [-bw / 2, -bd / 2],
    [bw / 2, -bd / 2],
    [-bw / 2, bd / 2],
    [bw / 2, bd / 2],
  ] as const)
    g.add(box(0.07, wallH, 0.07, mat(PALETTE.trim), x, wallH / 2, z));
  g.add(box(bw + 0.06, 0.06, bd + 0.06, mat(PALETTE.trim), 0, wallH - 0.03));
  // A door, and a lamp beside it that lights the step at night.
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.36), mat(PALETTE.trim));
  door.position.set(-bw * 0.22, 0.18, bd / 2 + 0.012);
  g.add(door);
  const doorLamp = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0), glow.lantern);
  doorLamp.position.set(-bw * 0.22 + 0.17, 0.42, bd / 2 + 0.04);
  g.add(doorLamp);
  g.add(lightSpot(-bw * 0.22, 0.5, bd / 2 + 0.5, 2.4));
  g.add(pyramidRoof(bw + 0.15, bd + 0.15, 0.6, mat(roofColor), wallH));
  // Windows on two faces, glowing at night.
  for (const [x, z, ry] of [
    [0, bd / 2 + 0.01, 0],
    [bw / 2 + 0.01, 0, Math.PI / 2],
    [0, -bd / 2 - 0.01, 0],
  ] as const) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.27), glow.window);
    win.position.set(x, 0.42, z);
    win.rotation.y = ry;
    g.add(win);
  }
  if (opts.chimney) {
    const c = box(0.16, 0.5, 0.16, mat(PALETTE.stone), bw * 0.25, 0.95, -bd * 0.2);
    g.add(c);
    if (opts.oven) {
      const ember = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.1), glow.oven);
      ember.position.set(bw * 0.25, 1.22, -bd * 0.2);
      ember.name = 'oven';
      g.add(ember);
    }
  }
  return g;
}

/** A woodpile, a water butt, a bit of fence and a pot of flowers: a home that's lived in (review: no props). */
function homeProps(w: number, d: number, variant: number): THREE.Group {
  const g = new THREE.Group();
  const side = variant % 2 ? 1 : -1;
  // Woodpile against a side wall.
  for (let i = 0; i < 3; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.36, 6), mat(PALETTE.wood));
    log.rotation.z = Math.PI / 2;
    log.position.set(side * (w * 0.41 + 0.08), 0.06 + Math.floor(i / 2) * 0.09, -0.15 + (i % 2) * 0.11 + (i >= 2 ? 0.05 : 0));
    log.castShadow = true;
    g.add(log);
  }
  // A water butt by the door.
  const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.18, 8), mat(PALETTE.darkWood));
  butt.position.set(w * 0.2, 0.09, d * 0.41 + 0.12);
  butt.castShadow = true;
  g.add(butt);
  // A short picket run along the front.
  for (let i = 0; i < 4; i++) g.add(box(0.03, 0.16, 0.03, mat(0xd8cbb0), -w * 0.45 + i * 0.12, 0.08, d * 0.5 + 0.08));
  g.add(box(0.4, 0.025, 0.02, mat(0xd8cbb0), -w * 0.45 + 0.18, 0.12, d * 0.5 + 0.08));
  // Flowers in a pot.
  const pot = box(0.1, 0.08, 0.1, mat(0xb5653e), w * 0.38, 0.04, d * 0.41 + 0.1);
  g.add(pot);
  const bloom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), mat([0xe76f8a, 0xf2c14e, 0xb48be0][variant % 3] as number));
  bloom.position.set(w * 0.38, 0.12, d * 0.41 + 0.1);
  g.add(bloom);
  return g;
}

/** A mesh group for a building type, centred on its footprint, sitting on y = 0. */
/** Leaves that follow the seasons, tinted per vertex so no two trees match. The scene swaps in its seasonal copy. */
export const seasonalLeaf = new THREE.MeshLambertMaterial({ color: PALETTE.leaf, flatShading: true, vertexColors: true });
/** Conifers keep their needles all year. */
const needles = new THREE.MeshLambertMaterial({ color: 0x3d6b47, flatShading: true, vertexColors: true });

const WOOD_SHAPES = {
  trunk: new THREE.BoxGeometry(1, 1, 1),
  blob: new THREE.IcosahedronGeometry(1, 0),
  cone: new THREE.ConeGeometry(1, 1, 6),
  tuft: new THREE.CylinderGeometry(1, 1, 1, 7),
};

/**
 * Woods and brambles over a wild plot (review: every plot was the same scatter, one species, and a
 * ruler-straight edge). Seeded per plot: broadleaf, conifer and birch with jittered size, lean,
 * turn and shade; saplings and bushes thicken towards the edge, and ragged tufts of forest floor
 * break the line between wild and settled land. Merged per material so a plot costs a few draw calls.
 */
function woods(w: number, d: number, variant: number): THREE.Group {
  const g = new THREE.Group();
  let seed = (Math.abs(variant) * 2654435761) % 2147483647 || 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const parts: Record<'floor' | 'trunk' | 'birch' | 'leaf' | 'needle', THREE.BufferGeometry[]> = { floor: [], trunk: [], birch: [], leaf: [], needle: [] };
  const q = new THREE.Quaternion();
  const put = (
    key: keyof typeof parts,
    shape: THREE.BufferGeometry,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    yaw = 0,
    tint?: number,
  ) => {
    const geo = (shape.index ? shape.toNonIndexed() : shape.clone()).deleteAttribute('uv');
    q.setFromEuler(new THREE.Euler(0, yaw, 0));
    geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz)));
    if (tint !== undefined) {
      const n = geo.getAttribute('position').count;
      const c = new Float32Array(n * 3);
      // Shade jitter: mostly lightness, a touch of hue (yellower or bluer).
      for (let i = 0; i < n; i++) {
        c[i * 3] = tint * (1 + (rnd() - 0.5) * 0.04);
        c[i * 3 + 1] = tint;
        c[i * 3 + 2] = tint * (1 + (rnd() - 0.5) * 0.06);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    }
    parts[key].push(geo);
  };
  const shade = () => 0.8 + rnd() * 0.35;
  const broadleaf = (x: number, z: number, s: number) => {
    put('trunk', WOOD_SHAPES.trunk, x, 0.25 * s, z, 0.12 * s, 0.5 * s, 0.12 * s, rnd() * 3);
    const t = shade();
    put('leaf', WOOD_SHAPES.blob, x, 0.75 * s, z, 0.38 * s, 0.36 * s * (0.9 + rnd() * 0.3), 0.38 * s, rnd() * 6, t);
    if (rnd() < 0.5) put('leaf', WOOD_SHAPES.blob, x + (rnd() - 0.5) * 0.3 * s, 0.98 * s, z + (rnd() - 0.5) * 0.3 * s, 0.24 * s, 0.24 * s, 0.24 * s, rnd() * 6, t * 1.06);
  };
  const conifer = (x: number, z: number, s: number) => {
    put('trunk', WOOD_SHAPES.trunk, x, 0.15 * s, z, 0.1 * s, 0.3 * s, 0.1 * s);
    const t = shade();
    const yaw = rnd() * 3;
    put('needle', WOOD_SHAPES.cone, x, 0.55 * s, z, 0.46 * s, 0.6 * s, 0.46 * s, yaw, t);
    put('needle', WOOD_SHAPES.cone, x, 0.88 * s, z, 0.36 * s, 0.55 * s, 0.36 * s, yaw + 0.5, t * 1.04);
    put('needle', WOOD_SHAPES.cone, x, 1.18 * s, z, 0.24 * s, 0.45 * s, 0.24 * s, yaw + 1, t * 1.08);
  };
  const birch = (x: number, z: number, s: number) => {
    put('birch', WOOD_SHAPES.trunk, x, 0.42 * s, z, 0.07 * s, 0.84 * s, 0.07 * s, rnd() * 3);
    put('leaf', WOOD_SHAPES.blob, x, 1.0 * s, z, 0.27 * s, 0.38 * s, 0.27 * s, rnd() * 6, 1.12 + rnd() * 0.15);
  };
  const bush = (x: number, z: number, s: number) => put('leaf', WOOD_SHAPES.blob, x, 0.18 * s, z, 0.34 * s, 0.24 * s, 0.34 * s, rnd() * 6, 0.75 + rnd() * 0.15);
  // The forest floor, with ragged tufts along all four sides.
  put('floor', WOOD_SHAPES.trunk, 0, 0.015, 0, w, 0.03, d);
  for (let i = 0; i < 20; i++) {
    const along = rnd() - 0.5;
    const out = (rnd() - 0.35) * 0.9;
    const side = i % 4;
    const x = side === 0 ? along * w : side === 1 ? along * w : side === 2 ? -w / 2 - out : w / 2 + out;
    const z = side === 0 ? -d / 2 - out : side === 1 ? d / 2 + out : along * d;
    const r = 0.3 + rnd() * 0.45;
    put('floor', WOOD_SHAPES.tuft, x, 0.012 + rnd() * 0.004, z, r, 0.024, r * (0.7 + rnd() * 0.5), rnd() * 3);
  }
  // Big trees in the middle, thinning to saplings and bushes at the edge.
  for (let i = 0; i < 26; i++) {
    const x = -w / 2 + 0.5 + rnd() * (w - 1);
    const z = -d / 2 + 0.5 + rnd() * (d - 1);
    const edge = Math.min(w / 2 - Math.abs(x), d / 2 - Math.abs(z));
    const grown = Math.min(1, edge / 1.6);
    const s = (0.45 + grown * 0.7) * (0.85 + rnd() * 0.5);
    const kind = rnd();
    if (edge < 0.9 && rnd() < 0.55) bush(x, z, 0.7 + rnd() * 0.6);
    else if (kind < 0.45) broadleaf(x, z, s);
    else if (kind < 0.75) conifer(x, z, s);
    else birch(x, z, s);
  }
  const materials: Record<keyof typeof parts, THREE.Material> = {
    floor: mat(0x55703f),
    trunk: mat(PALETTE.darkWood),
    birch: mat(0xe4dfd2),
    leaf: seasonalLeaf,
    needle: needles,
  };
  for (const key of Object.keys(parts) as Array<keyof typeof parts>) {
    if (!parts[key].length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(parts[key]), materials[key]);
    mesh.name = key === 'leaf' ? 'canopy-v' : key;
    // The woods don't cast shadows: hundreds of trees in the shadow pass cost more than they show.
    mesh.castShadow = false;
    mesh.receiveShadow = key === 'floor';
    g.add(mesh);
    for (const geo of parts[key]) geo.dispose();
  }
  return g;
}

export function buildingMesh(type: string, variant = 0): THREE.Group {
  const [w, d] = buildingDef(type).size;
  let g: THREE.Group;
  switch (type) {
    case 'cottage':
      g = house(w, d, ROOFS[variant % ROOFS.length] as number, { chimney: true });
      g.add(homeProps(w, d, variant));
      break;
    case 'bakery':
      g = house(w, d, 0xc98b4b, { chimney: true, oven: true });
      break;
    case 'teahouse': {
      g = house(w, d, PALETTE.roofTeal, { chimney: true });
      for (const [x, z] of [
        [-0.7, 0.9],
        [0.7, 0.9],
      ] as const)
        g.add(lanternPost(x, z));
      break;
    }
    case 'workshop': {
      g = new THREE.Group();
      g.add(box(w * 0.85, 0.6, d * 0.8, mat(0xcfc4ae)));
      g.add(box(w * 0.9, 0.08, d * 0.9, mat(PALETTE.roofSlate), 0, 0.64));
      break;
    }
    case 'tent': {
      // A proper camp, so it reads as someone's home: a tall canvas tent, a pole, a lantern.
      g = new THREE.Group();
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.95, 4), mat(PALETTE.canvas));
      t.rotation.y = Math.PI / 4;
      t.position.y = 0.475;
      t.castShadow = true;
      g.add(t);
      const flap = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.34), mat(PALETTE.darkWood));
      flap.position.set(0, 0.17, 0.33);
      g.add(flap);
      g.add(box(0.03, 1.15, 0.03, mat(PALETTE.darkWood), 0, 0.575, 0));
      g.add(lanternPost(0.38, 0.32));
      break;
    }
    case 'well': {
      g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.35, 7), mat(PALETTE.stone));
      ring.position.y = 0.175;
      ring.castShadow = true;
      g.add(ring);
      g.add(box(0.05, 0.5, 0.05, mat(PALETTE.darkWood), -0.25, 0.45));
      g.add(box(0.05, 0.5, 0.05, mat(PALETTE.darkWood), 0.25, 0.45));
      g.add(pyramidRoof(0.7, 0.5, 0.25, mat(PALETTE.roof), 0.7));
      break;
    }
    case 'commons': {
      g = new THREE.Group();
      g.add(box(w * 0.96, 0.04, d * 0.96, mat(PALETTE.green), 0, 0.02));
      for (const [x, z] of [
        [-1.2, -1.2],
        [1.2, -1.2],
        [-1.2, 1.2],
        [1.2, 1.2],
      ] as const)
        g.add(lanternPost(x, z));
      break;
    }
    case 'oak':
      g = new THREE.Group();
      g.add(tree(0, 0, 1.6));
      break;
    case 'brook': {
      g = new THREE.Group();
      const water = box(w * 0.8, 0.03, d, mat(PALETTE.water), 0, 0.015);
      water.receiveShadow = true;
      g.add(water);
      break;
    }
    case 'garden': {
      g = new THREE.Group();
      g.add(box(w * 0.9, 0.06, d * 0.9, mat(PALETTE.soil), 0, 0.03));
      for (let i = 0; i < 3; i++) g.add(box(w * 0.75, 0.12, 0.12, mat(PALETTE.leaf), 0, 0.12, -0.5 + i * 0.5));
      break;
    }
    case 'woodlot': {
      g = new THREE.Group();
      for (const [x, z, s] of [
        [-0.5, -0.4, 1],
        [0.45, -0.5, 1.2],
        [-0.3, 0.5, 1.1],
        [0.5, 0.45, 0.9],
      ] as const)
        g.add(tree(x, z, s));
      break;
    }
    case 'jetty':
      g = new THREE.Group();
      g.add(box(0.9, 0.08, 0.5, mat(PALETTE.wood), 0, 0.12));
      break;
    case 'bench':
      g = new THREE.Group();
      g.add(box(0.7, 0.06, 0.25, mat(PALETTE.wood), 0, 0.22));
      g.add(box(0.06, 0.2, 0.2, mat(PALETTE.darkWood), -0.28, 0.1));
      g.add(box(0.06, 0.2, 0.2, mat(PALETTE.darkWood), 0.28, 0.1));
      break;
    case 'hedge':
      g = new THREE.Group();
      g.add(box(0.92, 0.5, 0.92, mat(PALETTE.hedge)));
      break;
    case 'flowerbed': {
      g = new THREE.Group();
      g.add(box(0.85, 0.08, 0.85, mat(PALETTE.soil), 0, 0.04));
      const colors = [0xe76f8a, 0xf2c14e, 0xb48be0, 0xffffff];
      for (let i = 0; i < 8; i++) {
        const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), mat(colors[i % colors.length] as number));
        f.position.set(-0.3 + (i % 4) * 0.2, 0.14, -0.2 + Math.floor(i / 4) * 0.4);
        g.add(f);
      }
      break;
    }
    case 'wild':
      g = woods(w, d, variant);
      break;
    case 'orchard': {
      g = new THREE.Group();
      g.add(box(w * 0.9, 0.04, d * 0.9, mat(PALETTE.hedge), 0, 0.02));
      const fruit = mat(0xd9534f);
      for (const [x, z] of [
        [-0.5, -0.5],
        [0.5, -0.5],
        [-0.5, 0.5],
        [0.5, 0.5],
      ] as const) {
        const t = tree(x, z, 0.9, mat(0x7fb069));
        for (let i = 0; i < 3; i++) {
          const apple = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), fruit);
          apple.position.set(Math.cos(i * 2.1) * 0.28, 0.62, Math.sin(i * 2.1) * 0.28);
          t.add(apple);
        }
        g.add(t);
      }
      break;
    }
    case 'granary': {
      // A timber store raised on staddle stones (to keep mice out), with sacks by the door.
      g = new THREE.Group();
      const stone = mat(PALETTE.stone);
      for (const x of [-1, 0, 1]) for (const z of [-1, 1]) {
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.28, 6), stone);
        cap.position.set(x * w * 0.32, 0.14, z * d * 0.3);
        cap.castShadow = true;
        g.add(cap);
        g.add(box(0.24, 0.04, 0.24, stone, x * w * 0.32, 0.3, z * d * 0.3));
      }
      g.add(box(w * 0.78, 0.06, d * 0.72, mat(PALETTE.darkWood), 0, 0.35));
      const body = box(w * 0.74, 0.62, d * 0.66, mat(PALETTE.wood), 0, 0.69);
      body.receiveShadow = true;
      g.add(body);
      // Weatherboarding: dark strips along the sides.
      for (let i = 0; i < 3; i++) g.add(box(w * 0.75, 0.025, d * 0.67, mat(PALETTE.darkWood), 0, 0.48 + i * 0.2));
      const roof = pyramidRoof(w * 0.92, d * 0.86, 0.55, mat(PALETTE.roof), 1.0);
      roof.scale.x *= 1.15;
      g.add(roof);
      g.add(box(0.36, 0.48, 0.03, mat(PALETTE.trim), 0, 0.68, (d * 0.66) / 2 + 0.01));
      // Steps up to the door, and sacks waiting to go in.
      g.add(box(0.4, 0.08, 0.3, mat(PALETTE.darkWood), 0, 0.2, (d * 0.66) / 2 + 0.2));
      const sackMat = mat(PALETTE.canvas);
      for (const [x, z, s] of [[0.42, 0.95, 1], [0.6, 0.9, 0.85], [-0.48, 0.92, 0.9]] as const) {
        const sack = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13 * s, 0), sackMat);
        sack.scale.y = 1.3;
        sack.position.set(x, 0.16 * s, z);
        sack.castShadow = true;
        g.add(sack);
      }
      break;
    }
    case 'glasshouse': {
      g = new THREE.Group();
      const glass = new THREE.MeshLambertMaterial({ color: 0xcfe8e4, transparent: true, opacity: 0.45, emissive: new THREE.Color(0x2a3a30) });
      const frame = mat(PALETTE.wall);
      g.add(box(w * 0.85, 0.05, d * 0.85, mat(PALETTE.stone), 0, 0.025));
      const pane = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 0.6, d * 0.8), glass);
      pane.position.y = 0.35;
      g.add(pane);
      g.add(pyramidRoof(w * 0.82, d * 0.82, 0.35, glass, 0.65));
      for (const x of [-1, 1]) for (const z of [-1, 1]) g.add(box(0.05, 0.65, 0.05, frame, (x * w * 0.8) / 2, 0.325, (z * d * 0.8) / 2));
      for (let i = 0; i < 4; i++) g.add(box(0.12, 0.18, 0.12, mat(PALETTE.leaf), -0.45 + i * 0.3, 0.14, 0));
      break;
    }
    case 'banner': {
      g = new THREE.Group();
      g.add(box(0.06, 1.4, 0.06, mat(PALETTE.darkWood)));
      const cloth = box(0.45, 0.32, 0.02, mat(0xc94f4f), 0.25, 1.18);
      g.add(cloth);
      g.add(box(0.2, 0.06, 0.03, mat(0xf2c14e), 0.25, 1.18, 0.01));
      g.add(lanternPost(0.3, 0.25));
      break;
    }
    default:
      g = new THREE.Group();
      g.add(box(w * 0.8, 0.5, d * 0.8, mat(0xcccccc)));
  }
  return g;
}

/** A resident's colour: authored for the founding six, derived from the id for newcomers. */
export function residentColor(id: string): number {
  const known = RESIDENT_COLORS[id];
  if (known !== undefined) return known;
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return new THREE.Color().setHSL((h % 360) / 360, 0.5, 0.55).getHex();
}

export const RESIDENT_COLORS: Record<string, number> = {
  ada: 0x9b7fc9,
  bram: 0xe08a3c,
  fen: 0x3f9b94,
  juniper: 0xa9c43f,
  marlow: 0xc94f4f,
  wren: 0x5c9be0,
};

export function residentMesh(id: string): THREE.Group {
  // A chunky low-poly villager (review: "faceless pills"): legs, a coat in their colour, arms,
  // a head with their hair or hat. Looks match their portrait.
  const look = looksOf(id);
  const coat = mat(residentColor(id));
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  for (const [x, name] of [
    [-0.055, 'legL'],
    [0.055, 'legR'],
  ] as const) {
    const leg = new THREE.Group();
    leg.name = name;
    leg.position.set(x, 0.2, 0);
    leg.add(box(0.07, 0.2, 0.08, mat(0x3a2e26), 0, -0.1, 0));
    body.add(leg);
  }
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 0.3, 7), coat);
  torso.position.y = 0.34;
  torso.castShadow = true;
  body.add(torso);
  body.add(box(0.21, 0.035, 0.18, mat(0x4a3a2c), 0, 0.25, 0));
  for (const [x, name] of [
    [-0.15, 'armL'],
    [0.15, 'armR'],
  ] as const) {
    const arm = new THREE.Group();
    arm.name = name;
    arm.position.set(x, 0.46, 0);
    arm.add(box(0.06, 0.22, 0.07, coat, 0, -0.1, 0));
    const hand = new THREE.Mesh(new THREE.IcosahedronGeometry(0.035, 0), mat(look.skin));
    hand.position.y = -0.22;
    arm.add(hand);
    body.add(arm);
  }
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.115, 1), mat(look.skin));
  head.position.y = 0.6;
  head.castShadow = true;
  body.add(head);
  const hair = mat(look.hair);
  const hairPiece = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
    const p = new THREE.Mesh(geo, m);
    p.position.set(x, y, z);
    p.scale.set(sx, sy, sz);
    p.castShadow = true;
    body.add(p);
  };
  const cap = new THREE.SphereGeometry(0.125, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  switch (look.style) {
    case 'short':
      hairPiece(cap, hair, 0, 0.62, -0.01);
      break;
    case 'bob':
      hairPiece(cap, hair, 0, 0.6, -0.01, 1.08, 1.25, 1.08);
      break;
    case 'bun':
      hairPiece(cap, hair, 0, 0.62, -0.01);
      hairPiece(new THREE.IcosahedronGeometry(0.06, 0), hair, 0, 0.75, -0.07);
      break;
    case 'long':
      hairPiece(cap, hair, 0, 0.62, -0.01);
      hairPiece(new THREE.BoxGeometry(0.2, 0.22, 0.06), hair, 0, 0.52, -0.08);
      break;
    case 'cap':
      hairPiece(cap, mat(residentColor(id), 0), 0, 0.63, 0, 1.02, 0.8, 1.02);
      hairPiece(new THREE.BoxGeometry(0.12, 0.02, 0.1), coat, 0, 0.64, 0.12);
      break;
    case 'hat':
      hairPiece(new THREE.CylinderGeometry(0.19, 0.19, 0.025, 10), mat(0x5a3a24), 0, 0.68, 0);
      hairPiece(new THREE.CylinderGeometry(0.09, 0.11, 0.12, 8), mat(0x6b4a32), 0, 0.75, 0);
      break;
    case 'curly':
      for (const [x, z] of [
        [-0.07, 0],
        [0.07, 0],
        [0, -0.06],
        [0, 0.05],
      ] as const)
        hairPiece(new THREE.IcosahedronGeometry(0.065, 0), hair, x, 0.69, z);
      break;
    case 'bald':
      break;
  }
  if (look.glasses) hairPiece(new THREE.BoxGeometry(0.16, 0.03, 0.02), mat(0x3b3226), 0, 0.61, 0.11);
  g.add(body);
  // A generous invisible hit box, so small figures are easy to click.
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.85, 0.5), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = 0.4;
  hit.name = 'hit';
  g.add(hit);
  g.scale.setScalar(1.25 * look.height);
  return g;
}

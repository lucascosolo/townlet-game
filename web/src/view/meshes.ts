// Greybox low-poly meshes (spec 6, option C: low-poly lantern-light). Flat-shaded primitives;
// lighting and colour do the atmosphere. Windows and lanterns carry emissive materials that
// the scene brightens at night.

import * as THREE from 'three';
import { buildingDef } from '../../../src/content/buildings.js';

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
  window: 0xffd27a,
  lantern: 0xffb85c,
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
};

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
  g.position.set(x, 0, z);
  return g;
}

function house(w: number, d: number, roofColor: number, opts: { chimney?: boolean; oven?: boolean } = {}): THREE.Group {
  const g = new THREE.Group();
  const bw = w * 0.82;
  const bd = d * 0.82;
  const wallH = 0.7;
  g.add(box(bw, wallH, bd, mat(PALETTE.wall)));
  g.add(pyramidRoof(bw + 0.15, bd + 0.15, 0.6, mat(roofColor), wallH));
  // Windows on two faces, glowing at night.
  for (const [x, z, ry] of [
    [0, bd / 2 + 0.01, 0],
    [bw / 2 + 0.01, 0, Math.PI / 2],
    [0, -bd / 2 - 0.01, 0],
  ] as const) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.2), glow.window);
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

/** A mesh group for a building type, centred on its footprint, sitting on y = 0. */
export function buildingMesh(type: string): THREE.Group {
  const [w, d] = buildingDef(type).size;
  let g: THREE.Group;
  switch (type) {
    case 'cottage':
      g = house(w, d, PALETTE.roof, { chimney: true });
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
      g = new THREE.Group();
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.7, 4), mat(PALETTE.canvas));
      t.rotation.y = Math.PI / 4;
      t.position.y = 0.35;
      t.castShadow = true;
      g.add(t);
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

export const RESIDENT_COLORS: Record<string, number> = {
  ada: 0x9b7fc9,
  bram: 0xe08a3c,
  fen: 0x3f9b94,
  juniper: 0xa9c43f,
  marlow: 0xc94f4f,
  wren: 0x5c9be0,
};

export function residentMesh(id: string): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.38, 6), mat(RESIDENT_COLORS[id] ?? 0xdddddd));
  body.position.y = 0.19;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), mat(0xf1d2b6));
  head.position.y = 0.48;
  head.castShadow = true;
  g.add(body, head);
  // A generous invisible hit box, so small figures are easy to click.
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.5), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = 0.35;
  hit.name = 'hit';
  g.add(hit);
  g.scale.setScalar(1.35);
  return g;
}

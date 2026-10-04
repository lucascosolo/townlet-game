// Build-menu thumbnails (review: "the build menu is a text spreadsheet"): each building type is
// rendered once, isometric and lit, into a small image, the first time the menu opens.

import * as THREE from 'three';
import { buildingDef } from '../../../src/content/buildings.js';
import { buildingMesh } from './meshes.js';

const cache = new Map<string, string>();
let renderer: THREE.WebGLRenderer | null = null;

export function thumbnail(type: string, w = 160, h = 112): string {
  const hit = cache.get(type);
  if (hit) return hit;
  try {
    renderer ??= new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(w, h, false);
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfff6e6, 0x6d7a3a, 1.1));
    const sun = new THREE.DirectionalLight(0xfff1d6, 1.6);
    sun.position.set(4, 8, 3);
    scene.add(sun);
    const g = buildingMesh(type, 3);
    const [sw, sd] = buildingDef(type).size;
    const base = new THREE.Mesh(new THREE.BoxGeometry(sw + 0.3, 0.08, sd + 0.3), new THREE.MeshLambertMaterial({ color: 0x9cc77a }));
    base.position.y = -0.04;
    scene.add(base, g);
    const box = new THREE.Box3().setFromObject(g).union(new THREE.Box3().setFromObject(base));
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const span = Math.max(size.x, size.z) * 0.95 + size.y * 0.5;
    const cam = new THREE.OrthographicCamera((-span * w) / h / 2, (span * w) / h / 2, span / 2, -span / 2, 0.1, 100);
    cam.position.set(centre.x + 6, centre.y + 5, centre.z + 6);
    cam.lookAt(centre);
    renderer.render(scene, cam);
    const url = renderer.domElement.toDataURL('image/png');
    cache.set(type, url);
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    return url;
  } catch {
    return '';
  }
}

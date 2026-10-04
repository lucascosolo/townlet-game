// Portraits (review: "no characters you can love"): a small flat-shaded bust for every
// resident, drawn as SVG from their id, so the six founders and every generated newcomer get one.
// Skin, hair, hairstyle and accessories are picked deterministically; the coat is their colour.

import { residentDef } from '../../../src/content/residents.js';
import { residentColor } from '../view/meshes.js';

const SKIN = ['#f3d2b3', '#e8b98f', '#d39c72', '#b27a52', '#8d5a3b', '#6a4129'];
const HAIR = ['#2e221b', '#4a3122', '#6b4528', '#9a6a3a', '#c9a15e', '#d8d2c6', '#8a3b24', '#3b3f46'];
const STYLES = ['short', 'bob', 'bun', 'long', 'cap', 'hat', 'curly', 'bald'] as const;

function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** Lighten a colour towards white by t. */
function tint(n: number, t: number): string {
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const m = (c: number) => Math.round(c + (255 - c) * t);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

export function portraitSvg(id: string, size = 48): string {
  const def = residentDef(id);
  const h = hash(id);
  const coat = residentColor(id);
  const skin = SKIN[h % SKIN.length] as string;
  // Older residents go grey; the young keep their colour.
  const hair = def.age >= 60 ? (h >> 4) % 2 ? '#d8d2c6' : '#b9b3a8' : (HAIR[(h >> 4) % HAIR.length] as string);
  const style = STYLES[(h >> 8) % STYLES.length] as (typeof STYLES)[number];
  const glasses = def.age >= 50 && (h >> 12) % 3 === 0;
  const hairShape: Record<typeof style, string> = {
    short: `<path d="M15 24c0-9 5-13 9-13s9 4 9 13c-2-4-5-6-9-6s-7 2-9 6z" fill="${hair}"/>`,
    bob: `<path d="M13 28c-1-11 4-17 11-17s12 6 11 17c-1-2-2-5-3-7-3 2-13 2-16 0-1 2-2 5-3 7z" fill="${hair}"/>`,
    bun: `<circle cx="24" cy="9" r="4.5" fill="${hair}"/><path d="M15 23c0-8 4-12 9-12s9 4 9 12c-2-3-5-5-9-5s-7 2-9 5z" fill="${hair}"/>`,
    long: `<path d="M13 36c-2-14 2-25 11-25s13 11 11 25c-2-6-3-12-4-15-3 2-11 2-14 0-1 3-2 9-4 15z" fill="${hair}"/>`,
    cap: `<path d="M14 21c0-7 4-11 10-11s10 4 10 11z" fill="${tint(coat, 0.25)}"/><path d="M31 20h6v2h-6z" fill="${tint(coat, 0.1)}"/>`,
    hat: `<path d="M10 20h28v3H10z" fill="#5a3a24"/><path d="M16 20c0-6 3-9 8-9s8 3 8 9z" fill="#6b4a32"/>`,
    curly: `<g fill="${hair}"><circle cx="17" cy="17" r="4"/><circle cx="22" cy="13" r="4.5"/><circle cx="28" cy="13" r="4.5"/><circle cx="32" cy="18" r="4"/></g>`,
    bald: `<path d="M17 18c2-3 4-4 7-4s5 1 7 4" stroke="${hair}" stroke-width="2" fill="none"/>`,
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true">
  <circle cx="24" cy="24" r="24" fill="${tint(coat, 0.72)}"/>
  <path d="M7 48c1-9 8-14 17-14s16 5 17 14z" fill="${hex(coat)}"/>
  <path d="M20 34h8l-4 5z" fill="${tint(coat, 0.5)}"/>
  <rect x="20.5" y="29" width="7" height="6" rx="2" fill="${skin}"/>
  <ellipse cx="24" cy="23" rx="9" ry="10" fill="${skin}"/>
  ${hairShape[style]}
  <circle cx="20.5" cy="24" r="1.2" fill="#2b211a"/><circle cx="27.5" cy="24" r="1.2" fill="#2b211a"/>
  <path d="M21 28.5c1.8 1.3 4.2 1.3 6 0" stroke="#7a4a35" stroke-width="1.2" fill="none" stroke-linecap="round"/>
  <circle cx="18.5" cy="27" r="1.6" fill="#e8907a" opacity="0.35"/><circle cx="29.5" cy="27" r="1.6" fill="#e8907a" opacity="0.35"/>
  ${glasses ? '<g stroke="#3b3226" stroke-width="1" fill="none"><circle cx="20.5" cy="24" r="2.6"/><circle cx="27.5" cy="24" r="2.6"/><path d="M23.1 24h1.8"/></g>' : ''}
</svg>`;
}

/** A portrait element, ready to drop into the UI. */
export function portrait(id: string, size = 48): HTMLElement {
  const span = document.createElement('span');
  span.className = 'portrait';
  span.innerHTML = portraitSvg(id, size);
  return span;
}

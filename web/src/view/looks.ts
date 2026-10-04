// How a resident looks, picked deterministically from their id (and age), shared by the 3D
// villager and the portrait so the two always match.

import { residentDef } from '../../../src/content/residents.js';

export const SKIN = [0xf3d2b3, 0xe8b98f, 0xd39c72, 0xb27a52, 0x8d5a3b, 0x6a4129];
export const HAIR = [0x2e221b, 0x4a3122, 0x6b4528, 0x9a6a3a, 0xc9a15e, 0xd8d2c6, 0x8a3b24, 0x3b3f46];
export const STYLES = ['short', 'bob', 'bun', 'long', 'cap', 'hat', 'curly', 'bald'] as const;
export type HairStyle = (typeof STYLES)[number];

export function hashId(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

export interface Looks {
  skin: number;
  hair: number;
  style: HairStyle;
  glasses: boolean;
  /** 0.9 to 1.1: some are taller than others. */
  height: number;
}

export function looksOf(id: string): Looks {
  const def = residentDef(id);
  const h = hashId(id);
  return {
    skin: SKIN[h % SKIN.length] as number,
    // Older residents go grey; the young keep their colour.
    hair: def.age >= 60 ? ((h >>> 4) % 2 ? 0xd8d2c6 : 0xb9b3a8) : (HAIR[(h >>> 4) % HAIR.length] as number),
    style: STYLES[(h >>> 8) % STYLES.length] as HairStyle,
    glasses: def.age >= 50 && (h >>> 12) % 3 === 0,
    height: def.age < 18 ? 0.8 : 0.92 + ((h >>> 16) % 5) * 0.04,
  };
}

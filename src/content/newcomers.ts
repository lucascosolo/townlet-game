// Newcomers (M3c, owner: "each new person should be unique with their own semi-random but
// coherent personality and sliders"). A newcomer starts from a trade, which leans their values
// and traits; noise makes them their own person; voice, habits and a background line are then
// read off the result, so the whole hangs together. Generation depends only on the town's seed
// and the newcomer's number, so replays, clones and twin tests see the same person.

import { deriveSeed, rand, type RngHolder } from '../sim/rng.js';
import type { Quirk, Register, ResidentDef, Trait, Value } from '../sim/types.js';
import { TRAITS, VALUES } from '../sim/types.js';

interface Trade {
  id: string;
  /** Buildings that draw this kind of person: each one in town makes them likelier to come. */
  drawnBy: string[];
  /** Only drawn by what is built (M4: a trade for a tier building never appears before it). */
  onlyIfDrawn?: boolean;
  past: string[];
  job: string;
  fallbackJob: string;
  ages: [number, number];
  traits: Partial<Record<Trait, number>>;
  values: Partial<Record<Value, number>>;
  hopes: string[];
}

const TRADES: Trade[] = [
  {
    id: 'henkeeper',
    drawnBy: ['coop', 'beehives'],
    onlyIfDrawn: true,
    past: ['Kept hens and bees on a farm downriver', 'A smallholder whose farm was sold', 'Grew turnips on a hillside nobody else wanted', 'A dairy hand who wanted a field at last'],
    job: 'coop',
    fallbackJob: 'garden',
    ages: [26, 64],
    traits: { steady: 0.4, generous: 0.3 },
    values: { nature: 0.75, community: 0.6 },
    hopes: ['Keep a few hens and a hive or two.', 'Have eggs to give away to the neighbours.'],
  },
  {
    id: 'potter',
    drawnBy: ['workshop', 'flowerbed'],
    past: ['A potter from the city', 'A potter whose kiln finally cracked', 'Threw pots at a fairground stall for ten summers', 'Learned the wheel from a grandmother in the hills'],
    job: 'workshop',
    fallbackJob: 'garden',
    ages: [24, 55],
    traits: { tidy: 0.2, curious: 0.3 },
    values: { craft: 0.85, beauty: 0.75 },
    hopes: ['Make a life here with their hands.', 'Find good clay and a quiet bench.'],
  },
  {
    id: 'fisher',
    drawnBy: ['jetty', 'brook'],
    past: ['A fisher from the estuary', 'Worked the boats on the coast for years', 'Mended nets in a harbour town', 'Fished a lake so cold it froze the line'],
    job: 'jetty',
    fallbackJob: 'woodlot',
    ages: [28, 66],
    traits: { steady: 0.5, sociable: -0.3 },
    values: { nature: 0.8, quiet: 0.7 },
    hopes: ['Find a stretch of water to call their own.', 'Be useful, and be left in peace.'],
  },
  {
    id: 'baker',
    drawnBy: ['bakery', 'teahouse'],
    past: ['A baker from a market town', 'Ran a bread stall on the high road', 'Baked for a monastery that closed its doors', 'Kneaded dough at a big city bakery before dawn every day'],
    job: 'bakery',
    fallbackJob: 'garden',
    ages: [22, 60],
    traits: { sociable: 0.5, generous: 0.5 },
    values: { community: 0.8, craft: 0.7 },
    hopes: ['Feed people who know their name.', 'Have a kitchen full of friends.'],
  },
  {
    id: 'gardener',
    drawnBy: ['garden', 'orchard', 'glasshouse', 'flowerbed', 'hedge'],
    past: ['A gardener from a big estate', 'Kept a walled garden for a family who moved away', 'Grew herbs for an apothecary in the city', 'Tended the roses at a seaside hotel'],
    job: 'garden',
    fallbackJob: 'woodlot',
    ages: [20, 75],
    traits: { steady: 0.3, tidy: 0.3 },
    values: { nature: 0.9, beauty: 0.7 },
    hopes: ['Make something grow that lasts for generations.', 'Know every growing thing in the valley.'],
  },
  {
    id: 'carpenter',
    drawnBy: ['woodlot', 'workshop'],
    past: ['A carpenter with a cart of tools', 'A joiner who fixes things nobody asked to be fixed', 'Built boats in a yard by the river', 'Made chairs for a whole village, one a week'],
    job: 'woodlot',
    fallbackJob: 'workshop',
    ages: [24, 62],
    traits: { generous: 0.4, tidy: 0.4 },
    values: { craft: 0.9, prosperity: 0.6 },
    hopes: ['Build something that lasts for generations.', 'Put a roof over people who need one.'],
  },
  {
    id: 'tinkerer',
    drawnBy: ['workshop'],
    past: ['A clockmaker\'s apprentice', 'An inventor whose last invention exploded', 'Repaired mill wheels up and down the valley road', 'Built a flying machine that flew, once'],
    job: 'workshop',
    fallbackJob: 'garden',
    ages: [17, 45],
    traits: { curious: 0.8, steady: -0.3, tidy: -0.4 },
    values: { craft: 0.85, prosperity: 0.5 },
    hopes: ['Make the contraption that finally works.', 'Find out what they are good at.'],
  },
  {
    id: 'host',
    drawnBy: ['teahouse', 'commons', 'bench'],
    past: ['Kept an inn on the old road until the road moved', 'Ran a busy tavern in town', 'Poured cider at every fair in the county', 'Cooked for travellers at a crossroads inn'],
    job: 'garden',
    fallbackJob: 'bakery',
    ages: [30, 68],
    traits: { sociable: 0.8, generous: 0.6 },
    values: { community: 0.95, prosperity: 0.5 },
    hopes: ['Bring the valley together under one roof.', 'Fill a room with laughter again.'],
  },
  {
    id: 'scholar',
    drawnBy: ['glasshouse', 'orchard', 'oak'],
    past: ['A retired teacher of botany', 'A librarian who read every book in the building', 'Kept the parish records for forty years', 'Taught letters to children in three villages'],
    job: 'garden',
    fallbackJob: 'workshop',
    ages: [40, 80],
    traits: { curious: 0.8, sociable: -0.3 },
    values: { quiet: 0.8, nature: 0.6 },
    hopes: ['Write down everything about the valley.', 'Have time, at last, to think.'],
  },
  {
    id: 'musician',
    drawnBy: ['banner', 'commons', 'bench'],
    past: ['A travelling fiddler who stopped travelling', 'Sang in a choir in the city'],
    job: 'garden',
    fallbackJob: 'bakery',
    ages: [18, 58],
    traits: { sociable: 0.5, steady: -0.4 },
    values: { beauty: 0.9, community: 0.7 },
    hopes: ['Play for people who will dance.', 'Write the valley a song.'],
  },
  {
    id: 'trader',
    drawnBy: ['well', 'bakery'],
    past: ['A trader who used to follow the carts', 'Kept accounts for a merchant house'],
    job: 'woodlot',
    fallbackJob: 'garden',
    ages: [22, 55],
    traits: { sociable: 0.4, curious: 0.3 },
    values: { prosperity: 0.9, community: 0.5 },
    hopes: ['Make the valley prosper.', 'Stop moving, for once.'],
  },
];

const NAMES = {
  she: ['Rosa', 'Odile', 'Mabel', 'Ines', 'Greta', 'Tilly', 'Agnes', 'Nell', 'Iris', 'Martha', 'Sylvie', 'Hazel', 'Lotte', 'Bea', 'Clem', 'Esme', 'Freya', 'Ida', 'June', 'Maud'],
  he: ['Hollis', 'Corin', 'Edgar', 'Tobin', 'Silas', 'Rufus', 'Abel', 'Otto', 'Bertie', 'Cal', 'Dunstan', 'Emrys', 'Felix', 'Gideon', 'Huw', 'Jory', 'Linus', 'Noah', 'Percy', 'Wilf'],
  they: ['Tamsin', 'Ash', 'Robin', 'Sorrel', 'Kit', 'Lark', 'Rowan', 'Sage', 'Teal', 'Wynn'],
};

const PRONOUNS = {
  she: { subj: 'she', obj: 'her', poss: 'her' },
  he: { subj: 'he', obj: 'him', poss: 'his' },
  they: { subj: 'they', obj: 'them', poss: 'their' },
} as const;

const TICS: Record<Register, string[]> = {
  formal: ['I must say', 'Well now', 'Indeed', 'My dear'],
  warm: ['honestly', 'oh', 'bless', 'you know'],
  plain: ['Aye.', 'Right.', 'Mm.', 'Fair enough'],
  chatty: ['wait', 'like', 'ooh', 'right?'],
  dreamy: ['hmm', 'you see', 'somehow', 'oh'],
};

const pick = <T>(h: RngHolder, xs: readonly T[]): T => xs[Math.floor(rand(h) * xs.length)] as T;
/** A gentle bell-ish curve on [-1, 1]. */
const noise = (h: RngHolder) => (rand(h) + rand(h) + rand(h) - 1.5) / 1.5;
const round = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function welcomeHash(w: Welcome): string {
  const text = JSON.stringify([w.tick, w.home, Object.entries(w.built).sort(), [...w.near].sort()]);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h.toString(36);
}

/** Why they came, read off who they are. */
function reasonFor(values: Record<Value, number>, traits: Record<Trait, number>): string {
  const top = (Object.entries(values) as Array<[Value, number]>).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (traits.curious > 0.6) return 'wanted to see what was at the top of the valley road';
  switch (top) {
    case 'quiet':
      return 'came looking for somewhere quiet';
    case 'community':
      return 'wanted to belong somewhere';
    case 'prosperity':
      return 'heard there was work in the valley';
    case 'nature':
      return 'wanted to live closer to growing things';
    case 'beauty':
      return 'fell for the valley on a walk and never left';
    default:
      return 'needed a fresh start';
  }
}

function registerFor(traits: Record<Trait, number>, values: Record<Value, number>): Register {
  if (traits.sociable > 0.5 && traits.steady < 0.1) return 'chatty';
  if (traits.curious > 0.5 && values.beauty > 0.6) return 'dreamy';
  if (traits.steady > 0.4 && traits.sociable < 0) return 'plain';
  if (traits.tidy > 0.3 && traits.steady > 0.2) return 'formal';
  return 'warm';
}

/** What the steward's town is like, as a newcomer sees it: what stands, and what is near the home. */
export interface Welcome {
  /** Tick they arrive, and where their home is: the steward's choices of when and where. */
  tick: number;
  home: [number, number];
  /** Live buildings by type, across the town. */
  built: Record<string, number>;
  /** Building types within a few tiles of their home. */
  near: string[];
}

/**
 * The n-th newcomer. Who comes is shaped by the steward's town (owner: "things should be seeded
 * also by the actions of the player"): what has been built draws matching trades, the home's
 * surroundings draw more, and when and where the home went up seeds the rest. Same town, same
 * actions, same person.
 */
export function generateNewcomer(seed: number, n: number, welcome: Welcome, takenNames: Set<string> = new Set()): ResidentDef {
  const h: RngHolder = { rng: deriveSeed(seed, `newcomer:${n}:${welcome.tick}:${welcome.home[0]},${welcome.home[1]}`) };
  const weights = TRADES.map((t) => (t.onlyIfDrawn ? 0 : 1) + t.drawnBy.reduce((s, b) => s + 0.6 * Math.min(3, welcome.built[b] ?? 0) + (welcome.near.includes(b) ? 2 : 0), 0));
  let roll0 = rand(h) * weights.reduce((a, b) => a + b, 0);
  let trade = TRADES[TRADES.length - 1] as Trade;
  for (let i = 0; i < TRADES.length; i++) {
    roll0 -= weights[i] as number;
    if (roll0 < 0) {
      trade = TRADES[i] as Trade;
      break;
    }
  }
  const roll = rand(h);
  const p: keyof typeof PRONOUNS = roll < 0.45 ? 'she' : roll < 0.9 ? 'he' : 'they';
  const free = NAMES[p].filter((x) => !takenNames.has(x));
  const name = free.length > 0 ? pick(h, free) : `${pick(h, NAMES[p])} ${n + 1}`;
  const traits = {} as Record<Trait, number>;
  for (const t of TRAITS) traits[t] = round(clamp((trade.traits[t] ?? 0) + 0.45 * noise(h), -1, 1));
  const values = {} as Record<Value, number>;
  for (const v of VALUES) values[v] = round(clamp((trade.values[v] ?? 0.35) + 0.25 * noise(h), 0, 1));
  const register = registerFor(traits, values);
  const quirks: Quirk[] = [];
  if (traits.sociable < -0.4 && rand(h) < 0.6) quirks.push('homebody');
  if (traits.steady < -0.4 && rand(h) < 0.6) quirks.push('restless');
  if (values.quiet > 0.7 && rand(h) < 0.5) quirks.push('light_sleeper');
  if ((trade.job === 'bakery' || trade.job === 'jetty') && rand(h) < 0.6) quirks.push('early_riser');
  const early = quirks.includes('early_riser');
  const wake = (early ? 5 * 60 : 6 * 60 + Math.floor(rand(h) * 4) * 30) + (quirks.includes('restless') ? 30 : 0);
  const sleep = (early ? 21 * 60 : 22 * 60 + Math.floor(rand(h) * 4) * 30) % (24 * 60);
  const [lo, hi] = trade.ages;
  const age = lo + Math.floor(rand(h) * (hi - lo + 1));
  const pron = PRONOUNS[p];
  const past = pick(h, trade.past);
  const reason = reasonFor(values, traits);
  const background = `${past}, ${name} ${reason}.`;
  // The same in the first person, for when they tell it (bar round 1).
  const bio = `${/^an? /i.test(past) ? `I was ${past.charAt(0).toLowerCase()}${past.slice(1)}` : `I ${past.charAt(0).toLowerCase()}${past.slice(1)}`}. I ${reason}.`;
  const tics = [...TICS[register]].sort(() => rand(h) - 0.5).slice(0, 2);
  return {
    // The id carries what made them, so two towns can never register different people under one id.
    id: `nc${seed}-${n}-${welcomeHash(welcome)}`,
    name,
    pronouns: { ...pron },
    age,
    background,
    bio,
    traits,
    values,
    quirks,
    voice: { register, tics },
    job: trade.job,
    fallbackJob: trade.fallbackJob,
    wake,
    sleep,
    aspiration: pick(h, trade.hopes).replace(/their/g, pron.poss).replace(/they are/g, pron.subj === 'they' ? 'they are' : `${pron.subj} is`),
    birthday: 1 + Math.floor(rand(h) * 28),
  };
}

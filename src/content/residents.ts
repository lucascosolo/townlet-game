import type { ResidentDef } from '../sim/types.js';

const h = (hours: number, minutes = 0) => hours * 60 + minutes;
const she = { subj: 'she', obj: 'her', poss: 'her' };
const he = { subj: 'he', obj: 'him', poss: 'his' };
const they = { subj: 'they', obj: 'them', poss: 'their' };

// The M1 cast: six of the slice's fifteen (spec 4.2.10). Identity, personality, values, voice
// and aspiration are authored; everything else is simulated.
export const RESIDENTS: ResidentDef[] = [
  {
    id: 'ada',
    name: 'Ada',
    pronouns: she,
    age: 68,
    background: 'Retired schoolteacher who came to the valley with her late sister.',
    traits: { sociable: -0.5, steady: 0.8, curious: 0.1, generous: 0.4, tidy: 0.7 },
    values: { beauty: 0.6, quiet: 0.9, community: 0.4, craft: 0.2, nature: 0.8, prosperity: 0.1 },
    quirks: ['light_sleeper', 'homebody'],
    voice: { register: 'formal', tics: ['I must say', 'Honestly'] },
    job: 'garden',
    wake: h(6, 30),
    sleep: h(21, 30),
    aspiration: 'Plant the orchard her sister planned.',
    birthday: 11,
  },
  {
    id: 'bram',
    name: 'Bram',
    pronouns: he,
    age: 41,
    background: 'Baker without an oven, for now. Talks to dough.',
    traits: { sociable: 0.8, steady: -0.5, curious: 0.2, generous: 0.8, tidy: -0.3 },
    values: { beauty: 0.2, quiet: 0.0, community: 0.9, craft: 0.8, nature: 0.2, prosperity: 0.4 },
    quirks: ['early_riser'],
    voice: { register: 'chatty', tics: ['Ha!', 'you know'] },
    job: 'bakery',
    fallbackJob: 'garden',
    wake: h(3, 30),
    sleep: h(20, 0),
    aspiration: 'Bake for the whole valley at the harvest festival.',
    birthday: 3,
  },
  {
    id: 'fen',
    name: 'Fen',
    pronouns: they,
    age: 35,
    background: 'Fishes the brook and says little. Has known Ada for years.',
    traits: { sociable: -0.6, steady: 0.5, curious: 0.3, generous: 0.3, tidy: -0.4 },
    values: { beauty: 0.3, quiet: 0.8, community: 0.3, craft: 0.4, nature: 0.9, prosperity: 0.1 },
    quirks: [],
    voice: { register: 'plain', tics: ['Mm.'] },
    job: 'jetty',
    wake: h(5, 30),
    sleep: h(22, 0),
    aspiration: 'Teach someone to fish properly.',
    birthday: 19,
  },
  {
    id: 'juniper',
    name: 'Juniper',
    pronouns: she,
    age: 27,
    background: 'Tinkerer, newly arrived, full of plans and half-built gadgets.',
    traits: { sociable: 0.3, steady: -0.6, curious: 0.9, generous: -0.2, tidy: -0.6 },
    values: { beauty: 0.4, quiet: 0.1, community: 0.3, craft: 0.9, nature: 0.3, prosperity: 0.6 },
    quirks: ['restless'],
    voice: { register: 'dreamy', tics: ['ooh', 'hmm'] },
    job: 'workshop',
    wake: h(7, 30),
    sleep: h(23, 30),
    aspiration: 'Build a glasshouse the town can use all winter.',
    birthday: 25,
  },
  {
    id: 'marlow',
    name: 'Marlow',
    pronouns: he,
    age: 23,
    background: "A merchant's son, unsure whether he is staying.",
    traits: { sociable: 0.7, steady: 0.0, curious: 0.5, generous: 0.0, tidy: 0.2 },
    values: { beauty: 0.3, quiet: 0.1, community: 0.5, craft: 0.2, nature: 0.2, prosperity: 0.9 },
    quirks: ['restless'],
    voice: { register: 'warm', tics: ['honestly', 'mind you'] },
    job: 'woodlot',
    wake: h(7, 0),
    sleep: h(23, 0),
    aspiration: 'Decide whether to stay or follow the trade cart.',
    birthday: 8,
  },
  {
    id: 'wren',
    name: 'Wren',
    pronouns: they,
    age: 16,
    background: 'Sketches everything. Lives with Juniper, whom they idolise a little.',
    traits: { sociable: 0.2, steady: -0.3, curious: 0.7, generous: 0.5, tidy: -0.2 },
    values: { beauty: 0.9, quiet: 0.3, community: 0.6, craft: 0.5, nature: 0.6, prosperity: 0.0 },
    quirks: [],
    voice: { register: 'warm', tics: ['kind of', 'like'] },
    job: 'garden',
    wake: h(8, 0),
    sleep: h(23, 30),
    aspiration: "Paint the town's banner.",
    birthday: 15,
  },
];

export function residentDef(id: string): ResidentDef {
  const def = RESIDENTS.find((r) => r.id === id);
  if (!def) throw new Error(`unknown resident: ${id}`);
  return def;
}

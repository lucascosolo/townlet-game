import type { Scenario } from '../sim/sim.js';
import { at } from '../sim/time.js';

// The worked example from spec section 3: a bakery goes up beside Ada's cottage, its ovens
// start at four, and the steward later plants a hedge. Then the old oak comes down.
//
// Map (24 x 24), x to the right, y down:
//   Ada's cottage (5,5)   Bram's cottage (14,4)   brook along x=21
//   commons (10,10)       oak (7,12)              teahouse (11,14)
//   bakery goes in at (5,8), hedges at (5,7) and (6,7)
export const bakeryScenario: Scenario = {
  name: 'bakery',
  width: 24,
  height: 24,
  buildings: [
    { type: 'cottage', x: 5, y: 5 }, //  0 Ada
    { type: 'cottage', x: 14, y: 4 }, // 1 Bram
    { type: 'tent', x: 18, y: 13 }, //   2 Fen
    { type: 'cottage', x: 14, y: 17 }, // 3 Juniper and Wren
    { type: 'cottage', x: 7, y: 17 }, // 4 Marlow
    { type: 'brook', x: 21, y: 3 },
    { type: 'commons', x: 10, y: 10 },
    { type: 'well', x: 10, y: 8 },
    { type: 'teahouse', x: 11, y: 14 },
    { type: 'oak', x: 7, y: 12 },
    { type: 'garden', x: 3, y: 11 },
    { type: 'workshop', x: 17, y: 19 },
    { type: 'woodlot', x: 2, y: 19 },
    { type: 'jetty', x: 20, y: 9 },
    { type: 'bench', x: 17, y: 8 },
    { type: 'flowerbed', x: 13, y: 9 },
  ],
  residents: { ada: 0, bram: 1, fen: 2, juniper: 3, marlow: 4, wren: 3 },
  relationships: [
    { a: 'ada', b: 'fen', affinity: 0.55, familiarity: 0.7, trust: 0.7 },
    { a: 'juniper', b: 'wren', affinity: 0.5, familiarity: 0.6, trust: 0.55 },
    { a: 'bram', b: 'marlow', affinity: 0.3, familiarity: 0.5, trust: 0.5 },
    { a: 'ada', b: 'bram', affinity: 0.2, familiarity: 0.4, trust: 0.5 },
  ],
  commands: [
    { at: at(2, 8), kind: 'build', type: 'bakery', x: 5, y: 8 },
    { at: at(6, 10), kind: 'build', type: 'hedge', x: 5, y: 7 },
    { at: at(6, 10), kind: 'build', type: 'hedge', x: 6, y: 7 },
    { at: at(9, 10), kind: 'remove', x: 7, y: 12 },
  ],
};

/** The same town with no steward actions: the baseline for twin comparisons and soak runs. */
export const quietScenario: Scenario = { ...bakeryScenario, name: 'quiet', commands: [] };

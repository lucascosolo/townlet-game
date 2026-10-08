// Quick wins criterion 3 (spec 9.3, predeclared 2026-10-08): the trader's cart, in the simulation.
import { describe, expect, it } from 'vitest';
import { Narrator } from '../src/narrate/narrator.js';
import { runScenario } from '../src/scenarios/index.js';
import { STOCK_CAP, TRADER_GIFT } from '../src/sim/sim.js';
import { at } from '../src/sim/time.js';

describe("the trader's cart", () => {
  it('brings exactly 8 timber and 6 food, as a logged command, and the log says so', () => {
    // Twins: the same town at the same minute, one with the gift; the difference is the gift.
    const make = () => {
      const sim = runScenario('quiet', 1, 'none');
      sim.runUntil(at(1, 10));
      sim.state.stock.timber = 20;
      sim.state.stock.food = 10;
      return sim;
    };
    const given = make();
    const plain = make();
    const narrator = new Narrator(given, { stewardIsYou: true });
    given.schedule([{ at: given.tick, kind: 'gift', from: 'trader' }]);
    given.step();
    plain.step();
    expect(TRADER_GIFT).toEqual({ timber: 8, food: 6 });
    expect(given.state.stock.timber - plain.state.stock.timber).toBeCloseTo(8, 9);
    expect(given.state.stock.food - plain.state.stock.food).toBeCloseTo(6, 9);
    expect(narrator.text()).toMatch(/trader's cart rattles into town and leaves 8 timber and 6 food/);
  });

  it('stays within the stock caps', () => {
    const sim = runScenario('quiet', 1, 'none');
    sim.state.stock.timber = STOCK_CAP.timber - 2;
    expect(sim.traderGift()).toBe(true);
    expect(sim.state.stock.timber).toBe(STOCK_CAP.timber);
  });

  it('comes once a day of town time, not more often', () => {
    const sim = runScenario('quiet', 1, 'none');
    sim.runUntil(at(1, 9));
    expect(sim.giftAvailable()).toBe(true);
    expect(sim.traderGift()).toBe(true);
    const timber = sim.state.stock.timber;
    expect(sim.giftAvailable()).toBe(false);
    expect(sim.traderGift()).toBe(false);
    expect(sim.state.stock.timber).toBe(timber);
    sim.runUntil(at(2, 9));
    expect(sim.giftAvailable()).toBe(true);
  });

  it('replays the same from the command log', () => {
    const play = () => {
      const sim = runScenario('quiet', 2, 'considerate');
      sim.schedule([
        { at: at(1, 9), kind: 'gift', from: 'trader' },
        { at: at(1, 15), kind: 'gift', from: 'trader' },
        { at: at(3, 11), kind: 'gift', from: 'trader' },
      ]);
      sim.runUntil(at(4, 0));
      return JSON.stringify([sim.state.stock, sim.state.lastGiftDay, sim.state.granary ?? 0]);
    };
    expect(play()).toBe(play());
  });
});

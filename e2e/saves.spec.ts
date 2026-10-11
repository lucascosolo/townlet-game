// Save reliability in the browser (spec 9.3, predeclared 2026-10-11): what is stored is a snapshot
// save stamped with the build's sim; a plain reload comes back from the snapshot; a save from an
// older build (commands only) still comes back, by replay.
import { expect, test, type Page } from '@playwright/test';
import { at } from '../src/sim/time.js';

type Handle = { runTicks(n: number): void; save(): void; loaded: string | null; game: { speedIndex: number; sim: { tick: number; state: { order: string[]; buildings: unknown[] } } } };
const KEY = 'townlet.save.v1';

async function open(page: Page, query: string, tick: number): Promise<void> {
  await page.goto(`/?intro=0&${query}`);
  await page.waitForFunction(() => (window as unknown as { __townlet?: unknown }).__townlet !== undefined);
  await page.evaluate((t) => {
    const x = (window as unknown as { __townlet: Handle }).__townlet;
    x.runTicks(t - x.game.sim.tick);
    x.game.speedIndex = 0;
  }, tick);
}

const handle = (page: Page) =>
  page.evaluate(() => {
    const h = (window as unknown as { __townlet: Handle }).__townlet;
    return { tick: h.game.sim.tick, loaded: h.loaded, order: h.game.sim.state.order, buildings: h.game.sim.state.buildings.length };
  });

async function reload(page: Page): Promise<void> {
  // Paused, or the town runs on at 1x between the load and the reading of its clock.
  await page.goto('/?intro=0&speed=0');
  await page.waitForFunction(() => (window as unknown as { __townlet?: unknown }).__townlet !== undefined);
}

test('a save holds a snapshot stamped with the build, and a plain reload comes back from it at the same minute', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page, 'scenario=bakery&seed=2&speed=0', at(4, 10));
  await page.getByTestId('tab-journal').click();
  await page.getByTestId('roster-ada').click();
  await page.getByTestId('sub-talk').click();
  await page.getByTestId('ask-how').click();
  const before = await handle(page);
  await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.save());
  const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), KEY);
  expect(stored.version).toBe(2);
  expect(stored.simVersion).toMatch(/^[0-9a-f]{10}$/);
  expect(stored.snapshot.tick).toBe(before.tick);
  expect(stored.commands.length).toBeGreaterThan(0);
  await reload(page);
  const after = await handle(page);
  expect(after.loaded).toBe('snapshot');
  expect(after.tick).toBe(before.tick);
  expect(after.order).toEqual(before.order);
  expect(after.buildings).toBe(before.buildings);
  // The town carries on: the clock moves and nothing throws.
  await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.runTicks(1440));
  expect((await handle(page)).tick).toBe(before.tick + 1440);
  expect(errors).toEqual([]);
});

// The page saves again as it is put away (pagehide), so a stored save is altered as the next page
// starts, before the game reads it.
async function alterNext(page: Page, alter: 'commands-only' | 'unreadable-snapshot'): Promise<void> {
  await page.addInitScript(
    ({ key, how }) => {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (how === 'commands-only') {
        // As the game stored it before 2026-10-11.
        delete d.snapshot;
        delete d.simVersion;
        d.version = 1;
      } else if (d.snapshot) d.snapshot.version = 99;
      localStorage.setItem(key, JSON.stringify(d));
    },
    { key: KEY, how: alter },
  );
}

test('a save from an older build, with commands only, comes back by replay at the same minute', async ({ page }) => {
  await open(page, 'scenario=bakery&seed=2&speed=0', at(3, 12));
  await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.save());
  const before = await handle(page);
  await alterNext(page, 'commands-only');
  await reload(page);
  const after = await handle(page);
  expect(after.loaded).toBe('replay');
  expect(after.tick).toBe(before.tick);
  expect(after.order).toEqual(before.order);
  expect(after.buildings).toBe(before.buildings);
});

test('a save whose snapshot this code cannot read comes back by replay too', async ({ page }) => {
  await open(page, 'scenario=bakery&seed=2&speed=0', at(3, 12));
  await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.save());
  const before = await handle(page);
  await alterNext(page, 'unreadable-snapshot');
  await reload(page);
  const after = await handle(page);
  expect(after.loaded).toBe('replay');
  expect(after.tick).toBe(before.tick);
  expect(after.order).toEqual(before.order);
});

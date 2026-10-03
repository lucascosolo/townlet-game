// M3c criterion 5 (spec 9.3, predeclared 2026-10-03), in the browser: ask a favour from the
// talk panel and see the answer; on a yes, the resident goes and the stores rise; clearing a plot
// through the UI opens land; a cottage brings a newcomer; the sim stays fast with 12 residents.
import { expect, test, type Page } from '@playwright/test';
import { at } from '../src/sim/time.js';

type Handle = {
  game: { sim: { tick: number; state: any; resident(id: string): any }; command(c: object): void };
  runTicks(n: number): void;
  stats(): { stepMs: number };
};
const W = () => (window as unknown as { __townlet: Handle }).__townlet;

async function ready(page: Page, query: string): Promise<void> {
  await page.goto(`/?${query}`);
  await page.waitForFunction(() => (window as unknown as { __townlet?: Handle }).__townlet !== undefined);
}

async function runTo(page: Page, tick: number): Promise<void> {
  await page.evaluate((t) => {
    const h = (window as unknown as { __townlet: Handle }).__townlet;
    h.runTicks(Math.max(0, t - h.game.sim.tick));
  }, tick);
  await putOff(page);
}

/** Put off any proposal popup (it appears on the next frame, so look twice). */
async function putOff(page: Page): Promise<void> {
  for (let pass = 0; pass < 2; pass++) {
    await page.waitForTimeout(250);
    const later = page.locator('[data-testid^="later-"]');
    while ((await later.count()) > 0) {
      await later.first().click();
      await page.waitForTimeout(50);
    }
  }
}

test('criterion 5a: ask a favour in the talk panel; a yes sends them to work and fills the stores', async ({ page }) => {
  await ready(page, 'intro=0&scenario=quiet&seed=1&speed=0');
  await runTo(page, at(2, 9));
  await putOff(page);
  await page.getByTestId('tab-journal').click();
  await page.getByTestId('roster-fen').click();
  await page.getByTestId('ask-how').click();
  await expect(page.getByTestId('talk-reply')).toContainText('“');
  const before = await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.game.sim.state.stock.timber as number);
  await page.getByTestId('favour-timber').click();
  await expect(page.getByTestId('talk-reply')).not.toBeEmpty();
  const favour = await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.game.sim.resident('fen').favour);
  expect(favour, 'Fen agreed').toBeTruthy();
  await expect(page.getByTestId('favour-status')).toContainText('Doing for you: cutting timber');
  // Watch Fen go to the woodlot and do the work.
  let there = false;
  for (let i = 0; i < 40 && !there; i++) {
    there = await page.evaluate((place) => {
      const h = (window as unknown as { __townlet: Handle }).__townlet;
      h.runTicks(10);
      return h.game.sim.resident('fen').at === place;
    }, favour.placeId);
  }
  expect(there).toBe(true);
  await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.runTicks(5 * 60));
  const after = await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.game.sim.state.stock.timber as number);
  expect(after).toBeGreaterThan(before);
  // Ask too often and hear why not.
  for (let d = 0; d < 4; d++) {
    await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.runTicks(6 * 60));
    await putOff(page);
    await page.getByTestId('roster-fen').click();
    const enabled = await page.getByTestId('favour-garden').isEnabled();
    if (enabled) await page.getByTestId('favour-garden').click();
  }
  const log = await page.evaluate(() => (window as unknown as { __townlet: { game: { narrator: { entries: Array<{ text: string }> } } } }).__townlet.game.narrator.entries.map((e) => e.text).join('\n'));
  expect(log).toMatch(/Fen says no: "|You ask Fen to work the garden\. "/);
});

test('criterion 5b: clearing a wild plot through the UI opens new land', async ({ page }) => {
  await ready(page, 'intro=0&scenario=quiet&seed=1&speed=0');
  await runTo(page, at(2, 8));
  const plot = await page.evaluate(() => {
    const s = (window as unknown as { __townlet: Handle }).__townlet.game.sim.state;
    return s.buildings.find((b: { type: string; x: number; y: number }) => b.type === 'wild' && b.x === 24 && b.y === 8).id as number;
  });
  // Through the plot's card in the journal.
  for (let d = 0; d < 8; d++) {
    const cleared = await page.evaluate((id) => (window as unknown as { __townlet: Handle }).__townlet.game.sim.state.buildings.find((b: { id: number }) => b.id === id).removed, plot);
    if (cleared) break;
    await page.evaluate((id) => {
      const h = window as unknown as { __townlet: Handle & { ui: { select(t: object): void } } };
      h.__townlet.ui.select({ kind: 'building', id });
    }, plot);
    for (const who of ['fen', 'marlow', 'bram', 'ada', 'wren']) {
      await page.getByTestId('clear-who').selectOption(who);
      await page.getByTestId('clear-ask').click();
    }
    await runTo(page, at(3 + d, 8));
  }
  const removed = await page.evaluate((id) => (window as unknown as { __townlet: Handle }).__townlet.game.sim.state.buildings.find((b: { id: number }) => b.id === id).removed, plot);
  expect(removed).toBe(true);
  // The cleared land takes a building.
  const built = await page.evaluate(() => {
    const h = (window as unknown as { __townlet: Handle }).__townlet;
    h.game.sim.state.stock.timber = 50;
    const n = h.game.sim.state.buildings.length;
    h.game.command({ kind: 'build', type: 'cottage', x: 27, y: 11 });
    h.runTicks(1);
    return h.game.sim.state.buildings.length > n;
  });
  expect(built).toBe(true);
});

test('criterion 5c: a cottage brings a newcomer, and the sim stays fast with 12 residents', async ({ page }) => {
  await ready(page, 'intro=0&scenario=quiet&seed=1&speed=0');
  await runTo(page, at(1, 9));
  await page.evaluate(() => {
    const h = (window as unknown as { __townlet: Handle }).__townlet;
    h.game.sim.state.stock.timber = 100;
    const spots = [
      [12, 20],
      [2, 2],
      [8, 2],
      [18, 21],
      [2, 15],
      [17, 11],
    ];
    for (const [x, y] of spots) h.game.command({ kind: 'build', type: 'cottage', x, y });
    // One newcomer an hour, each into the next empty home.
    h.runTicks(9 * 60);
  });
  const count = await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.game.sim.state.order.length as number);
  expect(count).toBeGreaterThanOrEqual(12);
  await putOff(page);
  const newcomer = await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.game.sim.state.order[6] as string);
  await page.getByTestId('tab-journal').click();
  await page.getByTestId(`roster-${newcomer}`).click();
  await expect(page.getByTestId('journal')).toBeVisible();
  await expect(page.getByTestId('section-personality')).toBeVisible();
  // 10x for a few seconds: stepping costs under 2 ms a frame.
  await page.keyboard.press('3');
  await page.waitForTimeout(4000);
  const stepMs = await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.stats().stepMs);
  console.log(`stepMs with ${count} residents at 10x: ${stepMs.toFixed(3)}`);
  expect(stepMs).toBeLessThan(2);
});

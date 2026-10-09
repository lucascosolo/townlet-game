// Bar round 6, the browser parts (spec 9.3, predeclared 2026-10-09): Folk keeps a row beside the
// winter stores in more towns and days, no proposal before the player has touched the town, and
// ?new=1 honours a named seed.
import { expect, test, type Page } from '@playwright/test';
import { at } from '../src/sim/time.js';

type Handle = { runTicks(n: number): void; game: { speedIndex: number; sim: { tick: number; state: any } } };

const frames = (page: Page) => page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));

async function putOff(page: Page): Promise<void> {
  for (let quiet = 0; quiet < 2; ) {
    await frames(page);
    const later = page.locator('[data-testid^="later-"], [data-testid="tier-ok"], [data-testid="intro-next"]');
    if ((await later.count()) > 0) {
      await later.first().click();
      quiet = 0;
    } else quiet++;
  }
}

const towns: Array<{ query: string; days: number[] }> = [
  { query: 'scenario=bakery&seed=3&steward=considerate', days: [14, 22, 27] },
  { query: 'scenario=quiet&seed=5', days: [21] },
];

for (const town of towns) {
  test(`at 1440x900 beside the winter stores, Folk shows a whole row: ${town.query}`, async ({ page }) => {
    test.setTimeout(360_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/?intro=0&${town.query}&speed=0`);
    await page.waitForFunction(() => (window as unknown as { __townlet?: unknown }).__townlet !== undefined);
    let t = 0;
    for (const day of town.days) {
      for (; t < at(day, 10); t += 1440) {
        await page.evaluate((n) => (window as unknown as { __townlet: Handle }).__townlet.runTicks(n), Math.min(1440, at(day, 10) - t));
        await putOff(page);
      }
      const stores = page.getByTestId('stores-card').first();
      if (!(await stores.isVisible())) continue;
      await frames(page);
      const album = (await page.locator('[data-testid="widget-folk"] .album').boundingBox())!;
      const column = (await page.locator('.dash-left').boundingBox())!;
      const cards = await page.locator('[data-testid="widget-folk"] .folk-card').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as { top: number; bottom: number }));
      const whole = cards.filter((c) => c.top >= album.y - 1 && c.bottom <= album.y + album.height + 1 && c.top >= column.y - 1 && c.bottom <= column.y + column.height + 1);
      expect(whole.length, `day ${day}`).toBeGreaterThan(0);
    }
  });
}

test('on a phone, tabs after Begin bring no proposal; a tap on the town does', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto('/?scenario=bakery&seed=5&new=1');
  await page.waitForFunction(() => (window as unknown as { __townlet?: unknown }).__townlet !== undefined);
  for (let i = 0; i < 3; i++) {
    await page.getByTestId('intro-next').tap();
    await frames(page);
  }
  // Hold the clock so the two hours of play do not pass while the tabs are tapped.
  await page.evaluate(() => {
    (window as unknown as { __townlet: Handle }).__townlet.game.speedIndex = 0;
  });
  const open = await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.game.sim.state.story.dilemmas.some((d: { status: string }) => d.status === 'open'));
  for (const tab of ['nav-log', 'nav-goals', 'nav-folk', 'nav-town']) {
    await page.getByTestId(tab).tap();
    await frames(page);
    await frames(page);
    await expect(page.getByTestId('decision')).toHaveCount(0);
  }
  if (open) {
    await page.locator('canvas').first().tap({ position: { x: 195, y: 300 } });
    await frames(page);
    await frames(page);
    await expect(page.getByTestId('decision')).toHaveCount(1);
  }
  await ctx.close();
});

test('?new=1 with a named seed starts that seed', async ({ page }) => {
  await page.goto('/?intro=0&scenario=quiet&seed=7&new=1&speed=0');
  await page.waitForFunction(() => (window as unknown as { __townlet?: unknown }).__townlet !== undefined);
  const seed = await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.game.sim.state.seed);
  expect(seed).toBe(7);
});

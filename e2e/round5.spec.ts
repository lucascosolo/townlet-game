// Bar round 5, the browser parts (spec 9.3, predeclared 2026-10-09): the log is there from the
// first look, "This morning" after a reload, and Folk keeps a row beside the winter stores.
import { expect, test, type Page } from '@playwright/test';
import { at } from '../src/sim/time.js';

type Handle = { runTicks(n: number): void; game: { speedIndex: number; sim: { tick: number; state: any }; narrator: { entries: Array<{ kind: string; importance: string }> } } };

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

test('after Begin on a phone with the intro, the log shows what has happened', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto('/?scenario=bakery&seed=2&new=1');
  await page.waitForFunction(() => (window as unknown as { __townlet?: unknown }).__townlet !== undefined);
  for (let i = 0; i < 3; i++) {
    await page.getByTestId('intro-next').tap();
    await frames(page);
  }
  await page.getByTestId('nav-log').tap();
  await frames(page);
  const rows = await page.locator('[data-testid="log-list"] .entry').count();
  expect(rows).toBeGreaterThan(0);
  await ctx.close();
});

test('after a reload, "This morning" holds the morning\'s news', async ({ page }) => {
  await page.goto('/?intro=0&scenario=bakery&seed=2&speed=0');
  await page.waitForFunction(() => (window as unknown as { __townlet?: unknown }).__townlet !== undefined);
  await page.evaluate((t) => {
    const x = (window as unknown as { __townlet: Handle }).__townlet;
    x.runTicks(t - x.game.sim.tick);
    x.game.speedIndex = 0;
  }, at(3, 9));
  await putOff(page);
  // Save, then open the same URL again (a fresh browser context has no save to begin with).
  await page.evaluate(() => (window as unknown as { __townlet: { save(): void } }).__townlet.save());
  await page.goto('/?intro=0&scenario=bakery&seed=2&speed=0');
  await page.waitForFunction(() => (window as unknown as { __townlet?: unknown }).__townlet !== undefined);
  await putOff(page);
  await page.getByTestId('tab-board').click();
  await frames(page);
  const majors = await page.evaluate(() => {
    const x = (window as unknown as { __townlet: Handle }).__townlet;
    const e = x.game.narrator.entries;
    const last = e.map((y) => y.kind).lastIndexOf('day');
    return e.slice(last + 1).filter((y) => y.kind === 'board' && y.importance === 'major').length;
  });
  if (majors > 0) await expect(page.getByTestId('board-quiet')).toHaveCount(0);
  await expect(page.locator('text=Nothing new on the board.')).toHaveCount(0);
});

test('at 1440x900 with the winter stores card showing, Folk shows a whole row', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?intro=0&scenario=quiet&seed=1&speed=0&steward=considerate');
  await page.waitForFunction(() => (window as unknown as { __townlet?: unknown }).__townlet !== undefined);
  for (let t = 0; t < at(17, 9); t += 1440) {
    await page.evaluate((n) => (window as unknown as { __townlet: Handle }).__townlet.runTicks(n), 1440);
    await putOff(page);
  }
  await expect(page.getByTestId('stores-card').first()).toBeVisible();
  await frames(page);
  const album = (await page.locator('[data-testid="widget-folk"] .album').boundingBox())!;
  const column = (await page.locator('.dash-left').boundingBox())!;
  const cards = await page.locator('[data-testid="widget-folk"] .folk-card').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as { top: number; bottom: number }));
  const whole = cards.filter((c) => c.top >= album.y - 1 && c.bottom <= album.y + album.height + 1 && c.bottom <= column.y + column.height + 1);
  expect(whole.length).toBeGreaterThan(0);
});

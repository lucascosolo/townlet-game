// Quick wins criteria 1–3 (spec 9.3, predeclared 2026-10-08): installable, faster to load, and the
// rewarded bonus with the test ad provider.
import { readdirSync, statSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { at } from '../src/sim/time.js';

type Handle = { runTicks(n: number): void; save(): void; game: { speedIndex: number; sim: { tick: number; state: any } } };

/** Run a function against the page's test handle. */
const h = (page: Page) => <T>(fn: (h: Handle) => T) => page.evaluate(`(${fn.toString()})(window.__townlet)`) as Promise<T>;

async function open(page: Page, query: string, tick: number): Promise<void> {
  await page.goto(`/?intro=0&scenario=quiet&seed=1&speed=0&${query}`);
  await page.waitForFunction(() => (window as unknown as { __townlet?: unknown }).__townlet !== undefined);
  await page.evaluate((t) => {
    const x = (window as unknown as { __townlet: Handle }).__townlet;
    x.runTicks(t - x.game.sim.tick);
  }, tick);
  const frames = () => page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
  for (let quiet = 0; quiet < 2; ) {
    await frames();
    const later = page.locator('[data-testid^="later-"], [data-testid="tier-ok"], [data-testid="intro-next"]');
    if ((await later.count()) > 0) {
      await later.first().click();
      quiet = 0;
    } else quiet++;
  }
}

test('criterion 1: the page links a manifest whose icons load at the sizes it claims, and an Apple touch icon', async ({ page, request }) => {
  await page.goto('/?intro=0&speed=0');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const res = await request.get(new URL(href!, page.url()).toString());
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m).toMatchObject({ name: 'Townlet', short_name: 'Townlet', display: 'standalone' });
  expect(m.start_url).toBeTruthy();
  expect(m.theme_color).toMatch(/^#/);
  expect(m.background_color).toMatch(/^#/);
  const sizes = m.icons.map((i: { sizes: string }) => i.sizes);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(m.icons.some((i: { purpose?: string }) => i.purpose?.includes('maskable'))).toBe(true);
  for (const icon of m.icons as Array<{ src: string; sizes: string }>) {
    const dims = await page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      return `${img.naturalWidth}x${img.naturalHeight}`;
    }, new URL(icon.src, new URL(href!, page.url())).toString());
    expect(dims, icon.src).toBe(icon.sizes);
  }
  const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect((await request.get(new URL(apple!, page.url()).toString())).ok()).toBe(true);
});

test.describe('criterion 2: before any script runs', () => {
  test.use({ javaScriptEnabled: false });
  test('the page shows a loading screen with the game’s name', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#loader')).toBeVisible();
    await expect(page.locator('#loader')).toContainText('Townlet');
  });
});

test('criterion 2: the loading screen is gone once the game is ready, and the code is split', async ({ page }) => {
  await open(page, '', at(1, 9));
  await expect(page.locator('#loader')).toHaveCount(0);
  const files = readdirSync('dist/assets').filter((f) => f.endsWith('.js'));
  const three = files.filter((f) => f.startsWith('three-'));
  const game = files.filter((f) => f.startsWith('index-'));
  expect(three.length).toBe(1);
  expect(game.length).toBe(1);
  expect(statSync(`dist/assets/${game[0]}`).size).toBeLessThan(400_000);
});

test('criterion 3: with no ad provider there is no bonus offer anywhere', async ({ page }) => {
  await open(page, '', at(1, 9));
  await page.waitForTimeout(500);
  await expect(page.getByTestId('trader-card')).toHaveCount(0);
  await expect(page.getByTestId('ad-offer')).toHaveCount(0);
});

test('criterion 3: watching the test ad brings the cart once, pauses the town, and a save replays it', async ({ page }) => {
  await open(page, 'ads=test', at(1, 9));
  await page.evaluate(() => ((window as unknown as { __townlet: Handle }).__townlet.game.speedIndex = 1));
  const offer = page.getByTestId('ad-offer');
  await expect(offer).toBeVisible();
  await offer.click();
  await expect(page.getByTestId('ad-test')).toBeVisible();
  // The town is paused while the ad plays.
  expect(await h(page)((x) => x.game.speedIndex)).toBe(0);
  const tickDuring = await h(page)((x) => x.game.sim.tick);
  await page.waitForTimeout(400);
  expect(await h(page)((x) => x.game.sim.tick)).toBe(tickDuring);
  const before = await h(page)((x) => ({ ...x.game.sim.state.stock }));
  await page.getByTestId('ad-test-finish').click();
  await expect(page.getByTestId('ad-test')).toHaveCount(0);
  // Speed is back to what it was.
  expect(await h(page)((x) => x.game.speedIndex)).toBe(1);
  await page.evaluate(() => ((window as unknown as { __townlet: Handle }).__townlet.game.speedIndex = 0));
  const after = await h(page)((x) => ({ ...x.game.sim.state.stock, gift: x.game.sim.state.lastGiftDay }));
  expect(after.timber - before.timber).toBeCloseTo(8, 0);
  expect(after.food - before.food).toBeGreaterThan(5);
  expect(after.gift).toBe(1);
  // The offer is spent for today.
  await expect(page.getByTestId('ad-offer')).toHaveCount(0);
  await expect(page.getByTestId('trader-card')).toContainText('back on the road tomorrow');
  // The log tells of the cart.
  const log = await page.evaluate(() => (window as unknown as { __townlet: { game: { narrator: { text(): string } } } }).__townlet.game.narrator.text());
  expect(log).toMatch(/trader's cart rattles into town/);
  // A save replays it.
  await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.save());
  const tick = await h(page)((x) => x.game.sim.tick);
  await page.goto('/?speed=0&ads=test');
  await page.waitForFunction(() => (window as unknown as { __townlet?: unknown }).__townlet !== undefined);
  expect(await h(page)((x) => x.game.sim.tick)).toBe(tick);
  expect(await h(page)((x) => x.game.sim.state.lastGiftDay)).toBe(1);
  // The next day the cart is on the road again.
  await page.evaluate((t) => {
    const x = (window as unknown as { __townlet: Handle }).__townlet;
    x.runTicks(t - x.game.sim.tick);
  }, at(2, 9));
  await expect(page.getByTestId('ad-offer')).toBeVisible();
});

test('criterion 3: an ad cut short brings nothing, says so, and the offer stays open', async ({ page }) => {
  await open(page, 'ads=test', at(1, 9));
  // Hold the town still, so any change in the stores could only be the cart.
  await page.evaluate(() => ((window as unknown as { __townlet: Handle }).__townlet.game.speedIndex = 0));
  const before = await h(page)((x) => x.game.sim.state.stock.timber);
  await page.getByTestId('ad-offer').click();
  await page.getByTestId('ad-test-close').click();
  await expect(page.getByTestId('ad-note')).toContainText("didn't play to the end");
  expect(await h(page)((x) => x.game.sim.state.stock.timber)).toBe(before);
  expect(await h(page)((x) => x.game.sim.state.lastGiftDay ?? null)).toBeNull();
  await expect(page.getByTestId('ad-offer')).toBeVisible();
});

test('criterion 3: no ad to show says so and gives nothing', async ({ page }) => {
  await open(page, 'ads=test-empty', at(1, 9));
  await page.getByTestId('ad-offer').click();
  await expect(page.getByTestId('ad-note')).toContainText('No ad to show');
  expect(await h(page)((x) => x.game.sim.state.lastGiftDay ?? null)).toBeNull();
});

// Bar round 3, the browser parts (spec 9.3, predeclared 2026-10-09).
import { expect, test, type Page } from '@playwright/test';
import { TIER_GIFT } from '../src/sim/progress.js';
import { at } from '../src/sim/time.js';

type Handle = { runTicks(n: number): void; game: { speedIndex: number; sim: { tick: number; state: any } }; ui: { select(t: object): void } };

async function open(page: Page, query: string, tick: number): Promise<void> {
  await page.goto(`/?intro=0&${query}`);
  await page.waitForFunction(() => (window as unknown as { __townlet?: unknown }).__townlet !== undefined);
  await page.evaluate((t) => {
    const x = (window as unknown as { __townlet: Handle }).__townlet;
    x.runTicks(t - x.game.sim.tick);
    x.game.speedIndex = 0;
  }, tick);
}

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

test('the talk panel keeps the last three exchanges', async ({ page }) => {
  await open(page, 'scenario=quiet&seed=1&speed=0', at(2, 12));
  await putOff(page);
  await page.getByTestId('tab-journal').click();
  await putOff(page);
  await page.getByTestId('roster-ada').click();
  await page.getByTestId('sub-talk').click();
  for (const q of ['how', 'mind', 'me']) {
    await page.getByTestId(`ask-${q}`).click();
    await frames(page);
  }
  await expect(page.getByTestId('talk-history').locator('.exchange')).toHaveCount(2);
  await expect(page.getByTestId('talk-asked')).toHaveText('What do you think of me?');
});

test('the tier-up modal names the same gift as the log', async ({ page }) => {
  await open(page, 'scenario=quiet&seed=1&speed=0', at(1, 9));
  await putOff(page);
  await page.evaluate(() => {
    const h = (window as unknown as { __townlet: Handle }).__townlet;
    h.game.sim.state.progress.renown = 99;
  });
  // Reading Bram's page teaches his background, and the renown for it pushes the town over the line.
  await page.getByTestId('tab-journal').click();
  for (let i = 0; i < 3; i++) {
    await frames(page);
    const later = page.locator('[data-testid^="later-"]');
    if ((await later.count()) > 0) await later.first().click();
  }
  await page.getByTestId('roster-bram').click();
  await frames(page);
  await expect(page.getByTestId('tier-up')).toBeVisible();
  await expect(page.getByTestId('tier-up')).toContainText(`send ${TIER_GIFT} timber`);
});

test('desktop layout: the Folk album is usable, the hint is not cut, bubbles stay short, Highlights has no empty days, one toast at a time', async ({ page }) => {
  await open(page, 'scenario=bakery&seed=2&speed=0', at(6, 10));
  await putOff(page);
  const folk = (await page.getByTestId('widget-folk').boundingBox())!;
  expect(folk.height).toBeGreaterThanOrEqual(200);
  const status = page.getByTestId('palette-status');
  expect(await status.evaluate((e) => e.scrollWidth <= e.clientWidth + 1 && e.scrollHeight <= e.clientHeight + 1)).toBe(true);
  let toastsMax = 0;
  for (let i = 0; i < 40; i++) {
    await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.runTicks(6));
    await frames(page);
    const heights = await page.evaluate(() => [...document.querySelectorAll('.bubble')].filter((b) => !(b as HTMLElement).hidden).map((b) => (b as HTMLElement).getBoundingClientRect().height));
    for (const h of heights) expect(h).toBeLessThanOrEqual(3 * 12.5 * 1.3 + 4 * 2 + 6 + 2);
    toastsMax = Math.max(toastsMax, await page.locator('.toasts .toast').count());
  }
  expect(toastsMax).toBeLessThanOrEqual(1);
  // Highlights: every day header has something under it.
  await page.getByTestId('tab-log').click();
  await page.locator('.log-filter button').first().click();
  const kinds = await page.evaluate(() => [...document.querySelectorAll('[data-testid="log-list"] .entry')].map((e) => (e.classList.contains('day') ? 'day' : 'line')));
  for (let i = 0; i < kinds.length - 1; i++) if (kinds[i] === 'day') expect(kinds[i + 1], `empty day header at ${i}`).toBe('line');
});

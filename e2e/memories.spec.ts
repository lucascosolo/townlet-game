// Memories in conversation, criterion 7 and the talk reply (spec 9.3, predeclared 2026-10-08).
import { expect, test, type Page } from '@playwright/test';
import { at } from '../src/sim/time.js';

type Handle = { runTicks(n: number): void; game: { speedIndex: number; sim: { tick: number; state: any }; narrator: { lastReply: { text: string } | null } } };

async function open(page: Page, tick: number): Promise<void> {
  await page.goto('/?intro=0&scenario=bakery&seed=2&speed=0');
  await page.waitForFunction(() => (window as unknown as { __townlet?: unknown }).__townlet !== undefined);
  await page.evaluate((t) => {
    const x = (window as unknown as { __townlet: Handle }).__townlet;
    x.runTicks(t - x.game.sim.tick);
    x.game.speedIndex = 0;
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

test('criterion 7: a resident’s page shows up to three dated memories in their own words', async ({ page }) => {
  await open(page, at(6, 12));
  await page.getByTestId('tab-journal').click();
  await page.getByTestId('roster-ada').click();
  const mem = page.getByTestId('memories');
  await expect(mem).toBeVisible();
  const rows = mem.locator('.memory');
  const n = await rows.count();
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThanOrEqual(3);
  for (let i = 0; i < n; i++) {
    await expect(rows.nth(i).locator('.day')).toHaveText(/^Day \d+$/);
    await expect(rows.nth(i).locator('q')).toHaveText(/\b(I|me|my|we|you)\b/);
  }
});

test('asking "What do you think of me?" brings up a dated memory about you', async ({ page }) => {
  // Something has to have happened between you: a hedge on day 2 (bar round 2: with the scenario's
  // scripted steward gone, a town where you did nothing has nothing to remember you by).
  await open(page, at(2, 10));
  await page.evaluate(() => (window as unknown as { __townlet: { game: { command(c: object): void } } }).__townlet.game.command({ kind: 'build', type: 'hedge', x: 4, y: 7 }));
  await page.evaluate((t) => (window as unknown as { __townlet: Handle }).__townlet.runTicks(t - (window as unknown as { __townlet: Handle }).__townlet.game.sim.tick), at(6, 12));
  for (let quiet = 0; quiet < 2; ) {
    await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
    const later = page.locator('[data-testid^="later-"], [data-testid="tier-ok"]');
    if ((await later.count()) > 0) {
      await later.first().click();
      quiet = 0;
    } else quiet++;
  }
  await page.getByTestId('tab-journal').click();
  await page.getByTestId('roster-ada').click();
  await page.getByTestId('sub-talk').click();
  await page.getByTestId('ask-me').click();
  await expect(page.getByTestId('talk-reply')).toContainText(/\byou\b.*\b(yesterday|days ago|last week)\b|\b(yesterday|days ago|last week)\b.*\byou\b/);
});

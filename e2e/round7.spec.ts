// Bar round 7, the browser parts (spec 9.3, predeclared 2026-10-09): a tier card waits while you
// are mid-conversation, and the winter stores card keeps its numbers at 1440x900.
import { expect, test, type Page } from '@playwright/test';
import { at } from '../src/sim/time.js';

type Handle = { runTicks(n: number): void; game: { speedIndex: number; sim: { tick: number; state: any; emit(e: object): void } } };

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

async function open(page: Page, query: string, tick: number): Promise<void> {
  await page.goto(`/?intro=0&${query}`);
  await page.waitForFunction(() => (window as unknown as { __townlet?: unknown }).__townlet !== undefined);
  await page.evaluate((t) => {
    const x = (window as unknown as { __townlet: Handle }).__townlet;
    x.runTicks(t - x.game.sim.tick);
    x.game.speedIndex = 0;
  }, tick);
}

test('a tier card waits while reply chips are waiting, and opens once you have replied', async ({ page }) => {
  await open(page, 'scenario=quiet&seed=1&speed=0', at(3, 12));
  await putOff(page);
  await page.getByTestId('tab-journal').click();
  await putOff(page);
  await page.getByTestId('roster-ada').click();
  await page.getByTestId('sub-talk').click();
  await page.getByTestId('ask-how').click();
  await expect(page.getByTestId('talk-replies')).toBeVisible();
  // The valley grows while Ada's answer waits for your reply.
  await page.evaluate(() => {
    const x = (window as unknown as { __townlet: Handle }).__townlet;
    x.game.sim.emit({ t: x.game.sim.tick, type: 'tier', tier: 1, name: 'Hamlet', unlocks: ['beehives', 'fountain'], cap: 8 });
  });
  await frames(page);
  await frames(page);
  await expect(page.getByTestId('tier-ok')).toHaveCount(0);
  await page.locator('[data-testid="talk-replies"] button').first().click();
  await frames(page);
  await frames(page);
  await expect(page.getByTestId('tier-ok')).toBeVisible();
});

test('at 1440x900 the winter stores card shows its numbers in its title', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?intro=0&scenario=bakery&seed=3&speed=0&steward=considerate');
  await page.waitForFunction(() => (window as unknown as { __townlet?: unknown }).__townlet !== undefined);
  for (let t = 0; t < at(14, 10); t += 1440) {
    await page.evaluate((n) => (window as unknown as { __townlet: Handle }).__townlet.runTicks(n), Math.min(1440, at(14, 10) - t));
    await putOff(page);
  }
  const title = page.getByTestId('stores-title').first();
  await expect(title).toBeVisible();
  await expect(title).toContainText(/\d+\/\d+ · \d+ days? to go/);
  const box = (await title.boundingBox())!;
  const widget = (await page.getByTestId('widget-goals').boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(widget.y + widget.height + 1);
});

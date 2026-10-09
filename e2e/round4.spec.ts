// Bar round 4, the browser parts (spec 9.3, predeclared 2026-10-09).
import { expect, test, type Page } from '@playwright/test';
import { at } from '../src/sim/time.js';

type Handle = { runTicks(n: number): void; game: { speedIndex: number; sim: { tick: number; state: any } } };

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

const chipTexts = (page: Page) => page.locator('[data-testid="talk-replies"] button').allTextContents();

test('an answer left without a reply is followed by the next answer\'s own chips', async ({ page }) => {
  await open(page, 'scenario=quiet&seed=1&speed=0', at(3, 12));
  await putOff(page);
  await page.getByTestId('tab-journal').click();
  await putOff(page);
  await page.getByTestId('roster-ada').click();
  await page.getByTestId('sub-talk').click();
  // Two different questions, no reply in between: the chips follow each answer.
  await page.getByTestId('ask-how').click();
  await expect(page.getByTestId('talk-replies')).toBeVisible();
  const first = await chipTexts(page);
  await page.getByTestId('ask-hope').click();
  await frames(page);
  const second = await chipTexts(page);
  expect(second.length).toBeGreaterThanOrEqual(2);
  expect(second.join('|')).not.toBe(first.join('|'));
  // The hope chips are the hope's own.
  expect(second.some((t) => /hope it comes true|Take your time/.test(t))).toBe(true);
});

test('at 1440x900 the Folk widget shows its cards in full', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, 'scenario=bakery&seed=2&speed=0', at(4, 10));
  await putOff(page);
  await frames(page);
  const widget = (await page.getByTestId('widget-folk').boundingBox())!;
  const album = page.locator('[data-testid="widget-folk"] .album');
  const box = (await album.boundingBox())!;
  const cards = await page.locator('[data-testid="widget-folk"] .folk-card').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as { top: number; bottom: number; height: number }));
  expect(cards.length).toBeGreaterThan(0);
  let shown = 0;
  for (const c of cards) {
    // A card is either wholly in view inside the album, or wholly scrolled out of it: never cut.
    const inside = c.top >= box.y - 1 && c.bottom <= box.y + box.height + 1;
    const outside = c.bottom <= box.y + 1 || c.top >= box.y + box.height - 1;
    expect(inside || outside, `card ${c.top}-${c.bottom} in album ${box.y}-${box.y + box.height}`).toBe(true);
    if (inside) shown++;
  }
  expect(shown).toBeGreaterThan(0);
  // And the album itself is not cut by the widget.
  expect(box.y + box.height).toBeLessThanOrEqual(widget.y + widget.height + 1);
});

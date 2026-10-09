// Bar round 1, the browser parts (spec 9.3, predeclared 2026-10-08): talking back in the talk
// panel, the modal's speed, the first proposal waiting, and bubbles.
import { expect, test, type Page } from '@playwright/test';
import { at } from '../src/sim/time.js';

type Handle = { runTicks(n: number): void; game: { speedIndex: number; sim: { tick: number; state: any }; narrator: { lastReply: { text: string } | null } }; residentScreen(id: string): { x: number; y: number } | null };

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

test('talking back: an answer offers replies, a reply lands and is answered, and the chips go until the next question', async ({ page }) => {
  await open(page, 'scenario=quiet&seed=1&speed=0', at(2, 12));
  await putOff(page);
  await page.getByTestId('tab-journal').click();
  await putOff(page);
  await page.getByTestId('roster-ada').click();
  await page.getByTestId('sub-talk').click();
  await page.getByTestId('ask-me').click();
  const chips = page.getByTestId('talk-replies');
  await expect(chips).toBeVisible();
  await expect(page.getByTestId('reply-agree')).toBeVisible();
  const before = await page.getByTestId('talk-reply').textContent();
  // Bar round 3: the chip says what it agrees with; the chat shows the chip's words.
  const chip = (await page.getByTestId('reply-agree').textContent()) ?? '';
  await page.getByTestId('reply-agree').click();
  await expect(page.getByTestId('talk-asked')).toHaveText(chip);
  await expect(page.getByTestId('talk-reply')).not.toHaveText(before as string);
  await expect(chips).toBeHidden();
  // Logged as a command, so a save replays it.
  const log = await page.evaluate(() => (window as unknown as { __townlet: { game: { commandLog: Array<{ kind: string }> } } }).__townlet.game.commandLog.map((c) => c.kind));
  expect(log).toContain('reply');
});

test('closing a modal restores the speed from before it opened, paused included', async ({ page }) => {
  // Before the day's first proposal is posted, so the first popup comes while we watch.
  await open(page, 'scenario=quiet&seed=1&speed=0', at(1, 5));
  await page.getByTestId('tab-journal').click();
  // Run until a proposal pops.
  for (let i = 0; i < 40 && (await page.getByTestId('decision').count()) === 0; i++) {
    await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.runTicks(30));
    await frames(page);
  }
  await expect(page.getByTestId('decision')).toBeVisible();
  await page.locator('[data-testid^="later-"]').click();
  expect(await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.game.speedIndex)).toBe(0);
});

// Bar round 6 moved this: opening a page no longer counts, only a tap on the town itself (a phone
// player tapped Log after Begin and met a proposal about people they had not seen).
test('the first proposal waits until the player has touched the town or two game hours have passed', async ({ page }) => {
  // Played from the start at a fast speed (never a jump of two hours in one frame) to day 1, 09:30.
  await open(page, 'scenario=quiet&seed=1&speed=0', 0);
  for (let i = 0; i < 19; i++) {
    await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.runTicks(30));
    await frames(page);
  }
  // Under two watched hours, nothing opened: no modal yet, though a proposal is open on the board.
  const open1 = await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.game.sim.state.story.dilemmas.some((d: { status: string }) => d.status === 'open'));
  expect(open1).toBe(true);
  await expect(page.getByTestId('decision')).toHaveCount(0);
  await page.getByTestId('tab-journal').click();
  await frames(page);
  await expect(page.getByTestId('decision')).toHaveCount(0);
  await page.locator('canvas').first().click({ position: { x: 700, y: 400 } });
  await frames(page);
  await expect(page.getByTestId('decision')).toBeVisible();
});

test('bubbles: none narrower than 120px on a phone, and no two overlap', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await open(page, 'scenario=bakery&seed=2&speed=0', at(3, 10));
  await putOff(page);
  let seen = 0;
  for (let i = 0; i < 60; i++) {
    await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.runTicks(5));
    await frames(page);
    const rects = await page.evaluate(() => [...document.querySelectorAll('.bubble')].filter((b) => !(b as HTMLElement).hidden).map((b) => b.getBoundingClientRect().toJSON() as { left: number; right: number; top: number; bottom: number; width: number }));
    for (const r of rects) {
      seen++;
      expect(r.width).toBeGreaterThanOrEqual(120);
    }
    for (let a = 0; a < rects.length; a++) for (let b = a + 1; b < rects.length; b++) {
      const x = rects[a]!;
      const y = rects[b]!;
      const overlap = x.left < y.right && x.right > y.left && x.top < y.bottom && x.bottom > y.top;
      expect(overlap, 'bubbles overlap').toBe(false);
    }
  }
  expect(seen).toBeGreaterThan(0);
  await ctx.close();
});

test('panels drag by their header on desktop and dock back on a double-click', async ({ page }) => {
  await open(page, 'scenario=quiet&seed=1&speed=0', at(1, 9));
  await putOff(page);
  const widget = page.getByTestId('widget-goals');
  const before = (await widget.boundingBox())!;
  const head = widget.locator('.widget-head');
  const h = (await head.boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2 + 300, h.y + h.height / 2 + 200, { steps: 8 });
  await page.mouse.up();
  const after = (await widget.boundingBox())!;
  expect(after.x - before.x).toBeGreaterThan(250);
  expect(after.y - before.y).toBeGreaterThan(150);
  // The buttons in the header still work: fold it.
  await page.getByTestId('collapse-goals').click();
  await expect(widget).toHaveClass(/collapsed/);
  await page.getByTestId('collapse-goals').click();
  // Double-click the header to dock it back.
  await head.dblclick({ position: { x: 40, y: 10 } });
  const docked = (await widget.boundingBox())!;
  expect(Math.abs(docked.x - before.x)).toBeLessThan(4);
  expect(Math.abs(docked.y - before.y)).toBeLessThan(4);
  // The scroll drags too.
  const scroll = page.getByTestId('scroll');
  const s0 = (await scroll.boundingBox())!;
  const rod = scroll.locator('.rod.top');
  const r = (await rod.boundingBox())!;
  await page.mouse.move(r.x + r.width - 60, r.y + 8);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width - 60 - 400, r.y + 8 + 100, { steps: 8 });
  await page.mouse.up();
  const s1 = (await scroll.boundingBox())!;
  expect(s0.x - s1.x).toBeGreaterThan(300);
});

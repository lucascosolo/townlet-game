// M4 criterion 6 (spec 9.3, predeclared 2026-10-04): a phone in portrait. The touch build flow is
// in mobile.spec.ts.
import { expect, test, type Page } from '@playwright/test';
import { at } from '../src/sim/time.js';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

type Handle = { runTicks(n: number): void; game: { sim: { tick: number } }; residentScreen(id: string): { x: number; y: number; visible: boolean } | null; focus(x: number, y: number): void };

async function putOff(page: Page): Promise<void> {
  const frames = () => page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
  for (let quiet = 0; quiet < 2; ) {
    await frames();
    const later = page.locator('[data-testid^="later-"], [data-testid="tier-ok"]');
    if ((await later.count()) > 0) {
      await later.first().tap();
      quiet = 0;
    } else quiet++;
  }
}

async function ready(page: Page): Promise<void> {
  await page.goto('/?intro=0&scenario=quiet&seed=1&speed=0');
  await page.waitForFunction(() => (window as unknown as { __townlet?: unknown }).__townlet !== undefined);
  await page.evaluate((t) => (window as unknown as { __townlet: Handle }).__townlet.runTicks(t - (window as unknown as { __townlet: Handle }).__townlet.game.sim.tick), at(2, 10));
  await putOff(page);
}

/** Every visible control's box, for size and overflow checks. */
async function controls(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button, select, input')]
      .filter((b) => b.offsetParent !== null && getComputedStyle(b).visibility !== 'hidden')
      // Cards in a sideways carousel (the build tray) are reached by scrolling it, not the page.
      .filter((b) => {
        for (let p = b.parentElement; p; p = p.parentElement) if (/(auto|scroll)/.test(getComputedStyle(p).overflowX) && p.scrollWidth > p.clientWidth) return false;
        return true;
      })
      .map((b) => {
        const r = b.getBoundingClientRect();
        return { what: b.dataset.testid ?? b.getAttribute('aria-label') ?? b.textContent?.trim().slice(0, 30) ?? '?', h: r.height, w: r.width, right: r.right, bottom: r.bottom };
      })
      .filter((b) => b.w > 0 && b.h > 0),
  );
}

test('criterion 6: a tab bar of five, 44px controls, no sideways scroll, and the town in view at peek', async ({ page }) => {
  await ready(page);
  const tabs = page.getByTestId('tabbar').locator('button');
  await expect(tabs).toHaveCount(5);
  for (const key of ['town', 'goals', 'folk', 'build', 'log']) await expect(page.getByTestId(`nav-${key}`)).toBeVisible();
  for (const screen of ['town', 'goals', 'folk', 'build', 'log'] as const) {
    await page.getByTestId(`nav-${screen}`).tap();
    await page.waitForTimeout(500);
    const small = (await controls(page)).filter((c) => c.h < 44 && c.bottom > 0 && c.bottom < 844);
    expect(small, `controls under 44px on ${screen}`).toEqual([]);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(wide, `page width on ${screen}`).toBeLessThanOrEqual(390);
    const spill = (await controls(page)).filter((c) => c.right > 390.5);
    expect(spill, `controls off the right edge on ${screen}`).toEqual([]);
  }
  await page.getByTestId('nav-town').tap();
  // The sheet closes with a short animation; on a slow runner it can still be moving after a fixed
  // wait, so measure once it has settled.
  const share = () =>
    page.evaluate(() => {
      const hud = document.querySelector('.hud')!.getBoundingClientRect();
      const sheet = document.querySelector('.scroll')!.getBoundingClientRect();
      return (sheet.top - hud.bottom) / window.innerHeight;
    });
  await expect.poll(share, { timeout: 10_000 }).toBeGreaterThanOrEqual(0.55);
  console.log(`town in view at peek: ${((await share()) * 100).toFixed(0)}% of the screen`);
});

test('criterion 6: tapping someone in the town opens a card with Talk, Favour and Profile', async ({ page }) => {
  await ready(page);
  let tapped = false;
  for (const id of ['fen', 'ada', 'bram', 'wren', 'marlow', 'juniper']) {
    await page.evaluate((rid) => {
      const h = (window as unknown as { __townlet: Handle }).__townlet as Handle & { game: { sim: { resident(id: string): { x: number; y: number } } } };
      const r = h.game.sim.resident(rid);
      h.focus(r.x, r.y);
    }, id);
    await page.waitForTimeout(400);
    const p = await page.evaluate((rid) => (window as unknown as { __townlet: Handle }).__townlet.residentScreen(rid), id);
    if (!p || !p.visible || p.y < 120 || p.y > 680) continue;
    await page.touchscreen.tap(p.x, p.y);
    await page.waitForTimeout(300);
    if (await page.getByTestId('quick-card').isVisible()) {
      tapped = true;
      break;
    }
  }
  expect(tapped).toBe(true);
  for (const b of ['quick-talk', 'quick-favour', 'quick-profile']) await expect(page.getByTestId(b)).toBeVisible();
  await page.getByTestId('quick-talk').tap();
  await expect(page.getByTestId('ask-how')).toBeVisible();
  await page.getByTestId('ask-how').tap();
  await expect(page.getByTestId('talk-reply')).toContainText('“');
});

test('owner playtest: the top bar fits a narrow phone with full stores, a granary and a long tier name', async ({ browser }) => {
  for (const width of [360, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.goto('/?intro=0&scenario=quiet&seed=1&speed=0');
    await page.waitForFunction(() => (window as unknown as { __townlet?: unknown }).__townlet !== undefined);
    await page.evaluate(() => {
      const h = (window as unknown as { __townlet: Handle & { game: { sim: { state: any } } } }).__townlet;
      const s = h.game.sim.state;
      s.stock.food = 40;
      s.stock.timber = 100;
      Object.assign(s.progress ?? (s.progress = { renown: 0, tier: 0, goals: { day: 0, list: [], bonus: false }, known: {}, talkedToday: [], asked: {} }), { tier: 2, renown: 388 });
      s.granary = 288;
      s.stores = { year: 0, target: 330, asked: true };
      s.buildings.push({ ...s.buildings[0], id: 999, type: 'granary', x: 40, y: 40, removed: false });
      h.runTicks(60);
    });
    await page.waitForTimeout(500);
    const spill = await page.evaluate(() => {
      const hud = document.querySelector('.hud')!.getBoundingClientRect();
      return [...document.querySelectorAll<HTMLElement>('.hud *')]
        .filter((e) => e.offsetParent !== null && getComputedStyle(e).display !== 'none')
        .map((e) => ({ what: e.className || e.tagName, r: e.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && (r.right > hud.right + 0.5 || r.left < hud.left - 0.5 || r.right > window.innerWidth))
        .map(({ what, r }) => `${what} ${Math.round(r.left)}–${Math.round(r.right)}`);
    });
    expect(spill, `top bar at ${width}px`).toEqual([]);
    await expect(page.getByTestId('granary-stock')).toBeVisible();
    await ctx.close();
  }
});

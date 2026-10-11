// The device matrix (plan 2026-10-11): phones small and large, phones turned sideways, tablets and
// desktops, on Chromium and on WebKit (Safari's engine). Emulation, not real devices: a real iPhone
// and Android phone are checked by hand against the list in docs/GAME_DESIGN_SPEC.md §9.3.
import { expect, test, type Page } from '@playwright/test';

type Handle = { runTicks(n: number): void; game: { speedIndex: number; sim: { tick: number; resident(id: string): { x: number; y: number }; state: { order: string[] } } }; residentScreen(id: string): { x: number; y: number; visible: boolean } | null; focus(x: number, y: number): void };

interface Device {
  name: string;
  w: number;
  h: number;
  touch: boolean;
  /** The phone layout (a tab bar and a sheet) is expected, as against the dashboard. */
  phone: boolean;
}

const DEVICES: Device[] = [
  { name: 'phone 320x568', w: 320, h: 568, touch: true, phone: true },
  { name: 'phone 360x780', w: 360, h: 780, touch: true, phone: true },
  { name: 'phone 390x844', w: 390, h: 844, touch: true, phone: true },
  { name: 'phone 430x932', w: 430, h: 932, touch: true, phone: true },
  { name: 'phone sideways 844x390', w: 844, h: 390, touch: true, phone: true },
  { name: 'phone sideways 932x430', w: 932, h: 430, touch: true, phone: true },
  { name: 'tablet 768x1024', w: 768, h: 1024, touch: true, phone: false },
  { name: 'tablet 1024x768', w: 1024, h: 768, touch: true, phone: false },
  { name: 'desktop 1280x800', w: 1280, h: 800, touch: false, phone: false },
  { name: 'desktop 1440x900', w: 1440, h: 900, touch: false, phone: false },
];

const frames = (page: Page) => page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));

async function press(page: Page, testid: string, touch: boolean): Promise<void> {
  const l = page.getByTestId(testid).first();
  if (touch) await l.tap();
  else await l.click();
}

/** Put off whatever popped (a proposal, a tier card). */
async function putOff(page: Page, touch: boolean): Promise<void> {
  for (let quiet = 0; quiet < 2; ) {
    await frames(page);
    const later = page.locator('[data-testid^="later-"], [data-testid="tier-ok"]');
    if ((await later.count()) > 0) {
      // Review 9: a proposal's Approve and Decline were 31 px on phones, and sideways the card sat over the HUD.
      if (await page.evaluate(() => document.body.classList.contains('phone'))) {
        const card = await page.evaluate(() => {
          const m = document.querySelector('.modal') as HTMLElement | null;
          const hud = document.querySelector('.hud') as HTMLElement | null;
          return { buttons: [...document.querySelectorAll<HTMLElement>('.modal-buttons button')].map((b) => b.getBoundingClientRect().height), top: m?.getBoundingClientRect().top ?? 0, hudBottom: hud?.getBoundingClientRect().bottom ?? 0, landscape: document.body.classList.contains('landscape') };
        });
        for (const h of card.buttons) expect(h, 'a proposal button on a phone').toBeGreaterThanOrEqual(43.5);
        if (card.landscape) expect(card.top, 'the card sits below the HUD when sideways').toBeGreaterThanOrEqual(card.hudBottom - 1);
      }
      if (touch) await later.first().tap();
      else await later.first().click();
      quiet = 0;
    } else quiet++;
  }
}

/** Every visible control's box (the build tray's sideways carousel aside). */
async function controls(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button, select, input')]
      .filter((b) => b.offsetParent !== null && getComputedStyle(b).visibility !== 'hidden')
      .filter((b) => {
        for (let p = b.parentElement; p; p = p.parentElement) if (/(auto|scroll)/.test(getComputedStyle(p).overflowX) && p.scrollWidth > p.clientWidth) return false;
        return true;
      })
      .map((b) => {
        const r = b.getBoundingClientRect();
        return { what: b.dataset.testid ?? b.getAttribute('aria-label') ?? b.textContent?.trim().slice(0, 30) ?? '?', h: r.height, w: r.width, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      })
      .filter((b) => b.w > 0 && b.h > 0),
  );
}

/** Whether the element at the centre of a test id is that element (so nothing covers it); else what is there. */
async function uncovered(page: Page, testid: string): Promise<true | string> {
  return page.evaluate((id) => {
    const e = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    if (!e) return 'missing';
    const r = e.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return 'no size';
    if (r.right > window.innerWidth + 0.5 || r.bottom > window.innerHeight + 0.5 || r.left < -0.5 || r.top < -0.5) return `off screen at ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)} in ${window.innerWidth}x${window.innerHeight}`;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (hit && (hit === e || e.contains(hit))) return true;
    return `covered by ${hit ? `${hit.tagName.toLowerCase()}.${(hit as HTMLElement).className}`.slice(0, 80) : 'nothing'}`;
  }, testid);
}

for (const d of DEVICES) {
  test(`${d.name}: the shell fits, nothing covers the HUD, controls are big enough, and the day's work can be done`, async ({ browser, browserName }) => {
    test.setTimeout(240_000);
    const ctx = await browser.newContext({ viewport: { width: d.w, height: d.h }, isMobile: d.touch && browserName !== 'webkit' ? d.w < 800 : false, hasTouch: d.touch });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // Fresh town with the intro, as a new player sees it.
    await page.goto('/?scenario=bakery&seed=2&new=1');
    await page.waitForFunction(() => (window as unknown as { __townlet?: unknown }).__townlet !== undefined);
    for (let i = 0; i < 3; i++) {
      await expect(page.getByTestId('intro-next')).toBeVisible();
      expect(await uncovered(page, 'intro-next'), 'the intro button is reachable').toBe(true);
      // Review 9: the intro's Next and Begin were 31 px on phones.
      if (d.phone) expect((await page.getByTestId('intro-next').boundingBox())!.height, 'intro button height').toBeGreaterThanOrEqual(43.5);
      await press(page, 'intro-next', d.touch);
      await frames(page);
    }
    await page.evaluate((t) => {
      const x = (window as unknown as { __townlet: Handle }).__townlet;
      x.game.speedIndex = 0;
      x.runTicks(t - x.game.sim.tick);
    }, 5 * 1440 + 10 * 60);
    await putOff(page, d.touch);
    await frames(page);

    const layout = await page.evaluate(() => ({ phone: document.body.classList.contains('phone'), wide: document.documentElement.scrollWidth, inner: window.innerWidth }));
    expect(layout.phone, 'phone or dashboard layout').toBe(d.phone);
    expect(layout.wide, 'no sideways scroll').toBeLessThanOrEqual(layout.inner);

    // The HUD: clock, stock and renown in view and not covered by a widget or the sheet.
    for (const id of ['clock', 'stock', 'renown', 'speed-1']) expect(await uncovered(page, id), `${id} is in view and uncovered`).toBe(true);
    expect(await page.getByTestId('renown').textContent(), 'renown shows its number').toMatch(/\d/);

    // Touch targets: 44px in the phone layout, 40px for a finger on the dashboard.
    if (d.touch) {
      const min = d.phone ? 44 : 40;
      const small = (await controls(page)).filter((c) => c.h < min - 0.5 && c.bottom > 0 && c.top < d.h);
      expect(small, `controls under ${min}px`).toEqual([]);
    }
    const spill = (await controls(page)).filter((c) => c.right > d.w + 0.5 || c.left < -0.5);
    expect(spill, 'controls off the edge').toEqual([]);

    if (d.phone) {
      // The tab bar is there and each tab opens without covering the HUD.
      for (const tab of ['goals', 'folk', 'log', 'town']) {
        await press(page, `nav-${tab}`, d.touch);
        await frames(page);
        expect(await uncovered(page, 'clock'), `clock after ${tab}`).toBe(true);
      }
      await press(page, 'nav-goals', d.touch);
      await frames(page);
      await expect(page.locator('[data-testid^="goal-"]').first()).toBeVisible();
      // The tier card shows the renown progress, which the phone HUD does not.
      await expect(page.getByTestId('tier')).toBeVisible();
      await expect(page.getByTestId('tier').locator('.track')).toBeVisible();
      // Build: pick a card, the place bar appears, rotate and cancel work.
      await press(page, 'nav-build', d.touch);
      await frames(page);
      await page.locator('[data-testid^="tool-build-"]:not([disabled]):not([data-testid="tool-build-path"])').first().tap();
      await frames(page);
      await expect(page.getByTestId('place-bar')).toBeVisible();
      for (const id of ['place-ok', 'place-rotate', 'place-cancel']) expect(await uncovered(page, id), `${id} reachable`).toBe(true);
      await press(page, 'place-rotate', d.touch);
      await press(page, 'place-cancel', d.touch);
      await frames(page);
      await expect(page.getByTestId('place-bar')).toBeHidden();
      // Talk: tap someone in the town, then ask and reply.
      await press(page, 'nav-town', d.touch);
      await frames(page);
      let tapped = false;
      for (const id of ['fen', 'ada', 'bram', 'wren', 'marlow', 'juniper']) {
        await page.evaluate((rid) => {
          const h = (window as unknown as { __townlet: Handle }).__townlet;
          const r = h.game.sim.resident(rid);
          h.focus(r.x, r.y);
        }, id);
        await page.waitForTimeout(350);
        const p = await page.evaluate((rid) => (window as unknown as { __townlet: Handle }).__townlet.residentScreen(rid), id);
        if (!p || !p.visible || p.y < 110 || p.y > d.h - 130) continue;
        await page.touchscreen.tap(p.x, p.y);
        await page.waitForTimeout(300);
        if (await page.getByTestId('quick-card').isVisible()) {
          tapped = true;
          break;
        }
      }
      expect(tapped, 'a resident can be tapped in the town').toBe(true);
      await press(page, 'quick-talk', d.touch);
      await expect(page.getByTestId('ask-how')).toBeVisible();
      await press(page, 'ask-how', d.touch);
      await expect(page.getByTestId('talk-replies')).toBeVisible();
      const chip = page.locator('[data-testid="talk-replies"] button').first();
      expect((await chip.boundingBox())!.height, 'reply chip height').toBeGreaterThanOrEqual(43.5);
      await chip.tap();
      await frames(page);
      // Turned the other way, the phone layout stays usable.
      await page.setViewportSize({ width: d.h, height: d.w });
      await page.waitForTimeout(400);
      await frames(page);
      const turned = await page.evaluate(() => ({ phone: document.body.classList.contains('phone'), wide: document.documentElement.scrollWidth, inner: window.innerWidth }));
      expect(turned.phone, 'still the phone layout when turned').toBe(true);
      expect(turned.wide).toBeLessThanOrEqual(turned.inner);
      await expect(page.getByTestId('tabbar')).toBeVisible();
      // The sheet and HUD settle over a few frames after a turn (a 400 ms wait was once not enough on Chromium).
      for (const id of ['clock', 'renown', 'nav-town']) await expect.poll(() => uncovered(page, id), { message: `${id} after turning`, timeout: 3000 }).toBe(true);
    } else {
      // The dashboard: Goals and Folk whole, the tier line opens, the scroll and dock reachable.
      for (const id of ['widget-goals', 'widget-folk', 'scroll', 'open-build', 'tool-remove']) await expect(page.getByTestId(id)).toBeVisible();
      const goals = (await page.getByTestId('widget-goals').boundingBox())!;
      const folk = (await page.getByTestId('widget-folk').boundingBox())!;
      expect(goals.y + goals.height, 'Goals above Folk').toBeLessThanOrEqual(folk.y + 1);
      expect(folk.y + folk.height, 'Folk within the window').toBeLessThanOrEqual(d.h + 1);
      for (const id of ['goal-' + (await page.locator('[data-testid^="goal-"]').first().getAttribute('data-testid'))!.slice(5), 'tier-line']) expect(await uncovered(page, id), `${id} in view`).toBe(true);
      await press(page, 'tier-line', d.touch);
      await frames(page);
      await expect(page.getByTestId('tier').locator('.track')).toBeVisible();
      // Build from the dock: a card, then the ghost; Escape or cancel puts it away.
      await press(page, 'open-build', d.touch);
      await frames(page);
      await page.locator('[data-testid^="tool-build-"]:not([disabled]):not([data-testid="tool-build-path"])').first().click();
      await frames(page);
      if (d.touch) {
        await expect(page.getByTestId('place-bar')).toBeVisible();
        await press(page, 'place-cancel', d.touch);
      } else await page.keyboard.press('Escape');
      await frames(page);
      await expect(page.getByTestId('place-bar')).toBeHidden();
      // Talk from the journal.
      await press(page, 'tab-journal', d.touch);
      await press(page, 'roster-ada', d.touch);
      await press(page, 'sub-talk', d.touch);
      await press(page, 'ask-how', d.touch);
      await expect(page.getByTestId('talk-replies')).toBeVisible();
    }
    expect(errors, 'no page errors').toEqual([]);
    await ctx.close();
  });
}

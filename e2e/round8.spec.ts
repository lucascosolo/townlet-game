// Bar round 8, the browser parts (spec 9.3, predeclared 2026-10-10): the tier card says a newcomer
// needs an empty cottage, and on the phone another tab puts the build tool away.
import { expect, test, type Page } from '@playwright/test';

type Handle = { game: { sim: { tick: number; emit(e: object): void } }; ui: { tool: { kind: string } } };

const frames = (page: Page) => page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));

test('the tier card says a newcomer moves into an empty cottage', async ({ page }) => {
  await page.goto('/?intro=0&scenario=quiet&seed=1&speed=0');
  await page.waitForFunction(() => (window as unknown as { __townlet?: unknown }).__townlet !== undefined);
  await page.evaluate(() => {
    const x = (window as unknown as { __townlet: Handle }).__townlet;
    x.game.sim.emit({ t: x.game.sim.tick, type: 'tier', tier: 1, name: 'Hamlet', unlocks: ['beehives', 'fountain'], cap: 8 });
  });
  await frames(page);
  await frames(page);
  await expect(page.getByTestId('tier-how')).toContainText('a newcomer moves into an empty cottage');
});

test('on a phone, choosing another tab puts the build tool away', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto('/?intro=0&scenario=quiet&seed=1&speed=0');
  await page.waitForFunction(() => (window as unknown as { __townlet?: unknown }).__townlet !== undefined);
  const tool = () => page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.ui.tool.kind);
  for (const tab of ['nav-folk', 'nav-goals', 'nav-log', 'nav-town']) {
    await page.getByTestId('nav-build').tap();
    await frames(page);
    await page.locator('[data-testid^="tool-build-"]:not([disabled])').first().tap();
    await frames(page);
    expect(await tool()).toBe('build');
    await page.getByTestId(tab).tap();
    await frames(page);
    expect(await tool(), tab).toBe('select');
  }
  await ctx.close();
});

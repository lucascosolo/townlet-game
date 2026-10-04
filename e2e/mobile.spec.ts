// Owner playtest: building on a phone. Choosing a building shows an outline and a bar; taps and
// drags move the outline, never build; Place builds, Rotate turns it, Cancel stops.
import { expect, test } from '@playwright/test';
import { at } from '../src/sim/time.js';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('touch: tap moves the outline, Place builds, Rotate turns, Cancel stops', async ({ page }) => {
  await page.goto('/?intro=0&scenario=quiet&seed=1&speed=0');
  await page.waitForFunction(() => (window as unknown as { __townlet?: unknown }).__townlet !== undefined);
  await page.evaluate((t) => {
    const h = (window as unknown as { __townlet: { runTicks(n: number): void; game: { sim: { tick: number } } } }).__townlet;
    h.runTicks(t - h.game.sim.tick);
  }, at(1, 10));
  for (let i = 0; i < 2; i++) {
    await page.waitForTimeout(300);
    const later = page.locator('[data-testid^="later-"]');
    while (await later.count()) await later.first().tap();
  }
  const count = () => page.evaluate(() => (window as unknown as { __townlet: { game: { sim: { state: { buildings: unknown[] } } } } }).__townlet.game.sim.state.buildings.length);
  const before = await count();
  await page.getByTestId('open-build').tap();
  await page.getByTestId('tool-build-flowerbed').tap();
  await expect(page.getByTestId('place-bar')).toBeVisible();
  // A tap on the map moves the outline; it doesn't build.
  await page.touchscreen.tap(200, 200);
  await page.waitForTimeout(200);
  expect(await count()).toBe(before);
  await page.getByTestId('place-rotate').tap();
  await expect(page.getByTestId('place-ok')).toBeVisible();
  // Find a free spot by tapping around until Place is enabled, then place.
  for (const [x, y] of [[200, 200], [150, 250], [250, 150], [120, 180], [280, 260]] as const) {
    if (await page.getByTestId('place-ok').isEnabled()) break;
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(150);
  }
  await page.getByTestId('place-ok').tap();
  await page.evaluate(() => (window as unknown as { __townlet: { runTicks(n: number): void } }).__townlet.runTicks(1));
  expect(await count()).toBe(before + 1);
  await page.getByTestId('place-cancel').tap();
  await expect(page.getByTestId('place-bar')).toBeHidden();
});

// Winter stores criterion 6 (spec 9.3, predeclared 2026-10-04): the quest card on the board, the
// granary's count in the HUD, and the granary in the build tray.
import { expect, test, type Page } from '@playwright/test';
import { at } from '../src/sim/time.js';

type Handle = { game: { sim: { tick: number; state: { granary?: number } } }; runTicks(n: number): void };

async function runTo(page: Page, tick: number): Promise<void> {
  await page.evaluate((t) => {
    const h = (window as unknown as { __townlet: Handle }).__townlet;
    h.runTicks(Math.max(0, t - h.game.sim.tick));
  }, tick);
  await putOff(page);
}

async function putOff(page: Page): Promise<void> {
  // Popups show one per rendered frame, and a slow frame can take longer than any fixed wait:
  // wait for frames to be drawn, put off what is there, and stop after two quiet frames.
  const frames = () => page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
  for (let quiet = 0; quiet < 2; ) {
    await frames();
    const later = page.locator('[data-testid^="later-"], [data-testid="tier-ok"]');
    if ((await later.count()) > 0) {
      await later.first().click();
      quiet = 0;
    } else quiet++;
  }
}

test('criterion 6: the board shows the winter stores, the HUD the granary, and the tray has a granary', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/?intro=0&scenario=quiet&seed=1&speed=0&steward=considerate');
  await page.waitForFunction(() => (window as unknown as { __townlet?: Handle }).__townlet !== undefined);
  await page.getByTestId('open-build').click();
  await expect(page.getByTestId('tool-build-granary')).toContainText('12 timber');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('granary-stock')).toBeHidden();
  // Juniper raises the quest within the first week or so; the considerate steward builds the granary.
  await runTo(page, at(17, 9));
  await page.getByTestId('tab-board').click();
  const card = page.getByTestId('stores-card');
  await expect(card).toContainText("Winter stores · Juniper's worry");
  const { put, target } = await page.evaluate(() => {
    const state = (window as unknown as { __townlet: Handle }).__townlet.game.sim.state as { granary?: number; stores?: { target: number } };
    return { put: Math.floor(state.granary ?? 0), target: state.stores?.target ?? 0 };
  });
  expect(target).toBeGreaterThanOrEqual(150);
  await expect(card.getByTestId('stores-progress')).toContainText(`${put} of ${target} food put by in the granary · 5 days to winter`);
  await expect(page.getByTestId('granary-stock')).toBeVisible();
  await expect(page.getByTestId('granary-stock')).toContainText(`${put}/${target}`);
});

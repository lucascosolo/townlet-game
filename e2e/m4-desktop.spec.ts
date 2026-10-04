// M4 criteria 7 and 8 (spec 9.3, predeclared 2026-10-04): the desktop dashboard, and saving.
import { expect, test, type Page } from '@playwright/test';
import { at } from '../src/sim/time.js';

type Handle = { runTicks(n: number): void; save(): void; game: { sim: { tick: number; state: any }; command(c: object): void } };

async function putOff(page: Page): Promise<void> {
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

test.use({ viewport: { width: 1440, height: 900 } });

test('criterion 7: the dashboard docks Goals, Folk and the board, log and journal; each folds and comes back; the town keeps the middle', async ({ page }) => {
  await page.goto('/?intro=0&scenario=quiet&seed=1&speed=0');
  await page.waitForFunction(() => (window as unknown as { __townlet?: unknown }).__townlet !== undefined);
  await page.evaluate((t) => (window as unknown as { __townlet: Handle }).__townlet.runTicks(t - (window as unknown as { __townlet: Handle }).__townlet.game.sim.tick), at(2, 10));
  await putOff(page);
  for (const w of ['widget-goals', 'widget-folk', 'scroll']) await expect(page.getByTestId(w)).toBeVisible();
  await expect(page.getByTestId('goal-' + (await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.game.sim.state.progress.goals.list[0].kind)))).toBeVisible();
  await page.getByTestId('folk-ada').click();
  await expect(page.getByTestId('journal').locator('h2')).toContainText('Ada');
  for (const key of ['goals', 'folk']) {
    await page.getByTestId(`collapse-${key}`).click();
    await expect(page.getByTestId(key)).toBeHidden();
    await page.getByTestId(`collapse-${key}`).click();
    await expect(page.getByTestId(key)).toBeVisible();
    await page.getByTestId(`hide-${key}`).click();
    await expect(page.getByTestId(`widget-${key}`)).toBeHidden();
    await page.getByTestId('widgets').click();
    await page.getByTestId(`show-widget-${key}`).click();
    await expect(page.getByTestId(`widget-${key}`)).toBeVisible();
  }
  await page.getByTestId('hide-panel').click();
  await expect(page.getByTestId('scroll')).toBeHidden();
  await page.getByTestId('widgets').click();
  await page.getByTestId('show-widget-panel').click();
  await expect(page.getByTestId('scroll')).toBeVisible();
  const gap = await page.evaluate(() => {
    const left = document.querySelector('.dash-left')!.getBoundingClientRect().right;
    const right = document.querySelector('.scroll')!.getBoundingClientRect().left;
    return (right - left) / window.innerWidth;
  });
  console.log(`town in the middle: ${(gap * 100).toFixed(0)}% of the width`);
  expect(gap).toBeGreaterThanOrEqual(0.4);
});

test('criterion 8: reloading restores the same town; "new valley" starts a fresh one', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __townlet?: unknown }).__townlet !== undefined);
  await putOff(page);
  await page.evaluate((t) => (window as unknown as { __townlet: Handle }).__townlet.runTicks(t - (window as unknown as { __townlet: Handle }).__townlet.game.sim.tick), at(2, 10));
  await putOff(page);
  await page.evaluate(() => {
    const h = (window as unknown as { __townlet: Handle }).__townlet;
    h.game.command({ kind: 'talk', who: 'ada', question: 'how' });
    h.game.command({ kind: 'talk', who: 'bram', question: 'hope' });
    h.game.command({ kind: 'build', type: 'flowerbed', x: 2, y: 2 });
    h.runTicks(90);
    h.save();
  });
  const snap = () =>
    page.evaluate(() => {
      const s = (window as unknown as { __townlet: Handle }).__townlet.game.sim.state;
      return { tick: s.tick, buildings: s.buildings.filter((b: { removed: boolean }) => !b.removed).length, known: JSON.stringify(s.progress?.known ?? {}), renown: s.progress?.renown ?? 0, residents: s.order.length, seed: s.seed };
    });
  const before = await snap();
  expect(before.known).toContain('ada');
  await page.reload();
  await page.waitForFunction(() => (window as unknown as { __townlet?: unknown }).__townlet !== undefined);
  await expect(page.getByTestId('intro')).toHaveCount(0);
  await putOff(page);
  // The restored town runs on at normal speed, so its clock may have moved a few minutes on.
  const restored = await snap();
  expect({ ...restored, tick: 0 }).toEqual({ ...before, tick: 0 });
  expect(restored.tick - before.tick).toBeGreaterThanOrEqual(0);
  expect(restored.tick - before.tick).toBeLessThan(30);
  // Start over from the help screen: two taps.
  await page.getByTestId('help').click();
  await page.getByTestId('new-valley').click();
  await page.getByTestId('new-valley').click();
  await page.waitForURL((u) => !u.search.includes('new=1'));
  await page.waitForFunction(() => (window as unknown as { __townlet?: unknown }).__townlet !== undefined);
  const after = await snap();
  expect(after.seed).not.toBe(before.seed);
  expect(after.tick).toBeLessThan(before.tick);
});

// M2.5 criteria 1, 2, 4 and 5 (spec 9.3, predeclared 2026-10-03), in the browser.
import { expect, test, type Page } from '@playwright/test';
import { at } from '../src/sim/time.js';

type Handle = {
  game: { sim: { tick: number; state: any }; narrator: { entries: Array<{ t: number; text: string }> } };
  runTicks(n: number): void;
  tileScreen(x: number, y: number): { x: number; y: number };
  focus(x: number, y: number): void;
  yaw(): number;
};
const h = (page: Page) => page.evaluate.bind(page);
async function ready(page: Page, query: string): Promise<void> {
  await page.goto(`/?${query}`);
  await page.waitForFunction(() => (window as unknown as { __townlet?: Handle }).__townlet !== undefined);
}

test('criterion 1: the introduction says you are the steward, and narration calls you "you"', async ({ page }) => {
  await ready(page, 'scenario=quiet&seed=1&speed=0');
  const intro = page.getByTestId('intro');
  await expect(intro).toBeVisible();
  let text = '';
  for (let i = 0; i < 3; i++) {
    text += await intro.innerText();
    await page.getByTestId('intro-next').click();
  }
  expect(text).toMatch(/You are the steward/);
  await expect(page.getByTestId('intro')).toHaveCount(0);
  await h(page)(() => {
    const t = (window as unknown as { __townlet: Handle & { game: { command(c: object): void } } }).__townlet;
    t.game.command({ kind: 'build', type: 'flowerbed', x: 2, y: 2 });
    t.runTicks(2);
  });
  const log = await h(page)(() => (window as unknown as { __townlet: Handle }).__townlet.game.narrator.entries.map((e) => e.text).join('\n'));
  expect(log).toContain('You build a flower bed');
});

test('criterion 2: right-drag turns the view freely, Q snaps a quarter turn', async ({ page }) => {
  await ready(page, 'intro=0&scenario=quiet&seed=1&speed=0');
  const yaw0 = await h(page)(() => (window as unknown as { __townlet: Handle }).__townlet.yaw());
  await page.mouse.move(400, 400);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(460, 400, { steps: 6 });
  await page.mouse.up({ button: 'right' });
  const yaw1 = await h(page)(() => (window as unknown as { __townlet: Handle }).__townlet.yaw());
  expect(Math.abs(yaw1 - yaw0)).toBeGreaterThan(0.2);
  // Not a quarter-turn multiple: free rotation.
  const q = Math.PI / 2;
  expect(Math.abs(((yaw1 - Math.PI / 4) / q) % 1)).toBeGreaterThan(0.05);
  await page.keyboard.press('q');
  // The snap eases in; poll rather than sleep, since a slow frame can stretch the ease.
  await expect
    .poll(async () => {
      const yaw2 = await h(page)(() => (window as unknown as { __townlet: Handle }).__townlet.yaw());
      const k = (yaw2 - Math.PI / 4) / q;
      return Math.abs(k - Math.round(k));
    }, { timeout: 5000 })
    .toBeLessThan(0.05);
});

test('criterion 4: R rotates the ghost, and the built workshop occupies its turned footprint', async ({ page }) => {
  await ready(page, 'intro=0&scenario=quiet&seed=1&speed=0');
  await h(page)(() => (window as unknown as { __townlet: Handle }).__townlet.focus(3, 4));
  await page.waitForTimeout(400);
  await page.getByTestId('open-build').click();
  await page.getByTestId('tool-build-workshop').click();
  const p = await h(page)(() => (window as unknown as { __townlet: Handle }).__townlet.tileScreen(2, 3));
  await page.mouse.move(p.x, p.y);
  await page.keyboard.press('r');
  await page.mouse.move(p.x + 1, p.y);
  await page.mouse.click(p.x + 1, p.y);
  await h(page)(() => (window as unknown as { __townlet: Handle }).__townlet.runTicks(2));
  const b = await h(page)(() => (window as unknown as { __townlet: Handle }).__townlet.game.sim.state.buildings.find((x: { type: string; placedBy: string }) => x.type === 'workshop' && x.placedBy === 'steward'));
  expect(b).toBeTruthy();
  expect(b.rot).toBe(1);
});

test('criterion 5: the build menu is closed by default and its cards show cost and what they give off; the scroll rolls up; decisions pop up', async ({ page }) => {
  await ready(page, 'intro=0&scenario=quiet&seed=1&speed=0');
  await expect(page.getByTestId('build-menu')).toBeHidden();
  await page.getByTestId('open-build').click();
  await expect(page.getByTestId('build-menu')).toBeVisible();
  const card = page.getByTestId('tool-build-bakery');
  await expect(card).toContainText('10 timber');
  await expect(card.getByTestId('gives-off')).toContainText('noise while worked');
  await page.getByTestId('tool-select').click();
  await expect(page.getByTestId('build-menu')).toBeHidden();
  const body = page.locator('.scroll-body');
  const before = (await body.boundingBox())!.height;
  await page.getByTestId('roll').click();
  // The roll is a CSS transition; on a slow software-rendered runner a frame can take longer than
  // the transition, so wait for it to finish rather than measuring once.
  await expect(page.getByTestId('scroll')).toHaveClass(/rolled/);
  await expect.poll(async () => (await body.boundingBox())!.height, { timeout: 5000 }).toBeLessThan(before / 4);
  await page.getByTestId('roll').click();
  await h(page)((t: number) => {
    const x = (window as unknown as { __townlet: Handle }).__townlet;
    x.runTicks(t - x.game.sim.tick);
  }, at(1, 6, 30));
  await page.waitForTimeout(400);
  await expect(page.getByTestId('decision')).toBeVisible();
});

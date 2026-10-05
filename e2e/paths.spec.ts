// Paths criterion 1 (spec 9.3, predeclared 2026-10-05): dragging lays a path, on a desktop and a phone.
import { expect, test, type Page } from '@playwright/test';
import { at } from '../src/sim/time.js';

type Handle = { runTicks(n: number): void; focus(x: number, y: number): void; tileScreen(x: number, y: number): { x: number; y: number }; game: { sim: { tick: number; state: { buildings: Array<{ type: string; removed: boolean; x: number; y: number }> } } } };

async function ready(page: Page): Promise<void> {
  await page.goto('/?intro=0&scenario=quiet&seed=1&speed=0');
  await page.waitForFunction(() => (window as unknown as { __townlet?: unknown }).__townlet !== undefined);
  await page.evaluate((t) => {
    const h = (window as unknown as { __townlet: Handle }).__townlet;
    h.runTicks(t - h.game.sim.tick);
  }, at(1, 10));
  for (let quiet = 0; quiet < 2; ) {
    await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
    const later = page.locator('[data-testid^="later-"], [data-testid="tier-ok"]');
    if ((await later.count()) > 0) {
      await later.first().click();
      quiet = 0;
    } else quiet++;
  }
}

const paths = (page: Page) =>
  page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.game.sim.state.buildings.filter((b) => b.type === 'path' && !b.removed).map((b) => `${b.x},${b.y}`));

/** A free row of tiles to lay along, found from the sim. */
async function freeRow(page: Page): Promise<[number, number][]> {
  return page.evaluate(() => {
    const s = (window as unknown as { __townlet: Handle }).__townlet.game.sim.state;
    const taken = (x: number, y: number) =>
      s.buildings.some((b: any) => {
        if (b.removed) return false;
        const sz = b.type === 'brook' ? [1, 10] : [3, 3];
        return x >= b.x - 1 && x < b.x + sz[0] && y >= b.y - 1 && y < b.y + sz[1];
      });
    for (let y = 2; y < 22; y++)
      for (let x = 2; x < 16; x++) {
        const row: [number, number][] = [];
        for (let k = 0; k < 5; k++) row.push([x + k, y]);
        if (row.every(([a, b]) => !taken(a, b))) return row;
      }
    return [];
  });
}

test.describe('desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('dragging with the Path tool lays a line of path; Remove takes a tile up', async ({ page }) => {
    await ready(page);
    const row = await freeRow(page);
    expect(row.length).toBe(5);
    await page.evaluate(([x, y]) => (window as unknown as { __townlet: Handle }).__townlet.focus(x + 2, y), row[0] as [number, number]);
    await page.waitForTimeout(400);
    await page.getByTestId('open-build').click();
    await page.getByTestId('tool-build-path').click();
    await expect(page.getByTestId('place-bar')).toContainText('lay a path');
    const pts = await page.evaluate((r) => r.map(([x, y]) => (window as unknown as { __townlet: Handle }).__townlet.tileScreen(x, y)), row);
    await page.mouse.move(pts[0]!.x, pts[0]!.y);
    await page.mouse.down();
    for (const p of pts) await page.mouse.move(p.x, p.y, { steps: 4 });
    await page.mouse.up();
    await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.runTicks(1));
    const laid = await paths(page);
    for (const [x, y] of row) expect(laid, `path at ${x},${y}`).toContain(`${x},${y}`);
    await page.getByTestId('place-cancel').click();
    await page.getByTestId('tool-remove').click();
    await page.mouse.click(pts[2]!.x, pts[2]!.y);
    await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.runTicks(1));
    expect(await paths(page)).not.toContain(`${row[2]![0]},${row[2]![1]}`);
  });
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('a finger dragged with the Path tool lays path, and Done stops', async ({ page }) => {
    await ready(page);
    const row = await freeRow(page);
    await page.evaluate(([x, y]) => (window as unknown as { __townlet: Handle }).__townlet.focus(x + 2, y), row[0] as [number, number]);
    await page.waitForTimeout(400);
    await page.getByTestId('nav-build').tap();
    await page.getByTestId('tool-build-path').tap();
    await expect(page.getByTestId('place-cancel')).toHaveText(/Done/);
    const pts = await page.evaluate((r) => r.map(([x, y]) => (window as unknown as { __townlet: Handle }).__townlet.tileScreen(x, y)), row);
    // A touch drag, sent as pointer events (Playwright's touchscreen only taps).
    const canvas = page.locator('#stage canvas');
    await canvas.dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'touch', clientX: pts[0]!.x, clientY: pts[0]!.y, button: 0, isPrimary: true });
    for (const p of pts) await canvas.dispatchEvent('pointermove', { pointerId: 7, pointerType: 'touch', clientX: p.x, clientY: p.y, isPrimary: true });
    await canvas.dispatchEvent('pointerup', { pointerId: 7, pointerType: 'touch', clientX: pts[4]!.x, clientY: pts[4]!.y, button: 0, isPrimary: true });
    await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.runTicks(1));
    const laid = await paths(page);
    for (const [x, y] of row) expect(laid, `path at ${x},${y}`).toContain(`${x},${y}`);
    await page.getByTestId('place-cancel').tap();
    await expect(page.getByTestId('place-bar')).toBeHidden();
  });
});

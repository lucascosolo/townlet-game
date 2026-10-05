// Playtest round 2 criteria 5–7 (spec 9.3, predeclared 2026-10-05): the placement preview, houses
// going dark, and the desktop bottom bar.
import { expect, test, type Page } from '@playwright/test';
import { at } from '../src/sim/time.js';

type Handle = {
  runTicks(n: number): void;
  tileScreen(x: number, y: number): { x: number; y: number };
  focus(x: number, y: number): void;
  game: { sim: { tick: number; state: any } };
  view: any;
};

async function open(page: Page, tick: number): Promise<void> {
  await page.goto('/?intro=0&scenario=quiet&seed=1&speed=0');
  await page.waitForFunction(() => (window as unknown as { __townlet?: unknown }).__townlet !== undefined);
  await page.evaluate((t) => (window as unknown as { __townlet: Handle }).__townlet.runTicks(t - (window as unknown as { __townlet: Handle }).__townlet.game.sim.tick), tick);
  // Put off anything waiting for an answer.
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

test('criterion 5: the placement preview stays on the building footprint', async ({ page }) => {
  await open(page, at(1, 10));
  await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.focus(16, 11));
  await page.getByTestId('open-build').click();
  await page.getByTestId('tool-build-cottage').click();
  const p = await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.tileScreen(16, 11));
  await page.mouse.move(p.x, p.y);
  await expect.poll(() => page.evaluate(() => !!(window as unknown as { __townlet: Handle }).__townlet.view.ghost?.visible)).toBe(true);
  const spill = await page.evaluate(() => {
    const ghost = (window as unknown as { __townlet: Handle }).__townlet.view.ghost;
    ghost.updateMatrixWorld(true);
    const centre = ghost.position;
    let worst = 0;
    ghost.traverse((o: any) => {
      if (!o.isMesh) return;
      for (let a = o; a; a = a.parent) if (!a.visible) return;
      // Measured on the real corners: a rotated roof's bounding box is wider than the roof.
      o.geometry.computeBoundingBox();
      const pos = o.geometry.getAttribute('position');
      const v = o.geometry.boundingBox.min.clone();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        worst = Math.max(worst, centre.x - 1 - v.x, v.x - centre.x - 1, centre.z - 1 - v.z, v.z - centre.z - 1);
      }
    });
    return worst;
  });
  expect(spill).toBeLessThan(0.3);
});

test('criterion 6: a home is dark once everyone in it is asleep, and lit while someone is up', async ({ page }) => {
  const lit = () =>
    page.evaluate(() => {
      const h = (window as unknown as { __townlet: Handle }).__townlet;
      const s = h.game.sim.state;
      const out: Array<{ id: number; lit: boolean; awake: boolean }> = [];
      for (const [id, g] of h.view.buildings as Map<number, any>) {
        const windows = g.userData.windows;
        if (!windows) continue;
        const b = s.buildings.find((x: { id: number }) => x.id === id);
        if (b.type !== 'cottage' && b.type !== 'tent') continue;
        const inside = s.order.map((r: string) => s.residents[r]).filter((r: any) => r.at === id);
        out.push({ id, lit: windows[0].material.color.getHex() !== 0x4a5068, awake: inside.some((r: any) => r.activity?.id !== 'sleep') });
      }
      return out;
    });
  await open(page, at(2, 2));
  await expect.poll(async () => (await lit()).every((h) => h.lit === h.awake)).toBe(true);
  expect((await lit()).some((h) => !h.lit)).toBe(true);
  // Evening: someone is home and awake somewhere, and that home is lit.
  await page.evaluate((t) => (window as unknown as { __townlet: Handle }).__townlet.runTicks(t - (window as unknown as { __townlet: Handle }).__townlet.game.sim.tick), at(2, 20));
  await expect.poll(async () => (await lit()).every((h) => h.lit === h.awake)).toBe(true);
  expect((await lit()).some((h) => h.lit)).toBe(true);
});

for (const width of [1100, 1280, 1920]) {
  test(`criterion 7: the desktop bottom bar is one row at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 860 });
    await open(page, at(1, 10));
    const box = await page.locator('.dock').boundingBox();
    expect(box!.height).toBeLessThanOrEqual(56);
    const status = await page.getByTestId('palette-status').boundingBox();
    expect(status!.height).toBeLessThanOrEqual(24);
    // And the rolled or unrolled journal hangs below the top bar.
    const hud = await page.locator('.hud').boundingBox();
    const scroll = await page.getByTestId('scroll').boundingBox();
    expect(scroll!.y).toBeGreaterThanOrEqual(hud!.y + hud!.height);
  });
}

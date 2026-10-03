// M2 criteria 2-5 (spec 9.3, predeclared 2026-10-03), in a real browser on the production build.
import { expect, test, type Page } from '@playwright/test';
import { fnv } from '../web/src/game.js';
import { runScenario } from '../src/scenarios/index.js';
import type { Command } from '../src/sim/sim.js';
import { at } from '../src/sim/time.js';

type Handle = {
  game: {
    sim: { tick: number; state: any };
    narrator: { entries: Array<{ t: number; kind: string; text: string }> };
    command(c: object): void;
    speedIndex: number;
    stepMs: number;
  };
  stats(): { fps: number; stepMs: number; tick: number; eventHash: number; eventCount: number; commands: Command[] };
  runTicks(n: number): void;
  residentScreen(id: string): { x: number; y: number; visible: boolean } | null;
  buildingScreen(id: number): { x: number; y: number; visible: boolean } | null;
  tileScreen(x: number, y: number): { x: number; y: number; visible: boolean };
  focus(x: number, y: number): void;
};

async function open(page: Page, query: string): Promise<void> {
  await page.goto(`/?intro=0&${query}`);
  await page.waitForFunction(() => (window as unknown as { __townlet?: Handle }).__townlet !== undefined);
}

async function runTo(page: Page, tick: number): Promise<void> {
  await page.evaluate((t) => {
    const h = (window as unknown as { __townlet: Handle }).__townlet;
    h.runTicks(Math.max(0, t - h.game.sim.tick));
  }, tick);
  await page.waitForTimeout(250);
}

/** A proposal that came up along the way is put off, so its popup doesn't cover the town. */
async function putOffDecisions(page: Page): Promise<void> {
  const later = page.locator('[data-testid^="later-"]');
  while ((await later.count()) > 0) {
    await later.first().click();
    await page.waitForTimeout(50);
  }
}

async function logText(page: Page, since = 0): Promise<string> {
  return page.evaluate((s) => (window as unknown as { __townlet: Handle }).__townlet.game.narrator.entries.filter((e) => e.t >= s).map((e) => e.text).join('\n'), since);
}

const RESIDENTS = ['ada', 'bram', 'fen', 'juniper', 'marlow', 'wren'];
const NAMES: Record<string, string> = { ada: 'Ada', bram: 'Bram', fen: 'Fen', juniper: 'Juniper', marlow: 'Marlow', wren: 'Wren' };

test('criterion 3: clicking each resident in the town opens a journal with needs, feelings and a why chain', async ({ page }) => {
  // The bakery scenario as defined, with its considerate stand-in steward.
  await open(page, 'scenario=bakery&seed=1&steward=considerate&speed=0');
  await runTo(page, at(6, 10));
  const relied: string[] = [];
  for (const id of RESIDENTS) {
    let opened = false;
    for (let attempt = 0; attempt < 40 && !opened; attempt++) {
      const pos = await page.evaluate((rid) => {
        const h = (window as unknown as { __townlet: Handle }).__townlet;
        const r = h.game.sim.state.residents[rid];
        // Bring them into view, then ask where they are on screen.
        if (r.at !== null) {
          const b = h.game.sim.state.buildings.find((x: { id: number }) => x.id === r.at);
          h.focus(b.x + 1, b.y + 1);
        } else h.focus(r.x, r.y);
        return null;
      }, id);
      void pos;
      await page.waitForTimeout(300);
      const p = await page.evaluate((rid) => (window as unknown as { __townlet: Handle }).__townlet.residentScreen(rid), id);
      if (!p || !p.visible) {
        await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.runTicks(20));
        continue;
      }
      await page.mouse.click(p.x, p.y);
      const heading = page.getByTestId('journal').locator('h2');
      if ((await heading.count()) > 0 && (await heading.innerText()).startsWith(NAMES[id] as string)) opened = true;
      else await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.runTicks(15));
    }
    expect(opened, `${id} could be clicked`).toBe(true);
    const journal = page.getByTestId('journal');
    await expect(journal.locator('.meter')).toHaveCount(8); // mood, settled, and six needs
    await expect(journal.getByTestId('feelings')).toBeVisible();
    // Settled opinions first; early in the year many are still forming, and those show their
    // why too. Which kind each resident relied on is recorded (spec 9.3, M2 status).
    const settled = journal.getByTestId('opinion');
    const forming = journal.getByTestId('opinion-forming');
    const useSettled = (await settled.count()) > 0;
    if (!useSettled) relied.push(id);
    const opinion = useSettled ? settled.first() : forming.first();
    expect(await opinion.count(), `${id} has an opinion, settled or forming`).toBe(1);
    await opinion.locator('summary').click();
    expect(await opinion.locator('li').count(), `${id}'s opinion has a why`).toBeGreaterThan(0);
  }
  test.info().annotations.push({ type: 'forming-only', description: relied.join(',') || 'none' });
  console.log(`residents with only forming opinions on day 6: ${relied.join(', ') || 'none'}`);
});

test('criterion 4a: approving a proposal from the notice board pleases the proposer and is logged', async ({ page }) => {
  await open(page, 'scenario=quiet&seed=1&speed=0');
  await runTo(page, at(1, 6, 30));
  // The proposal arrives as a popup.
  await expect(page.getByTestId('decision')).toBeVisible();
  const approve = page.locator('[data-testid^="approve-"]').first();
  await expect(approve).toBeVisible();
  const proposer = await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.game.sim.state.story.dilemmas.find((d: { status: string }) => d.status === 'open').proposer as string);
  const before = await page.evaluate((p) => (window as unknown as { __townlet: Handle }).__townlet.game.sim.state.residents[p].rel.steward.affinity as number, proposer);
  const t0 = await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.game.sim.tick);
  await approve.click();
  await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.runTicks(1440));
  const log = await logText(page, t0);
  expect(log).toContain('You approve');
  expect(log).toContain('is delighted');
  const after = await page.evaluate((p) => (window as unknown as { __townlet: Handle }).__townlet.game.sim.state.residents[p].rel.steward.affinity as number, proposer);
  expect(after).toBeGreaterThan(before);
});

test('criterion 4b: placing a hedge from the palette builds it and residents react', async ({ page }) => {
  await open(page, 'scenario=quiet&seed=1&speed=0');
  await runTo(page, at(1, 9));
  await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.focus(5, 7));
  await page.waitForTimeout(300);
  // A proposal popup may be waiting; put it off.
  if (await page.getByTestId('decision').isVisible()) await page.locator('[data-testid^="later-"]').click();
  await page.getByTestId('open-build').click();
  await page.getByTestId('tool-build-hedge').click();
  const p = await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.tileScreen(5, 8));
  const t0 = await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.game.sim.tick);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
  // Residents react once they see it (M2.5): give them an hour.
  await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.runTicks(60));
  const log = await logText(page, t0);
  expect(log).toContain('You build a hedge');
  expect(log).toMatch(/(spots|hears about) the new hedge/);
});

test('criterion 4c: removing a loved place from the palette brings grief', async ({ page }) => {
  await open(page, 'scenario=quiet&seed=1&speed=0');
  await runTo(page, at(8, 10));
  await putOffDecisions(page);
  const target = await page.evaluate(() => {
    const h = (window as unknown as { __townlet: Handle }).__townlet;
    const s = h.game.sim.state;
    // The non-home place with the most attachment across residents.
    let best: { id: number; x: number; y: number; score: number } | null = null;
    for (const b of s.buildings) {
      if (b.removed || ['cottage', 'tent'].includes(b.type)) continue;
      let score = 0;
      for (const id of s.order) for (const bel of Object.values(s.residents[id].beliefs) as Array<{ subject: string; valence: number; strength: number }>) if (bel.subject === `b:${b.id}` && bel.valence > 0) score += bel.strength;
      if (!best || score > best.score) best = { id: b.id, x: b.x, y: b.y, score };
    }
    h.focus(best!.x + 1, best!.y + 1);
    return best!;
  });
  expect(target.score).toBeGreaterThan(0);
  await page.waitForTimeout(300);
  await page.getByTestId('tool-remove').click();
  const p = await page.evaluate((id) => (window as unknown as { __townlet: Handle }).__townlet.buildingScreen(id), target.id);
  const t0 = await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.game.sim.tick);
  await page.mouse.move(p!.x, p!.y);
  await page.mouse.click(p!.x, p!.y);
  // Grief comes when they see it is gone, or hear: give it a day.
  await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.runTicks(1440));
  const removed = await page.evaluate((id) => (window as unknown as { __townlet: Handle }).__townlet.game.sim.state.buildings.find((b: { id: number }) => b.id === id).removed, target.id);
  expect(removed).toBe(true);
  const grieving = await page.evaluate(
    (args: number[]) => {
      const [id, since] = args as [number, number];
      const s = (window as unknown as { __townlet: Handle }).__townlet.game.sim.state;
      return s.order.filter((r: string) => [...s.residents[r].buffer, ...s.residents[r].episodes].some((e: { subject: string; aspect: string; tick: number }) => e.subject === `b:${id}` && e.aspect === 'lost_place' && e.tick >= since)).length;
    },
    [target.id, t0],
  );
  expect(grieving).toBeGreaterThan(0);
  expect(await logText(page, t0)).toContain('taken down');
});

test('criterion 2: the browser sim and the Node sim produce the same events from the same seed and commands', async ({ page }) => {
  await open(page, 'scenario=bakery&seed=3&speed=0');
  await page.evaluate(() => {
    const h = (window as unknown as { __townlet: Handle }).__townlet;
    h.runTicks(1500);
    h.game.command({ kind: 'build', type: 'hedge', x: 4, y: 7 });
    h.runTicks(1500);
    h.game.command({ kind: 'remove', x: 13, y: 9 });
    h.runTicks(2000);
  });
  const stats = await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.stats());
  expect(stats.commands.length).toBe(2);

  const sim = runScenario('bakery', 3, 'none');
  let hash = 0x811c9dc5;
  let count = 0;
  sim.on((e) => {
    hash = fnv(hash, JSON.stringify(e));
    count++;
  });
  sim.schedule(stats.commands);
  sim.runUntil(stats.tick);
  expect(count).toBe(stats.eventCount);
  expect(hash).toBe(stats.eventHash);
});

test('criterion 5: sim stepping at 10x costs under 2 ms per frame', async ({ page }) => {
  await open(page, 'scenario=bakery&seed=1&speed=3');
  await page.waitForTimeout(8000);
  const s = await page.evaluate(() => (window as unknown as { __townlet: Handle }).__townlet.stats());
  test.info().annotations.push({ type: 'perf', description: `stepMs=${s.stepMs.toFixed(3)} fps=${s.fps.toFixed(1)} (software rendering)` });
  console.log(`perf: stepMs=${s.stepMs.toFixed(3)} fps=${s.fps.toFixed(1)}`);
  expect(s.tick).toBeGreaterThan(0);
  expect(s.stepMs).toBeLessThan(2);
});

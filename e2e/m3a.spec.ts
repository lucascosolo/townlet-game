// M3a criterion 5 (spec 9.3, predeclared 2026-10-03), in the browser: the journal shows what is
// on someone's mind and what they are hoping for; friends sit together.
import { expect, test, type Page } from '@playwright/test';
import { at } from '../src/sim/time.js';

type Handle = {
  game: { sim: { tick: number; state: any } };
  runTicks(n: number): void;
  seating(placeId: number): string[];
  residentScreen(id: string): { x: number; y: number; visible: boolean } | null;
  focus(x: number, y: number): void;
};
const W = () => (window as unknown as { __townlet: Handle }).__townlet;

async function ready(page: Page, query: string): Promise<void> {
  await page.goto(`/?${query}`);
  await page.waitForFunction(() => (window as unknown as { __townlet?: Handle }).__townlet !== undefined);
}

async function dismissDecisions(page: Page): Promise<void> {
  const later = page.locator('[data-testid^="later-"]');
  while ((await later.count()) > 0) {
    await later.first().click();
    await page.waitForTimeout(50);
  }
}

test('criterion 5a: the journal shows what is on their mind, and why, and what they hope for next', async ({ page }) => {
  await ready(page, 'intro=0&scenario=bakery&seed=1&steward=considerate&speed=0');
  await page.evaluate((t) => {
    const h = (window as unknown as { __townlet: Handle }).__townlet;
    h.runTicks(t - h.game.sim.tick);
  }, at(3, 11));
  await page.waitForTimeout(200);
  await dismissDecisions(page);
  await page.getByTestId('tab-journal').click();
  for (const id of ['ada', 'bram', 'juniper']) {
    await page.getByTestId(`roster-${id}`).click();
    const journal = page.getByTestId('journal');
    const mind = journal.getByTestId('on-mind');
    await expect(mind).toBeVisible();
    const items = mind.locator('li');
    expect(await items.count()).toBeGreaterThan(0);
    expect(await items.count()).toBeLessThanOrEqual(3);
    // Every item says why it is on their mind.
    for (const text of await items.allInnerTexts()) expect(text).toMatch(/\(.+\)/);
    await expect(journal.getByTestId('hope')).toContainText('Hoping to:');
    await expect(journal.getByTestId('hope-next')).toHaveText(/^(Next: .+|Done!|Decided to (stay|go)\.)$/);
  }
});

test('criterion 5b: friends sit next to each other', async ({ page }) => {
  await ready(page, 'intro=0&scenario=bakery&seed=1&steward=considerate&speed=0');
  await page.evaluate((t) => {
    const h = (window as unknown as { __townlet: Handle }).__townlet;
    h.runTicks(t - h.game.sim.tick);
  }, at(4, 12));
  let found: { place: number; order: string[] } | null = null;
  for (let i = 0; i < 120 && !found; i++) {
    found = await page.evaluate(() => {
      const h = (window as unknown as { __townlet: Handle }).__townlet;
      const s = h.game.sim.state;
      const friends = (a: string, b: string) => s.residents[a].rel[b]?.tags.includes('friend') && s.residents[b].rel[a]?.tags.includes('friend');
      const places = new Set<number>(s.order.map((id: string) => s.residents[id].at).filter((x: number | null) => x !== null));
      for (const place of places) {
        const here = s.order.filter((id: string) => s.residents[id].at === place && s.residents[id].path.length === 0 && s.residents[id].activity?.id !== 'sleep');
        if (here.length < 3) continue;
        const hasStranger = here.some((a: string) => here.some((b: string) => a !== b && !friends(a, b)));
        const hasFriends = here.some((a: string) => here.some((b: string) => a !== b && friends(a, b)));
        if (hasFriends && hasStranger) return { place, order: h.seating(place) };
      }
      h.runTicks(10);
      return null;
    });
  }
  expect(found, 'a mixed group of three or more at one place').not.toBeNull();
  const { order } = found as { place: number; order: string[] };
  const check = await page.evaluate((order) => {
    const s = (window as unknown as { __townlet: Handle }).__townlet.game.sim.state;
    const aff = (a: string, b: string) => s.residents[a].rel[b]?.affinity ?? 0;
    const friends = (a: string, b: string) => s.residents[a].rel[b]?.tags.includes('friend') && s.residents[b].rel[a]?.tags.includes('friend');
    const first = order[0] as string;
    const best = order.slice(1).sort((a, b) => aff(first, b) - aff(first, a))[0];
    const adjacentFriends = order.slice(1).some((id, i) => friends(order[i] as string, id));
    return { firstNextToFavourite: order[1] === best, adjacentFriends };
  }, order);
  expect(check.firstNextToFavourite).toBe(true);
  expect(check.adjacentFriends).toBe(true);
});

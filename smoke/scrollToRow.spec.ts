// Smoke test: selecting an enemy individual on the map scrolls the spawn table to the row of the
// action that spawned it; a selection made from the table itself never scrolls it.
// 15-12 has 30 rows: more than a 900px column or a phone's drawer shows at once, and enough that
// its middle row sits off screen in a 500px column yet can be centered in it.
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  actionKey,
  buildTimeline,
  individualKey,
  matchesEndpoint,
  routeEndpoints,
  spawnTable,
  takeSnapshot,
  type SpawnRow,
} from "../src/timeline/index.ts";
import {
  drawerButton,
  endpointDot,
  enemyOnMap,
  filterCaption,
  phoneWindow,
  seek,
  shortWideWindow,
  siteLevel,
  spawnTableRegion,
  wideWindow,
} from "./levelPage.ts";

/**
 * A row with an enemy of 15-12's first wave, its first individual and a whole second it is on the
 * field. `pick` chooses the row from the wave's rows with an enemy, in table order.
 */
function rowOnField(pick: (rows: SpawnRow[]) => SpawnRow) {
  const level = siteLevel("main_15-12");
  const timeline = buildTimeline(level);
  const row = pick(spawnTable(level).filter((r) => r.waveIndex === 0 && r.enemy));
  const individual = timeline.individuals.find(
    (i) => i.id === individualKey({ ...row, spawnIndex: 0 }),
  )!;
  const t = Array.from({ length: 1000 }, (_, s) => s).find((s) =>
    takeSnapshot(timeline, s).onField.some((e) => e.individual.id === individual.id),
  );
  expect(t, "the row's first individual walks onto the field").toBeDefined();
  return { timeline, row, individual, t: t! };
}

/** 15-12's last row with an enemy. */
const lastRowOnField = () => rowOnField((rows) => rows.at(-1)!);

const rowLocator = (page: Page, action: string) =>
  spawnTableRegion(page).locator(`tr[data-wave="0"][data-action="${action}"]`);
const rowTop = async (page: Page, action: string) =>
  (await rowLocator(page, action).boundingBox())!.y;
/**
 * The row's whole height is inside the window. Its width may not be: on a phone the table is wider
 * than the drawer and scrolls sideways.
 */
const expectShownWhole = (page: Page, row: Locator) =>
  expect
    .poll(async () => {
      const box = (await row.boundingBox())!;
      return box.y >= 0 && box.y + box.height <= page.viewportSize()!.height;
    })
    .toBe(true);

test.describe("wide window", () => {
  test.use({ viewport: wideWindow });

  test("selecting an enemy on the map scrolls its row into view, once", async ({ page }) => {
    const { row, individual, t } = lastRowOnField();
    await page.goto("#/level/main_15-12?v=normal");
    await seek(page, t);
    const selectedRow = rowLocator(page, actionKey(row));
    await expect(selectedRow).not.toBeInViewport();
    await enemyOnMap(page, individual.id).focus();
    const pageScroll = await page.evaluate(() => scrollY);

    await enemyOnMap(page, individual.id).press("Enter");

    await expect(selectedRow).toHaveClass(/\bselected\b/);
    await expectShownWhole(page, selectedRow);
    // The column alone scrolls: the last row comes up without moving the page.
    expect(await page.evaluate(() => scrollY)).toBe(pageScroll);

    // Scrolling the table by hand afterwards is not undone, as the time moves on.
    await spawnTableRegion(page).hover();
    await page.mouse.wheel(0, -5000);
    await expect(selectedRow).not.toBeInViewport();
    await seek(page, t + 1);
    await expect(selectedRow).not.toBeInViewport();
  });

  test("clicking a row that only partly shows does not scroll the table", async ({ page }) => {
    await page.goto("#/level/main_15-12?v=normal");
    await expect(spawnTableRegion(page)).toBeVisible();
    // The row the window's bottom edge cuts through.
    const rows = await spawnTableRegion(page).locator("tr[data-action]").all();
    let cut: { action: string; top: number } | null = null;
    for (const r of rows) {
      const box = (await r.boundingBox())!;
      if (box.y < wideWindow.height && box.y + box.height > wideWindow.height) {
        cut = { action: (await r.getAttribute("data-action"))!, top: box.y };
        break;
      }
    }
    expect(cut, "a row only partly shows at the bottom of the window").not.toBeNull();

    // Click the part that shows: a locator click would scroll the row into view itself.
    await page.mouse.click(wideWindow.width - 200, Math.floor((cut!.top + wideWindow.height) / 2));

    await expect(page.locator("p.selection")).toHaveAttribute("data-selected", `${cut!.action}-0`);
    expect(await rowTop(page, cut!.action)).toBe(cut!.top);
  });

  test("selecting an enemy whose row the 端點篩選 hides keeps the filter", async ({ page }) => {
    const { timeline, row, individual, t } = lastRowOnField();
    const elsewhere = routeEndpoints(timeline).find((e) => !matchesEndpoint(individual, e))!;
    await page.goto("#/level/main_15-12?v=normal");
    await seek(page, t);
    await endpointDot(page, elsewhere).click();
    const caption = filterCaption(page);
    const filter = await caption.getAttribute("data-endpoint-filter");
    const firstRow = spawnTableRegion(page).locator("tr[data-action]").first();
    const firstTop = (await firstRow.boundingBox())!.y;

    await enemyOnMap(page, individual.id).press("Enter");

    await expect(page.locator("p.selection")).toHaveAttribute("data-selected", individual.id);
    await expect(caption).toHaveAttribute("data-endpoint-filter", filter!);
    await expect(rowLocator(page, actionKey(row))).toHaveCount(0);
    expect((await firstRow.boundingBox())!.y).toBe(firstTop);
  });
});

test.describe("short wide window", () => {
  test.use({ viewport: shortWideWindow });

  test("selecting an enemy on the map whose row is off screen puts the row in the column's middle", async ({
    page,
  }) => {
    // The table's middle row: far enough from either end to sit in a 500px column's middle.
    const { row, individual, t } = rowOnField((rows) => rows[Math.floor(rows.length / 2)]!);
    await page.goto("#/level/main_15-12?v=normal");
    await seek(page, t);
    const selectedRow = rowLocator(page, actionKey(row));
    await expect(selectedRow).not.toBeInViewport();
    // Focusing the enemy may scroll the page to it, in a window this short.
    await enemyOnMap(page, individual.id).focus();
    const pageScroll = await page.evaluate(() => scrollY);

    await enemyOnMap(page, individual.id).press("Enter");

    await expect(selectedRow).toHaveClass(/\bselected\b/);
    // The middle of the 捲動範圍: the column's box inside its border.
    const columnMiddle = await page
      .locator("#spawn-table-drawer")
      .evaluate((el) => el.getBoundingClientRect().top + el.clientTop + el.clientHeight / 2);
    await expect
      .poll(async () => {
        const box = (await selectedRow.boundingBox())!;
        return box.y + box.height / 2 - columnMiddle;
      })
      .toBeCloseTo(0, 0);
    expect(await page.evaluate(() => scrollY)).toBe(pageScroll);
  });
});

test.describe("phone window", () => {
  test.use({ viewport: phoneWindow });

  test("selecting an enemy leaves the drawer closed; opening it shows the row", async ({
    page,
  }) => {
    const { row, individual, t } = lastRowOnField();
    await page.goto("#/level/main_15-12?v=normal");
    await seek(page, t);

    await enemyOnMap(page, individual.id).press("Enter");

    await expect(page.locator("p.selection")).toHaveAttribute("data-selected", individual.id);
    await expect(drawerButton(page)).toHaveAttribute("aria-expanded", "false");

    await drawerButton(page).click();

    await expect(drawerButton(page)).toHaveAttribute("aria-expanded", "true");
    await expectShownWhole(page, rowLocator(page, actionKey(row)));
  });
});

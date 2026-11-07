// Smoke test: selecting an enemy individual on the map scrolls the spawn table to the row of the
// action that spawned it; a selection made from the table itself never scrolls it.
// 15-12 has 30 rows: more than a 900px column or a phone's drawer shows at once.
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  cellKey,
  withNames,
  type LevelFile,
  type NameTable,
  type StageIndex,
} from "../src/level/index.ts";
import {
  actionKey,
  buildTimeline,
  individualKey,
  matchesEndpoint,
  routeEndpoints,
  spawnTable,
  takeSnapshot,
} from "../src/timeline/index.ts";
import { phoneWindow, seek, wideWindow } from "./levelPage.ts";

const dist = path.resolve(import.meta.dirname, "..", "dist");
const readSiteJson = <T>(file: string): T =>
  JSON.parse(readFileSync(path.join(dist, file), "utf8")) as T;

function siteLevel(stageId: string) {
  const stage = readSiteJson<StageIndex>("data/index.json")
    .areas.flatMap((a) => a.sections.flatMap((s) => s.stages))
    .find((s) => s.id === stageId);
  expect(stage, `the built site publishes ${stageId}`).toBeDefined();
  const file = readSiteJson<LevelFile>(stage!.variants[0]!.levelFile);
  return withNames(file, readSiteJson<NameTable>("data/names.json"));
}

/** 15-12's last row with an enemy, its first individual and a whole second it is on the field. */
function lastRowOnField() {
  const level = siteLevel("main_15-12");
  const timeline = buildTimeline(level);
  const row = spawnTable(level)
    .reverse()
    .find((r) => r.waveIndex === 0 && r.enemy)!;
  const individual = timeline.individuals.find(
    (i) => i.id === individualKey({ ...row, spawnIndex: 0 }),
  )!;
  const t = Array.from({ length: 1000 }, (_, s) => s).find((s) =>
    takeSnapshot(timeline, s).onField.some((e) => e.individual.id === individual.id),
  );
  expect(t, "the row's first individual walks onto the field").toBeDefined();
  return { timeline, row, individual, t: t! };
}

const spawnTableRegion = (page: Page) => page.getByRole("region", { name: "出兵表" });
const rowLocator = (page: Page, action: string) =>
  spawnTableRegion(page).locator(`tr[data-wave="0"][data-action="${action}"]`);
const enemy = (page: Page, id: string) => page.locator(`svg.map g.enemy[data-individual="${id}"]`);
const drawerButton = (page: Page) => page.getByRole("button", { name: "出兵表" });
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

    await enemy(page, individual.id).press("Enter");

    await expect(selectedRow).toHaveClass(/\bselected\b/);
    await expectShownWhole(page, selectedRow);

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
    await page
      .locator(
        `svg.map [data-endpoint="${elsewhere.kind}"][data-cell="${cellKey(elsewhere.cell)}"]`,
      )
      .click();
    const caption = spawnTableRegion(page).locator("[data-endpoint-filter]");
    const filter = await caption.getAttribute("data-endpoint-filter");
    const firstRow = spawnTableRegion(page).locator("tr[data-action]").first();
    const firstTop = (await firstRow.boundingBox())!.y;

    await enemy(page, individual.id).press("Enter");

    await expect(page.locator("p.selection")).toHaveAttribute("data-selected", individual.id);
    await expect(caption).toHaveAttribute("data-endpoint-filter", filter!);
    await expect(rowLocator(page, actionKey(row))).toHaveCount(0);
    expect((await firstRow.boundingBox())!.y).toBe(firstTop);
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

    await enemy(page, individual.id).press("Enter");

    await expect(page.locator("p.selection")).toHaveAttribute("data-selected", individual.id);
    await expect(drawerButton(page)).toHaveAttribute("aria-expanded", "false");

    await drawerButton(page).click();

    await expect(drawerButton(page)).toHaveAttribute("aria-expanded", "true");
    await expectShownWhole(page, rowLocator(page, actionKey(row)));
  });
});

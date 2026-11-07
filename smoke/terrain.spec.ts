// 地形 on the map: structure icons from the 地形表, and a legend of only what the map has.
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { LevelFile, StageIndex } from "../src/level/index.ts";

const dist = path.resolve(import.meta.dirname, "..", "dist");
const readSiteJson = <T>(file: string): T =>
  JSON.parse(readFileSync(path.join(dist, file), "utf8")) as T;

/** How many cells of the stage's normal variant have `tileKey`. */
function tileCount(stageId: string, tileKey: string): number {
  const stage = readSiteJson<StageIndex>("data/index.json")
    .areas.flatMap((a) => a.sections.flatMap((s) => s.stages))
    .find((s) => s.id === stageId)!;
  const level = readSiteJson<LevelFile>(stage.variants[0]!.levelFile);
  return level.map.tiles.filter((t) => t.tileKey === tileKey).length;
}

const legend = (page: Page) => page.getByRole("list", { name: "圖例" });
const legendItem = (page: Page, name: string) =>
  legend(page)
    .getByRole("listitem")
    .filter({ has: page.getByText(name, { exact: true }) });

test("4-10 draws its 通道 and lists them in the legend, with the game's description on hover", async ({
  page,
}) => {
  const tunnelIns = tileCount("main_04-10", "tile_telin");
  expect(tunnelIns, "4-10 has 通道入口").toBeGreaterThan(0);

  await page.goto("#/level/main_04-10?v=normal");

  await expect(page.locator('svg.map [data-tile-key="tile_telin"]')).toHaveCount(tunnelIns);
  await expect(page.locator('svg.map [data-tile-key="tile_telout"]')).toHaveCount(
    tileCount("main_04-10", "tile_telout"),
  );
  await expect(legendItem(page, "通道出口")).toHaveCount(1);
  await expect(legendItem(page, "侵入點")).toHaveCount(1);
  await expect(legendItem(page, "保護目標")).toHaveCount(1);
  await expect(legend(page).getByText(/^(起點|終點)$/)).toHaveCount(0);

  const tunnelIn = legendItem(page, "通道入口");
  const description = page.getByRole("tooltip").filter({ hasText: "敵方會從此進入通道" });
  await expect(description).toBeHidden();
  await tunnelIn.hover();
  await expect(description).toHaveText("敵方會從此進入通道，從通道出口出現");
  await expect(description).toBeVisible();
});

test("2-10 marks its 醫療符文 cells with 醫 and lists the mark by its full name, with the description on hover", async ({
  page,
}) => {
  const runes = tileCount("main_02-10", "tile_healing");
  expect(runes, "2-10 has 醫療符文").toBeGreaterThan(0);

  await page.goto("#/level/main_02-10?v=normal");

  const cells = page.locator('svg.map [data-tile-key="tile_healing"]');
  await expect(cells).toHaveCount(runes);
  await expect(cells.first()).toHaveText("醫");

  const item = legendItem(page, "醫療符文");
  await expect(item).toHaveCount(1);
  await expect(item).toContainText("醫");
  const description = page.getByRole("tooltip").filter({ hasText: "持續恢復生命" });
  await expect(description).toBeHidden();
  await item.hover();
  await expect(description).toBeVisible();
});

test("3-3 draws its 地穴 and 草叢 as icons named by the 地形表", async ({ page }) => {
  const holes = tileCount("main_03-03", "tile_hole");
  const grass = tileCount("main_03-03", "tile_grass");
  expect(holes, "3-3 has 地穴").toBeGreaterThan(0);
  expect(grass, "3-3 has 草叢").toBeGreaterThan(0);

  await page.goto("#/level/main_03-03?v=normal");

  await expect(page.locator('svg.map [data-tile-key="tile_hole"]')).toHaveCount(holes);
  await expect(page.locator('svg.map [data-tile-key="tile_grass"]')).toHaveCount(grass);
  await expect(legendItem(page, "地穴")).toHaveCount(1);
  await expect(legendItem(page, "草叢")).toHaveCount(1);
  await expect(legend(page).getByText("坑", { exact: true })).toHaveCount(0);
  // 平地 and 高台 have no function, so they stay base colour only.
  await expect(page.locator('svg.map [data-tile-key="tile_road"]')).toHaveCount(0);
  await expect(page.locator('svg.map [data-tile-key="tile_wall"]')).toHaveCount(0);
});

test("1-7 has no 通道, so the legend lists none", async ({ page }) => {
  expect(tileCount("main_01-07", "tile_telin")).toBe(0);

  await page.goto("#/level/main_01-07?v=normal");

  await expect(legendItem(page, "侵入點")).toHaveCount(1);
  await expect(legend(page).getByText(/^通道/)).toHaveCount(0);
  await expect(page.locator('svg.map [data-tile-key="tile_telin"]')).toHaveCount(0);
});

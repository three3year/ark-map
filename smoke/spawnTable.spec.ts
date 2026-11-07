// Smoke test: a click anywhere on a spawn-table row selects it; 切換 only switches the candidate.
// Expected seconds come from the level's spawn table on the same data the site ships.
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { withNames, type LevelFile, type NameTable, type StageIndex } from "../src/level/index.ts";
import { actionKey, spawnTable, type SpawnRow } from "../src/timeline/index.ts";
import { roundTenth } from "../src/ui/playback.ts";
import { seek, timeDisplay } from "./levelPage.ts";

const dist = path.resolve(import.meta.dirname, "..", "dist");
const readSiteJson = <T>(file: string): T =>
  JSON.parse(readFileSync(path.join(dist, file), "utf8")) as T;

function siteRows(stageId: string): SpawnRow[] {
  const stage = readSiteJson<StageIndex>("data/index.json")
    .areas.flatMap((a) => a.sections.flatMap((s) => s.stages))
    .find((s) => s.id === stageId);
  expect(stage, `the built site publishes ${stageId}`).toBeDefined();
  const file = readSiteJson<LevelFile>(stage!.variants[0]!.levelFile);
  return spawnTable(withNames(file, readSiteJson<NameTable>("data/names.json")));
}

const rowOf = (page: Page, row: SpawnRow) =>
  page.locator(`tr[data-wave="${row.waveIndex}"][data-action="${actionKey(row)}"]`);
/** The 次序 cell: a part of the row that is not the enemy name. */
const orderCell = (page: Page, row: SpawnRow) => rowOf(page, row).locator("td").nth(2);
const firstIndividual = (row: SpawnRow) => `${actionKey(row)}-0`;

test("1-7: clicking a row away from the name jumps to its spawn and shows the route", async ({
  page,
}) => {
  const row = siteRows("main_01-07").find((r) => r.waveTime > 0 && r.count > 1)!;
  await page.goto("#/level/main_01-07?v=normal");
  await expect(page.locator("svg.map")).toBeVisible();

  await orderCell(page, row).click();

  await expect(timeDisplay(page)).toHaveText(`${roundTenth(row.waveTime).toFixed(1)} 秒`);
  await expect(page.locator("p.selection")).toHaveAttribute("data-selected", firstIndividual(row));
  await expect(page.locator(`g.path[data-path="${firstIndividual(row)}"]`)).toBeVisible();
  await expect(rowOf(page, row).locator("button.enemy")).toHaveAttribute("aria-pressed", "true");
});

test("1-7: the 路徑 hides before the selected individual spawns and comes back once it is on the field", async ({
  page,
}) => {
  const row = siteRows("main_01-07").find((r) => r.waveTime >= 1)!;
  const individual = firstIndividual(row);
  const path = page.locator(`g.path[data-path="${individual}"]`);
  const legend = page.getByRole("list", { name: "圖例" });
  await page.goto("#/level/main_01-07?v=normal");
  await orderCell(page, row).click();

  await seek(page, 0);

  await expect(path).toHaveCount(0);
  await expect(page.locator("p.selection")).toHaveAttribute("data-selected", individual);
  await expect(page.locator("p.selection")).toContainText("未出現");
  await expect(legend.getByText("路徑", { exact: true })).toBeVisible();

  await seek(page, Math.ceil(row.waveTime) + 0.5);

  await expect(path).toBeVisible();
});

test("1-7: Enter on a row's enemy name jumps to its spawn", async ({ page }) => {
  const row = siteRows("main_01-07").find((r) => r.waveTime > 0)!;
  await page.goto("#/level/main_01-07?v=normal");

  await rowOf(page, row).locator("button.enemy").press("Enter");

  await expect(timeDisplay(page)).toHaveText(`${roundTenth(row.waveTime).toFixed(1)} 秒`);
  await expect(page.locator("p.selection")).toHaveAttribute("data-selected", firstIndividual(row));
});

test("ro2_n_2_6: 切換 switches the candidate and keeps the selection and the time", async ({
  page,
}) => {
  const rows = siteRows("ro2_n_2_6");
  const selectedRow = rows.find((r) => r.waveIndex === 0 && r.waveTime > 0)!;
  const candidate = rows.find((r) => r.random && !r.random.picked)!;
  const at = `${roundTenth(selectedRow.waveTime).toFixed(1)} 秒`;
  await page.goto("#/level/ro2_n_2_6?v=normal");
  await orderCell(page, selectedRow).click();
  await expect(timeDisplay(page)).toHaveText(at);

  await rowOf(page, candidate).locator("button.pick").click();

  await expect(rowOf(page, candidate)).toHaveAttribute("data-picked", "true");
  await expect(timeDisplay(page)).toHaveText(at);
  await expect(page.getByRole("radio", { name: "第 1 波" })).toBeChecked();
  await expect(page.locator("p.selection")).toHaveAttribute(
    "data-selected",
    firstIndividual(selectedRow),
  );
});

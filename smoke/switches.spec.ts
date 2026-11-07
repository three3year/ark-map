// Smoke test: 隱藏組, 隨機出兵組 and 條件出兵 switches drive the snapshot; the URL never carries them.
// Expected counts come from 基準時間軸 run on the same data the site ships.
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  cellKey,
  withNames,
  type Level,
  type LevelFile,
  type NameTable,
  type StageIndex,
} from "../src/level/index.ts";
import {
  buildTimeline,
  endpointRows,
  routeEndpoints,
  spawnTable,
  takeSnapshot,
  type EndpointKind,
  type TimelineOptions,
} from "../src/timeline/index.ts";
import {
  conditionalSwitch,
  openLink,
  seek,
  selectWave,
  setConditionalSecond,
  timeDisplay,
} from "./levelPage.ts";

const dist = path.resolve(import.meta.dirname, "..", "dist");
const readSiteJson = <T>(file: string): T =>
  JSON.parse(readFileSync(path.join(dist, file), "utf8")) as T;
const readSiteLevel = (file: string) =>
  withNames(readSiteJson<LevelFile>(file), readSiteJson<NameTable>("data/names.json"));

function siteLevel(stageId: string): Level {
  const stage = readSiteJson<StageIndex>("data/index.json")
    .areas.flatMap((a) => a.sections.flatMap((s) => s.stages))
    .find((s) => s.id === stageId);
  expect(stage, `the built site publishes ${stageId}`).toBeDefined();
  return readSiteLevel(stage!.variants[0]!.levelFile);
}

const onField = (level: Level, t: number, options: TimelineOptions) =>
  takeSnapshot(buildTimeline(level, options), t).counts.onField;

test("15-13: switching hidden group1 on adds its enemies and leaves the URL alone", async ({
  page,
}) => {
  const level = siteLevel("main_15-12");
  const withGroup1 = { switches: { hiddenOn: ["group1", "group2"] } };
  const t = Array.from({ length: 400 }, (_, i) => i).find(
    (s) => onField(level, s, {}) !== onField(level, s, withGroup1),
  );
  expect(t, "group1 changes the count at some second").toBeDefined();

  await page.goto("#/level/main_15-12?v=normal");
  await seek(page, t!);
  const group1 = page.locator('input[data-hidden-group="group1"]');
  await expect(group1).not.toBeChecked();
  await expect(page.locator('input[data-hidden-group="group2"]')).toBeChecked();
  await expect(page.locator("svg.map g.enemy")).toHaveCount(onField(level, t!, {}));
  await expect(page.locator('tr[data-hidden-group="group1"]')).toHaveCount(0);
  const url = page.url();

  await group1.check();

  await expect(page.locator("svg.map g.enemy")).toHaveCount(onField(level, t!, withGroup1));
  await expect(page.locator('tr[data-hidden-group="group1"]')).toHaveCount(3);
  expect(page.url()).toBe(url);

  // Editing only the URL's other parameters leaves the page as it is.
  await page.evaluate(() => (location.hash = "#/level/main_15-12?v=normal&h=group2"));
  await expect(timeDisplay(page)).toHaveText(`${t!.toFixed(1)} 秒`);
  await expect(group1).toBeChecked();

  // An old link's switches are ignored: the page opens at 0 s with the variant's default.
  await openLink(page, "#/level/main_15-12?v=normal&h=group1&h=group2");
  await expect(timeDisplay(page)).toHaveText("0.0 秒");
  await expect(group1).not.toBeChecked();
  await expect(page.locator("svg.map g.enemy")).toHaveCount(onField(level, 0, {}));
  await expect(page).toHaveURL(/#\/level\/main_15-12\?v=normal&h=group1&h=group2$/);
});

test("15-13: 出生點 and 消失點 dots follow hidden group1, in both views", async ({ page }) => {
  const level = siteLevel("main_15-12");
  const dotCount = (options: TimelineOptions) =>
    routeEndpoints(buildTimeline(level, options)).length;
  const dots = page.locator("svg.map g.endpoint");
  const group1Spawn = page.locator('svg.map [data-endpoint="spawn"][data-cell="3,8"]');

  await page.goto("#/level/main_15-12?v=normal");
  await expect(dots).toHaveCount(dotCount({}));
  await expect(group1Spawn).toHaveCount(0);
  const legend = page.getByRole("list", { name: "圖例" });
  await expect(legend.getByText("出生點", { exact: true })).toBeVisible();
  await expect(legend.getByText("消失點", { exact: true })).toBeVisible();

  await page.locator('input[data-hidden-group="group1"]').check();
  await expect(dots).toHaveCount(dotCount({ switches: { hiddenOn: ["group1", "group2"] } }));
  await expect(group1Spawn).toHaveAttribute("aria-label", "出生點(3, 8)");

  for (const view of ["平面俯視", "傾斜視角"]) {
    await page.getByRole("button", { name: view }).click();
    await expect(group1Spawn).toBeVisible();
  }
});

test("ro2_n_2_6: picking a thief in the spawn table spawns it", async ({ page }) => {
  const level = siteLevel("ro2_n_2_6");
  const t = 5;
  expect(onField(level, t, { waveIndex: 1 }), "the default pick spawns nothing").toBe(0);

  await page.goto("#/level/ro2_n_2_6?v=normal");
  await selectWave(page, 1);
  await expect(page.locator('tr[data-random="0-0"]')).toHaveAttribute("data-picked", "true");
  await expect(page.locator("svg.map g.enemy")).toHaveCount(0);
  const url = page.url();

  await page.locator('tr[data-random="0-1"] button.pick').click();
  // The default pick leaves the wave empty, so the time slider only reaches 5 s from here.
  await seek(page, t);

  await expect(page.locator('tr[data-random="0-1"]')).toHaveAttribute("data-picked", "true");
  expect(page.url()).toBe(url);
  await expect(page.locator('select[data-random-group="0"]')).toHaveValue("1");
  const expected = onField(level, t, { waveIndex: 1, switches: { picks: { 0: 1 } } });
  expect(expected).toBe(1);
  await expect(page.locator("svg.map g.enemy")).toHaveCount(expected);
});

test("11-7: a 條件出兵 switched on spawns at its second and shows its path", async ({ page }) => {
  const level = siteLevel("main_11-06");
  const t = 30;
  const at = (seconds: number) => ({ switches: { conditional: { 0: { wave: 0, t: seconds } } } });

  await page.goto("#/level/main_11-06?v=normal");
  await seek(page, t);
  const conditional = conditionalSwitch(page, 0);
  await expect(conditional).not.toBeChecked();
  await expect(page.locator("svg.map g.enemy")).toHaveCount(onField(level, t, {}));
  const url = page.url();

  await conditional.check();

  await expect(page.locator("svg.map g.enemy")).toHaveCount(onField(level, t, at(t)));
  await expect(page.locator('tr[data-conditional="0"]')).toHaveCount(1);
  await page.locator('g.enemy[data-individual="b0-0-0-0"]').click();
  await expect(page.locator('g.path[data-path="b0-0-0-0"]')).toBeVisible();
  expect(page.url()).toBe(url);

  // A later trigger second: the enemy has not spawned yet at 30 s.
  await setConditionalSecond(page, 0, 40);
  await expect(page.locator("svg.map g.enemy")).toHaveCount(onField(level, t, at(40)));
  expect(page.url()).toBe(url);

  // An old link's 條件出兵 is ignored: the page opens at 0 s with every 條件出兵 off.
  await openLink(page, "#/level/main_11-06?v=normal&c=0-40");
  await expect(timeDisplay(page)).toHaveText("0.0 秒");
  await expect(conditional).not.toBeChecked();
  await expect(page.locator("svg.map g.enemy")).toHaveCount(onField(level, 0, {}));
});

test("5-10: a device-only 條件出兵 is listed without a switch", async ({ page }) => {
  await page.goto("#/level/main_05-10?v=normal");
  await expect(page.locator("[data-device-only]")).toHaveCount(1);
  await expect(page.locator("[data-device-only]")).toContainText("faust_ballis");
  await expect(page.locator("[data-conditional] input")).toHaveCount(0);
});

test("DP-1: a 條件出兵's own 隱藏組 and 隨機出兵組 switch from the panel", async ({ page }) => {
  const level = siteLevel("act1dp_01");
  const triggeredAt10 = { 0: { wave: 0, t: 10 } };
  const t = 11;
  const groupOn = { switches: { conditional: triggeredAt10, hiddenOn: ["random"] } };
  const picked = { switches: { ...groupOn.switches, picks: { 0: 0 } } };
  expect(
    onField(level, t, { switches: { conditional: triggeredAt10 } }),
    "the group is off by default",
  ).toBe(0);
  expect(onField(level, t, groupOn)).toBe(1);
  expect(onField(level, t, picked)).toBe(1);

  await page.goto("#/level/act1dp_01?v=normal");
  await expect(page.locator("svg.map")).toBeVisible();
  const url = page.url();
  // Switch the 條件出兵 on (at 0 s) and move its trigger to 10 s.
  const conditional = conditionalSwitch(page, 0);
  await conditional.check();
  await setConditionalSecond(page, 0, 10);
  const group = page.locator('input[data-hidden-group="random"]');
  await expect(group).not.toBeChecked();
  await expect(page.locator("svg.map g.enemy")).toHaveCount(0);

  await group.check();
  // With the group off the wave is empty, so the time slider only reaches 11 s from here.
  await seek(page, t);

  await expect(page.locator("svg.map g.enemy")).toHaveCount(1);
  await expect(page.locator('select[data-random-group="0"]')).toHaveValue("3");

  await page.locator('select[data-random-group="0"]').selectOption("0");

  await expect(page.locator('tr[data-random="0-0"]')).toHaveAttribute("data-picked", "true");
  const enemy = page.locator("svg.map g.enemy");
  await expect(enemy).toHaveAttribute("data-enemy", "enemy_1007_slime_2");
  expect(page.url()).toBe(url);

  // An old link's switches are ignored: the page opens at 0 s with the variant's default.
  await openLink(page, "#/level/act1dp_01?v=normal&c=0-10&h=random&r=0-0");
  await expect(timeDisplay(page)).toHaveText("0.0 秒");
  await expect(conditional).not.toBeChecked();
  await expect(enemy).toHaveCount(onField(level, 0, {}));
});

/** How many rows the 端點篩選 on `kind` at `cell` ("row,col") leaves in wave `waveIndex`. */
function filteredCount(
  level: Level,
  kind: EndpointKind,
  cell: string,
  options: TimelineOptions = {},
): number {
  const waveIndex = options.waveIndex ?? 0;
  const endpoint = routeEndpoints(buildTimeline(level, options)).find(
    (e) => e.kind === kind && cellKey(e.cell) === cell,
  );
  expect(endpoint, `wave ${waveIndex} has a ${kind} at ${cell}`).toBeDefined();
  return endpointRows(spawnTable(level, options), waveIndex, endpoint!).length;
}

const tableRows = (page: Page) =>
  page.getByRole("region", { name: "出兵表" }).locator("tr[data-action]");
const filterCaption = (page: Page) => page.locator("[data-endpoint-filter]");

test("15-13: a 出生點 or 消失點 filters the spawn table; again, 清除 or a switch clears it", async ({
  page,
}) => {
  const level = siteLevel("main_15-12");
  const allRows = spawnTable(level).length;
  const withGroup1 = { switches: { hiddenOn: ["group1", "group2"] } };

  await page.goto("#/level/main_15-12?v=normal");
  await expect(tableRows(page)).toHaveCount(allRows);
  await expect(filterCaption(page)).toHaveCount(0);

  const spawn = page.getByRole("button", { name: "出生點(3, 0)" });
  await spawn.click();
  await expect(spawn).toHaveAttribute("aria-pressed", "true");
  await expect(tableRows(page)).toHaveCount(filteredCount(level, "spawn", "3,0"));
  await expect(filterCaption(page)).toContainText("出生點(3, 0)");

  // A row of the filtered table still jumps to its spawn.
  const row = tableRows(page).nth(1);
  const individual = `${await row.getAttribute("data-action")}-0`;
  await row.click();
  await expect(page.locator(`g.path[data-path="${individual}"]`)).toBeVisible();
  await expect(tableRows(page)).toHaveCount(filteredCount(level, "spawn", "3,0"));

  // Another dot, from the keyboard: its filter replaces the first.
  const exit = page.getByRole("button", { name: "消失點(5, 5)" });
  await exit.focus();
  await page.keyboard.press("Enter");
  await expect(spawn).toHaveAttribute("aria-pressed", "false");
  await expect(tableRows(page)).toHaveCount(filteredCount(level, "exit", "5,5"));
  await expect(filterCaption(page)).toContainText("消失點(5, 5)");

  // The same dot again clears it.
  await exit.click();
  await expect(tableRows(page)).toHaveCount(allRows);
  await expect(filterCaption(page)).toHaveCount(0);

  // So does 清除.
  await spawn.click();
  await expect(tableRows(page)).toHaveCount(filteredCount(level, "spawn", "3,0"));
  await page.getByRole("button", { name: "清除", exact: true }).click();
  await expect(tableRows(page)).toHaveCount(allRows);
  await expect(filterCaption(page)).toHaveCount(0);

  // A switch that keeps the dot updates the rows; one that removes it clears the filter.
  await page.getByRole("button", { name: "出生點(5, 1)" }).click();
  const group1 = page.locator('input[data-hidden-group="group1"]');
  await group1.check();
  await expect(tableRows(page)).toHaveCount(filteredCount(level, "spawn", "5,1", withGroup1));
  await page.getByRole("button", { name: "出生點(3, 8)" }).click();
  await expect(tableRows(page)).toHaveCount(filteredCount(level, "spawn", "3,8", withGroup1));
  await group1.uncheck();
  await expect(filterCaption(page)).toHaveCount(0);
  await expect(tableRows(page)).toHaveCount(allRows);
  // Switching the group back on does not bring the filter back.
  await group1.check();
  await expect(filterCaption(page)).toHaveCount(0);
});

test("ro2_n_2_6: switching 波次 clears the 端點篩選", async ({ page }) => {
  const level = siteLevel("ro2_n_2_6");
  const allRows = spawnTable(level).length;

  await page.goto("#/level/ro2_n_2_6?v=normal");
  await page.getByRole("button", { name: "出生點(5, 6)" }).click();
  await expect(tableRows(page)).toHaveCount(filteredCount(level, "spawn", "5,6"));
  await expect(tableRows(page).and(page.locator('[data-wave="1"]'))).toHaveCount(0);

  await selectWave(page, 1);
  await expect(filterCaption(page)).toHaveCount(0);
  await expect(tableRows(page)).toHaveCount(allRows);

  // Back on the first wave the filter stays cleared.
  await selectWave(page, 0);
  await expect(filterCaption(page)).toHaveCount(0);
});

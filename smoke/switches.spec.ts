// Smoke test: 隱藏組 and 隨機出兵組 switches drive the snapshot and live in the URL.
// Expected counts come from 基準時間軸 run on the same data the site ships.
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  withNames,
  type Level,
  type LevelFile,
  type NameTable,
  type StageIndex,
} from "../src/level/index.ts";
import { buildTimeline, takeSnapshot, type TimelineOptions } from "../src/timeline/index.ts";

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

test("15-13: switching hidden group1 on adds its enemies and writes the URL", async ({ page }) => {
  const level = siteLevel("main_15-12");
  const withGroup1 = { switches: { hiddenOn: ["group1", "group2"] } };
  const t = Array.from({ length: 400 }, (_, i) => i).find(
    (s) => onField(level, s, {}) !== onField(level, s, withGroup1),
  );
  expect(t, "group1 changes the count at some second").toBeDefined();

  await page.goto(`#/level/main_15-12?t=${t}`);
  const group1 = page.locator('input[data-hidden-group="group1"]');
  await expect(group1).not.toBeChecked();
  await expect(page.locator('input[data-hidden-group="group2"]')).toBeChecked();
  await expect(page.locator("svg.map g.enemy")).toHaveCount(onField(level, t!, {}));
  await expect(page.locator('tr[data-hidden-group="group1"]')).toHaveCount(0);

  await group1.check();

  await expect(page).toHaveURL(/h=group1&h=group2/);
  await expect(page.locator("svg.map g.enemy")).toHaveCount(onField(level, t!, withGroup1));
  await expect(page.locator('tr[data-hidden-group="group1"]')).toHaveCount(3);

  // The URL alone reproduces the state.
  await page.goto(`#/level/main_15-12?t=${t}&h=group1&h=group2`);
  await expect(page.locator("svg.map g.enemy")).toHaveCount(onField(level, t!, withGroup1));
});

test("ro2_n_2_6: picking a thief in the spawn table spawns it", async ({ page }) => {
  const level = siteLevel("ro2_n_2_6");
  const t = 5;
  expect(onField(level, t, { waveIndex: 1 }), "the default pick spawns nothing").toBe(0);

  await page.goto(`#/level/ro2_n_2_6?w=1&t=${t}`);
  await expect(page.locator('tr[data-random="0-0"]')).toHaveAttribute("data-picked", "true");
  await expect(page.locator("svg.map g.enemy")).toHaveCount(0);

  await page.locator('tr[data-random="0-1"] button.pick').click();

  await expect(page).toHaveURL(/r=0-1/);
  await expect(page.locator('tr[data-random="0-1"]')).toHaveAttribute("data-picked", "true");
  await expect(page.locator('select[data-random-group="0"]')).toHaveValue("1");
  const expected = onField(level, t, { waveIndex: 1, switches: { picks: { 0: 1 } } });
  expect(expected).toBe(1);
  await expect(page.locator("svg.map g.enemy")).toHaveCount(expected);
});

test("11-7: a 條件出兵 switched on spawns at its second and shows its path", async ({ page }) => {
  const level = siteLevel("main_11-06");
  const t = 30;
  const at = (seconds: number) => ({ switches: { conditional: { 0: { wave: 0, t: seconds } } } });

  await page.goto(`#/level/main_11-06?t=${t}`);
  const toggle = page.locator('[data-conditional="0"] input[type="checkbox"]');
  await expect(toggle).not.toBeChecked();
  await expect(page.locator("svg.map g.enemy")).toHaveCount(onField(level, t, {}));

  await toggle.check();

  await expect(page).toHaveURL(/c=0-30(&|$)/);
  await expect(page.locator("svg.map g.enemy")).toHaveCount(onField(level, t, at(t)));
  await expect(page.locator('tr[data-conditional="0"]')).toHaveCount(1);
  await page.locator('g.enemy[data-individual="b0-0-0-0"]').click();
  await expect(page.locator('g.path[data-path="b0-0-0-0"]')).toBeVisible();

  // A later trigger second: the enemy has not spawned yet at 30 s.
  await page.locator('[data-conditional="0"] input[type="number"]').fill("40");
  await page.locator('[data-conditional="0"] input[type="number"]').press("Enter");
  await expect(page).toHaveURL(/c=0-40(&|$)/);
  await expect(page.locator("svg.map g.enemy")).toHaveCount(onField(level, t, at(40)));

  // The URL alone reproduces the state.
  await page.goto(`#/level/main_11-06?t=45&c=0-40`);
  await expect(page.locator('[data-conditional="0"] input[type="checkbox"]')).toBeChecked();
  await expect(page.locator("svg.map g.enemy")).toHaveCount(onField(level, 45, at(40)));
});

test("5-10: a device-only 條件出兵 is listed without a switch", async ({ page }) => {
  await page.goto("#/level/main_05-10?t=0");
  await expect(page.locator("[data-device-only]")).toHaveCount(1);
  await expect(page.locator("[data-device-only]")).toContainText("faust_ballis");
  await expect(page.locator("[data-conditional] input")).toHaveCount(0);
});

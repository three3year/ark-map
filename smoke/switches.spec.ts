// Smoke test: 隱藏組 and 隨機出兵組 switches drive the snapshot and live in the URL.
// Expected counts come from 基準時間軸 run on the same data the site ships.
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { Level, StageIndex } from "../src/level/index.ts";
import { buildTimeline, takeSnapshot, type TimelineOptions } from "../src/timeline/index.ts";

const dist = path.resolve(import.meta.dirname, "..", "dist");
const readSiteJson = <T>(file: string): T =>
  JSON.parse(readFileSync(path.join(dist, file), "utf8")) as T;

function siteLevel(stageId: string): Level {
  const stage = readSiteJson<StageIndex>("data/index.json")
    .areas.flatMap((a) => a.sections.flatMap((s) => s.stages))
    .find((s) => s.id === stageId);
  expect(stage, `the built site publishes ${stageId}`).toBeDefined();
  return readSiteJson<Level>(stage!.variants[0]!.levelFile);
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

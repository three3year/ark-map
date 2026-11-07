// Smoke test: 隱藏組, 隨機出兵組 and 條件出兵 switches drive the snapshot; the URL never carries them.
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
import { openLink, seek, selectWave, timeDisplay } from "./levelPage.ts";

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
  const toggle = page.locator('[data-conditional="0"] input[type="checkbox"]');
  await expect(toggle).not.toBeChecked();
  await expect(page.locator("svg.map g.enemy")).toHaveCount(onField(level, t, {}));
  const url = page.url();

  await toggle.check();

  await expect(page.locator("svg.map g.enemy")).toHaveCount(onField(level, t, at(t)));
  await expect(page.locator('tr[data-conditional="0"]')).toHaveCount(1);
  await page.locator('g.enemy[data-individual="b0-0-0-0"]').click();
  await expect(page.locator('g.path[data-path="b0-0-0-0"]')).toBeVisible();
  expect(page.url()).toBe(url);

  // A later trigger second: the enemy has not spawned yet at 30 s.
  await page.locator('[data-conditional="0"] input[type="number"]').fill("40");
  await page.locator('[data-conditional="0"] input[type="number"]').press("Enter");
  await expect(page.locator("svg.map g.enemy")).toHaveCount(onField(level, t, at(40)));
  expect(page.url()).toBe(url);

  // An old link's 條件出兵 is ignored: the page opens at 0 s with every 條件出兵 off.
  await openLink(page, "#/level/main_11-06?v=normal&c=0-40");
  await expect(timeDisplay(page)).toHaveText("0.0 秒");
  await expect(toggle).not.toBeChecked();
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
  const conditional = { 0: { wave: 0, t: 10 } };
  const t = 11;
  const groupOn = { switches: { conditional, hiddenOn: ["random"] } };
  const picked = { switches: { ...groupOn.switches, picks: { 0: 0 } } };
  expect(onField(level, t, { switches: { conditional } }), "the group is off by default").toBe(0);
  expect(onField(level, t, groupOn)).toBe(1);
  expect(onField(level, t, picked)).toBe(1);

  await page.goto("#/level/act1dp_01?v=normal");
  await expect(page.locator("svg.map")).toBeVisible();
  const url = page.url();
  // Switch the 條件出兵 on (at 0 s) and move its trigger to 10 s.
  const toggle = page.locator('[data-conditional="0"] input[type="checkbox"]');
  await toggle.check();
  const second = page.locator('[data-conditional="0"] input[type="number"]');
  await second.fill("10");
  await second.press("Enter");
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
  await expect(toggle).not.toBeChecked();
  await expect(enemy).toHaveCount(onField(level, 0, {}));
});

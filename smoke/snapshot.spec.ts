// Smoke test against the built site (dist/), served under a sub-path like GitHub Pages.
// The expected count comes from 基準時間軸 run on the same data the site ships.
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { withNames, type LevelFile, type NameTable, type StageIndex } from "../src/level/index.ts";
import { buildTimeline, spawnTable, takeSnapshot } from "../src/timeline/index.ts";
import { seek, selectWave, timeDisplay } from "./levelPage.ts";

const dist = path.resolve(import.meta.dirname, "..", "dist");
const readSiteJson = <T>(file: string): T =>
  JSON.parse(readFileSync(path.join(dist, file), "utf8")) as T;
const readSiteLevel = (file: string) =>
  withNames(readSiteJson<LevelFile>(file), readSiteJson<NameTable>("data/names.json"));

function siteStage(id: string) {
  const stage = readSiteJson<StageIndex>("data/index.json")
    .areas.flatMap((a) => a.sections.flatMap((s) => s.stages))
    .find((s) => s.id === id);
  expect(stage, `the built site publishes ${id}`).toBeDefined();
  return stage!;
}

test("1-7 at 35 s shows as many enemy individuals as the timeline has on field", async ({
  page,
}) => {
  const stage = siteStage("main_01-07");
  const level = readSiteLevel(stage.variants[0]!.levelFile);
  const expected = takeSnapshot(buildTimeline(level), 35).counts.onField;
  expect(expected, "1-7 has enemies on field at 35 s").toBeGreaterThan(0);

  await page.goto("#/level/main_01-07?v=normal");
  await seek(page, 35);

  await expect(page.locator("svg.map g.enemy")).toHaveCount(expected);
});

test("4-4 challenge runs its 難度修正 move speed and lists its modifiers", async ({ page }) => {
  const stage = siteStage("main_04-04");
  const level = readSiteLevel(stage.variants[0]!.levelFile);
  const normal = buildTimeline(level);
  const challenge = buildTimeline(level, { difficulty: "FOUR_STAR" });
  // The first whole second at which the two variants have different counts on field.
  const onField = (timeline: typeof normal, t: number) => takeSnapshot(timeline, t).counts.onField;
  const t = Array.from({ length: 300 }, (_, i) => i).find(
    (s) => onField(normal, s) !== onField(challenge, s),
  );
  expect(t, "challenge and normal differ at some second").toBeDefined();

  await page.goto("#/level/main_04-04?v=challenge");
  await seek(page, t!);

  await expect(page.locator("svg.map g.enemy")).toHaveCount(onField(challenge, t!));
  const moveModifier = page.locator('[data-modifier="ebuff_attribute"]');
  await expect(moveModifier).toContainText("移速");
  await expect(moveModifier).toContainText("計入移速");
  await expect(page.locator(".level-info dd")).toHaveCount(4);
});

test("playback leaves the URL alone", async ({ page }) => {
  await page.goto("#/level/main_01-07?v=normal");
  await expect(page.locator("svg.map")).toBeVisible();
  const url = page.url();

  await page.getByRole("button", { name: "播放", exact: true }).click();

  await expect(timeDisplay(page)).not.toHaveText(/^0\.0 /);
  expect(page.url()).toBe(url);
});

test("seeking, picking a wave and jumping from the spawn table leave the URL alone", async ({
  page,
}) => {
  const level = readSiteLevel(siteStage("ro2_n_2_6").variants[0]!.levelFile);
  const firstRow = spawnTable(level).find((r) => r.waveIndex === 0)!;
  await page.goto("#/level/ro2_n_2_6?v=normal");
  await expect(page.locator("svg.map")).toBeVisible();
  const url = page.url();

  await seek(page, 5);
  await selectWave(page, 1);
  await expect(timeDisplay(page)).toHaveText("0.0 秒");
  await page.locator('tr[data-wave="0"] button.enemy').first().click();

  await expect(page.getByRole("radio", { name: "第 1 波" })).toBeChecked();
  const jumpedTo = Math.round(firstRow.waveTime * 10) / 10;
  await expect(timeDisplay(page)).toHaveText(`${jumpedTo.toFixed(1)} 秒`);
  expect(page.url()).toBe(url);
});

// Smoke test against the built site (dist/), served under a sub-path like GitHub Pages.
// The expected count comes from 基準時間軸 run on the same data the site ships.
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { withNames, type LevelFile, type NameTable, type StageIndex } from "../src/level/index.ts";
import { buildTimeline, spawnTable, takeSnapshot } from "../src/timeline/index.ts";
import { roundTenth } from "../src/ui/playback.ts";
import {
  conditionalSwitch,
  expectDefaultSwitches,
  expectVariantShown,
  seek,
  selectWave,
  timeDisplay,
} from "./levelPage.ts";

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
  const jumpedTo = roundTenth(firstRow.waveTime);
  await expect(timeDisplay(page)).toHaveText(`${jumpedTo.toFixed(1)} 秒`);
  expect(page.url()).toBe(url);
});

test("switching to a variant with its own level file keeps the time and resets the switches", async ({
  page,
}) => {
  const variants = siteStage("main_11-06").variants;
  const tough = variants.find((v) => v.id === "tough")!;
  expect(tough.levelFile, "磨難 has its own level file").not.toBe(variants[0]!.levelFile);
  expect(readSiteLevel(tough.levelFile).branches, "磨難 has a 條件出兵").not.toHaveLength(0);
  await page.goto("#/level/main_11-06?v=normal");
  await seek(page, 30);
  const conditional = conditionalSwitch(page, 0);
  await conditional.check();

  await page.locator('button[data-variant="tough"]').click();

  await expect(page).toHaveURL(/#\/level\/main_11-06\?v=tough$/);
  await expectVariantShown(page, "tough");
  await expect(timeDisplay(page)).toHaveText("30.0 秒");
  // 條件出兵 are off by default in every variant.
  await expect(conditional).not.toBeChecked();
});

test("switching between variants that share a level file resets the switches", async ({ page }) => {
  await page.goto("#/level/main_11-06?v=normal");
  await seek(page, 30);
  const conditional = conditionalSwitch(page, 0);
  await conditional.check();

  await page.locator('button[data-variant="easy"]').click();

  await expect(page).toHaveURL(/#\/level\/main_11-06\?v=easy$/);
  await expect(timeDisplay(page)).toHaveText("30.0 秒");
  await expect(conditional).not.toBeChecked();
});

test("an old link's wave and seconds are ignored", async ({ page }) => {
  const variant = siteStage("ro2_n_2_6").variants[0]!;
  const level = readSiteLevel(variant.levelFile);
  const atStart = takeSnapshot(buildTimeline(level, { difficulty: variant.difficulty }), 0);

  await page.goto("#/level/ro2_n_2_6?v=normal&w=1&t=5");

  await expect(page.locator("svg.map")).toBeVisible();
  await expect(page.getByRole("radio", { name: "第 1 波" })).toBeChecked();
  await expect(timeDisplay(page)).toHaveText("0.0 秒");
  await expectDefaultSwitches(page, level, variant.difficulty);
  await expect(page.locator("svg.map g.enemy")).toHaveCount(atStart.counts.onField);
  await expect(page).toHaveURL(/#\/level\/ro2_n_2_6\?v=normal&w=1&t=5$/);
});

test("entering a stage starts at wave 1, 0 s; changing only the variant keeps the time", async ({
  page,
}) => {
  await page.goto("#/level/main_11-06?v=normal");
  await seek(page, 30);

  // Back to the stage list and into the same stage again.
  await page.locator("nav a").click();
  await page.locator('a[data-stage="main_11-06"]').click();
  await expect(timeDisplay(page)).toHaveText("0.0 秒");

  // Editing the URL to another variant keeps the time; to another stage starts over.
  await seek(page, 30);
  await page.evaluate(() => (location.hash = "#/level/main_11-06?v=easy"));
  await expectVariantShown(page, "easy");
  await expect(timeDisplay(page)).toHaveText("30.0 秒");
  await page.evaluate(() => (location.hash = "#/level/main_01-07?v=normal"));
  await expect(page.locator("h2")).toContainText("1-7");
  await expect(timeDisplay(page)).toHaveText("0.0 秒");

  // The browser's back button to 11-6 starts over too.
  await seek(page, 30);
  await page.goBack();
  await expectVariantShown(page, "easy");
  await expect(timeDisplay(page)).toHaveText("0.0 秒");
});

test("a variant without the 波次 on screen shows 第 1 波; switching back returns to that 波次", async ({
  page,
}) => {
  const variants = siteStage("ro4_b_5").variants;
  const view = (id: string) => {
    const variant = variants.find((v) => v.id === id)!;
    const level = readSiteLevel(variant.levelFile);
    const timelines = level.waves.map((_, waveIndex) =>
      buildTimeline(level, { waveIndex, difficulty: variant.difficulty }),
    );
    return {
      waves: level.waves.length,
      onField: (waveIndex: number, t: number) =>
        takeSnapshot(timelines[waveIndex]!, t).counts.onField,
    };
  };
  const normal = view("normal");
  const replace = view("replace1");
  expect(normal.waves, "the base map has 2 波次").toBe(2);
  expect(replace.waves, "the 替換地圖 has 3 波次").toBe(3);
  // The 替換地圖's third 波次 spawns nothing by default, so its time slider ends at 0 s; the
  // seconds move on the base map's first 波次 instead. The two 波次 differ at 0 s and at `t`, so
  // each count says which one is shown.
  const t = 30;
  for (const s of [0, t]) {
    expect(normal.onField(0, s), `the two 波次 differ at ${s} s`).not.toBe(replace.onField(2, s));
  }

  await page.goto("#/level/ro4_b_5?v=replace1");
  await selectWave(page, 2);
  await expect(page.locator("svg.map g.enemy")).toHaveCount(replace.onField(2, 0));

  await page.locator('button[data-variant="normal"]').click();

  await expectVariantShown(page, "normal");
  await expect(page.getByRole("radio", { name: "第 1 波" })).toBeChecked();
  await expect(timeDisplay(page)).toHaveText("0.0 秒");
  await expect(page.locator("svg.map g.enemy")).toHaveCount(normal.onField(0, 0));
  await seek(page, t);
  await expect(page.locator("svg.map g.enemy")).toHaveCount(normal.onField(0, t));

  await page.locator('button[data-variant="replace1"]').click();

  await expectVariantShown(page, "replace1");
  await expect(page.getByRole("radio", { name: "第 3 波" })).toBeChecked();
  await expect(timeDisplay(page)).toHaveText(`${t.toFixed(1)} 秒`);
  await expect(page.locator("svg.map g.enemy")).toHaveCount(replace.onField(2, t));
});

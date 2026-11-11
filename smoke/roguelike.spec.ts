// Smoke test: 集成戰略 stages in the built site (dist/), against the index the site ships.
import { expect, test } from "@playwright/test";
import type { Difficulty } from "../src/level/index.ts";
import {
  buildTimeline,
  isEmptyWave,
  spawnPlan,
  timelineEnd,
  type SpawnSwitches,
} from "../src/timeline/index.ts";
import {
  expectDefaultSwitches,
  expectVariantShown,
  readSiteLevel,
  seek,
  selectWave,
  siteStage,
  timeDisplay,
  timeSlider,
} from "./levelPage.ts";

test("a theme lists its nodes only: a node with a 緊急作戰 lists it", async ({ page }) => {
  expect(
    siteStage("ro1_n_1_1").variants.map((v) => v.id),
    "ro1_n_1_1 has a 緊急作戰",
  ).toContain("emergency");
  await page.goto("#/");
  await page.locator('a[data-area="rogue_1"]').click();

  await expect(page.locator('a[data-stage="ro1_n_1_1"]')).toBeVisible();
  await expect(page.locator("h3", { hasText: "緊急作戰" })).toHaveCount(0);
  await expect(page.locator('a[data-stage^="ro1_e_"]')).toHaveCount(0);
  const row = page.locator('a[data-stage="ro1_n_1_1"]');
  await expect(row.locator(".variants")).toHaveText("緊急作戰");

  await row.click();
  await expect(page).toHaveURL(/#\/level\/ro1_n_1_1\?v=normal$/);
  await expectVariantShown(page, "normal");
});

test("a node switches between 普通 and 緊急作戰", async ({ page }) => {
  await page.goto("#/level/ro1_n_1_1?v=normal");

  const buttons = page.getByRole("group", { name: "關卡變體" }).getByRole("button");
  await expect(buttons).toHaveText(["普通", "緊急作戰"]);
  await expect(page.locator("svg.map")).toBeVisible();

  await page.locator('button[data-variant="emergency"]').click();

  await expect(page).toHaveURL(/#\/level\/ro1_n_1_1\?v=emergency$/);
  await expectVariantShown(page, "emergency");

  await page.locator('button[data-variant="normal"]').click();

  await expectVariantShown(page, "normal");
});

test("the variant buttons stay put across 普通 ↔ 緊急作戰", async ({ page }) => {
  await page.goto("#/level/ro1_n_1_1?v=normal");
  const group = page.getByRole("group", { name: "關卡變體" });
  await expect(page.locator("svg.map")).toBeVisible();
  const before = (await group.boundingBox())!;

  await page.locator('button[data-variant="emergency"]').click();

  await expectVariantShown(page, "emergency");
  expect(await group.boundingBox()).toEqual(before);

  await page.locator('button[data-variant="normal"]').click();

  await expectVariantShown(page, "normal");
  expect(await group.boundingBox()).toEqual(before);
});

test("a stage without a 緊急作戰, such as a boss, has no variant buttons", async ({ page }) => {
  expect(siteStage("ro1_b_1").variants).toHaveLength(1);
  await page.goto("#/level/ro1_b_1");

  await expect(page.locator("svg.map")).toBeVisible();
  await expect(page.getByRole("group", { name: "關卡變體" })).toHaveCount(0);
});

test("普通 ↔ 緊急作戰 keeps the 波次 and seconds and resets the switches", async ({ page }) => {
  const variants = siteStage("ro4_t_2").variants;
  const emergency = variants.find((v) => v.id === "emergency")!;
  const level = readSiteLevel(variants[0]!.levelFile);
  expect(emergency.levelFile, "緊急作戰 shares the node's file").toBe(variants[0]!.levelFile);
  const group = spawnPlan(level, "NORMAL").groups.hidden.find((g) => !g.defaultOn)!;
  expect(group, "ro4_t_2 has a 隱藏組 off in 普通").toBeDefined();
  const emergencyGroups = spawnPlan(level, emergency.difficulty).groups.hidden;
  const otherGroup = emergencyGroups.find((g) => !g.defaultOn)!;
  expect(otherGroup, "ro4_t_2 has a 隱藏組 off in 緊急作戰").toBeDefined();
  const hiddenOn = [...emergencyGroups.filter((g) => g.defaultOn), otherGroup].map((g) => g.name);
  expect(
    isEmptyWave(
      buildTimeline(level, {
        waveIndex: 1,
        difficulty: emergency.difficulty,
        switches: { hiddenOn },
      }),
    ),
    "switching it on leaves 第 2 波 with enemy individuals",
  ).toBe(false);
  await page.goto("#/level/ro4_t_2?v=normal");
  await selectWave(page, 1);
  await seek(page, 40);
  await page.locator(`input[data-hidden-group="${group.name}"]`).check();

  await page.locator('button[data-variant="emergency"]').click();

  await expect(page).toHaveURL(/#\/level\/ro4_t_2\?v=emergency$/);
  await expect(page.getByRole("radio", { name: "第 2 波" })).toBeChecked();
  await expect(timeDisplay(page)).toHaveText("40.0 秒");
  await expectDefaultSwitches(page, level, emergency.difficulty);

  await page.locator(`input[data-hidden-group="${otherGroup.name}"]`).click();
  await expect(timeSlider(page)).toBeEnabled();
  await page.locator('button[data-variant="normal"]').click();

  await expect(page.getByRole("radio", { name: "第 2 波" })).toBeChecked();
  await expect(timeDisplay(page)).toHaveText("40.0 秒");
  await expectDefaultSwitches(page, level, "NORMAL");
});

test("緊急作戰: a switch that empties the 波次 resets the seconds, and 普通 does not bring them back", async ({
  page,
}) => {
  const variants = siteStage("ro4_t_2").variants;
  const emergency = variants.find((v) => v.id === "emergency")!;
  const level = readSiteLevel(variants[0]!.levelFile);
  const { hidden } = spawnPlan(level, emergency.difficulty).groups;
  const group = hidden.find((g) => g.name === "hidden")!;
  expect(group.defaultOn, "緊急作戰 has the 隱藏組 on").toBe(true);
  const hiddenOn = hidden.filter((g) => g.defaultOn && g !== group).map((g) => g.name);
  const waveOf = (difficulty: Difficulty, switches: SpawnSwitches = {}) =>
    buildTimeline(level, { waveIndex: 1, difficulty, switches });
  expect(
    isEmptyWave(waveOf(emergency.difficulty, { hiddenOn })),
    "switching it off leaves 第 2 波 a 空波次",
  ).toBe(true);
  expect(timelineEnd(waveOf("NORMAL")), "普通's 第 2 波 lasts past 40 s").toBeGreaterThan(40);
  await page.goto("#/level/ro4_t_2?v=emergency");
  await selectWave(page, 1);
  await seek(page, 40);

  await page.locator(`input[data-hidden-group="${group.name}"]`).uncheck();

  await expect(timeSlider(page)).toBeDisabled();
  await expect(timeDisplay(page)).toHaveText("本波沒有敵人");

  await page.locator('button[data-variant="normal"]').click();

  await expect(page.getByRole("radio", { name: "第 2 波" })).toBeChecked();
  await expect(timeSlider(page)).toBeEnabled();
  await expect(timeDisplay(page)).toHaveText("0.0 秒");
});

test("an old 緊急作戰 link opens its node's 緊急作戰, leaving no history entry behind", async ({
  page,
}) => {
  await page.goto("#/");
  await page.goto("#/level/ro4_e_1_1");

  await expect(page).toHaveURL(/#\/level\/ro4_n_1_1\?v=emergency$/);
  await expectVariantShown(page, "emergency");

  await page.goBack();
  await expect(page).toHaveURL(/#\/$/);
});

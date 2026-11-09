// Smoke test: 集成戰略 stages in the built site (dist/), against the index the site ships.
import { expect, test, type Page } from "@playwright/test";
import { spawnPlan } from "../src/timeline/index.ts";
import {
  expectDefaultSwitches,
  expectVariantShown,
  readSiteLevel,
  seek,
  selectWave,
  siteStage,
  timeDisplay,
} from "./levelPage.ts";

const conditionText = (page: Page) => page.locator("[data-emergency-condition]");
const emergencyCondition = (id: string) =>
  siteStage(id).variants.find((v) => v.id === "emergency")?.emergencyCondition;

test("a theme lists its nodes only: a node with a 緊急作戰 lists it, without its condition text", async ({
  page,
}) => {
  const condition = emergencyCondition("ro1_n_1_1");
  expect(condition, "ro1_n_1_1 has a 緊急作戰").toBeDefined();
  await page.goto("#/");
  await page.locator('a[data-area="rogue_1"]').click();

  await expect(page.locator('a[data-stage="ro1_n_1_1"]')).toBeVisible();
  await expect(page.locator("h3", { hasText: "緊急作戰" })).toHaveCount(0);
  await expect(page.locator('a[data-stage^="ro1_e_"]')).toHaveCount(0);
  const row = page.locator('a[data-stage="ro1_n_1_1"]');
  await expect(row.locator(".variants")).toHaveText("緊急作戰");
  await expect(row).not.toContainText(condition!);

  await row.click();
  await expect(page).toHaveURL(/#\/level\/ro1_n_1_1\?v=normal$/);
  await expectVariantShown(page, "normal");
});

test("a node switches between 普通 and 緊急作戰; the condition text shows on 緊急作戰 only", async ({
  page,
}) => {
  const condition = emergencyCondition("ro1_n_1_1");
  await page.goto("#/level/ro1_n_1_1?v=normal");

  const buttons = page.getByRole("group", { name: "關卡變體" }).getByRole("button");
  await expect(buttons).toHaveText(["普通", "緊急作戰"]);
  await expect(page.locator("svg.map")).toBeVisible();
  await expect(conditionText(page)).toHaveCount(0);

  await page.locator('button[data-variant="emergency"]').click();

  await expect(page).toHaveURL(/#\/level\/ro1_n_1_1\?v=emergency$/);
  await expectVariantShown(page, "emergency");
  await expect(conditionText(page)).toHaveText(condition!);

  await page.locator('button[data-variant="normal"]').click();

  await expect(conditionText(page)).toHaveCount(0);
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
  await page.goto("#/level/ro4_t_2?v=normal");
  await selectWave(page, 1);
  await seek(page, 40);
  await page.locator(`input[data-hidden-group="${group.name}"]`).check();

  await page.locator('button[data-variant="emergency"]').click();

  await expect(page).toHaveURL(/#\/level\/ro4_t_2\?v=emergency$/);
  await expect(page.getByRole("radio", { name: "第 2 波" })).toBeChecked();
  await expect(timeDisplay(page)).toHaveText("40.0 秒");
  await expectDefaultSwitches(page, level, emergency.difficulty);

  await page.locator(`input[data-hidden-group="${group.name}"]`).click();
  await expect(page.getByRole("slider", { name: "時間軸" })).toBeDisabled();
  await page.locator('button[data-variant="normal"]').click();

  await expect(page.getByRole("radio", { name: "第 2 波" })).toBeChecked();
  await expect(timeDisplay(page)).toHaveText("0.0 秒");
  await expectDefaultSwitches(page, level, "NORMAL");
});

test("an old 緊急作戰 link opens its node's 緊急作戰, leaving no history entry behind", async ({
  page,
}) => {
  await page.goto("#/");
  await page.goto("#/level/ro4_e_1_1");

  await expect(page).toHaveURL(/#\/level\/ro4_n_1_1\?v=emergency$/);
  await expectVariantShown(page, "emergency");
  await expect(conditionText(page)).toHaveText(emergencyCondition("ro4_n_1_1")!);

  await page.goBack();
  await expect(page).toHaveURL(/#\/$/);
});

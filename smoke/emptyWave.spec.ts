import { expect, test, type Page } from "@playwright/test";
import { buildTimeline } from "../src/timeline/index.ts";
import { selectWave, shownOpacity, siteLevel, timeDisplay } from "./levelPage.ts";

const slider = (page: Page) => page.getByRole("slider", { name: "時間軸" });
const playButton = (page: Page) => page.getByRole("button", { name: "播放", exact: true });
const individuals = (id: string, waveIndex: number) =>
  buildTimeline(siteLevel(id), { waveIndex }).individuals.length;

test("6-15: the last 波次 is empty; its slider is disabled and 播放 stays put", async ({
  page,
}) => {
  expect(siteLevel("main_06-15").waves, "6-15 has 2 波次").toHaveLength(2);
  expect(individuals("main_06-15", 1), "第 2 波 spawns no enemy individual").toBe(0);

  await page.goto("#/level/main_06-15?v=normal");
  await selectWave(page, 1);

  await expect(slider(page)).toBeDisabled();
  await expect(timeDisplay(page)).toHaveText("本波沒有敵人");
  expect(await shownOpacity(slider(page))).toBeLessThan(1);
  await expect(playButton(page)).toBeEnabled();

  await playButton(page).click();

  await expect(playButton(page)).toBeVisible();
  await expect(page.getByRole("radio", { name: "第 2 波" })).toBeChecked();
  await expect(slider(page)).toBeDisabled();
  await expect(timeDisplay(page)).toHaveText("本波沒有敵人");
  await expect(page.locator("svg.map g.enemy")).toHaveCount(0);
});

test("2-8: opening on an empty 第 1 波, 播放 moves on to 第 2 波 and the slider comes back", async ({
  page,
}) => {
  expect(individuals("main_02-08", 0), "第 1 波 spawns no enemy individual").toBe(0);
  expect(individuals("main_02-08", 1), "第 2 波 spawns enemy individuals").toBeGreaterThan(0);

  await page.goto("#/level/main_02-08?v=normal");

  await expect(slider(page)).toBeDisabled();
  await expect(timeDisplay(page)).toHaveText("本波沒有敵人");

  await playButton(page).click();

  await expect(page.getByRole("radio", { name: "第 2 波" })).toBeChecked();
  await expect(slider(page)).toBeEnabled();
  await expect(timeDisplay(page)).toHaveText(/^\d+\.\d 秒$/);
  await expect(timeDisplay(page)).not.toHaveText(/^0\.0 /);
  expect(await shownOpacity(slider(page))).toBe(1);
});

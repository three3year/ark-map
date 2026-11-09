import { expect, test } from "@playwright/test";
import { buildTimeline, isEmptyWave } from "../src/timeline/index.ts";
import {
  playButton,
  selectWave,
  shownOpacity,
  siteLevel,
  timeDisplay,
  timeSlider,
} from "./levelPage.ts";

const emptyWaveOf = (id: string, waveIndex: number) =>
  isEmptyWave(buildTimeline(siteLevel(id), { waveIndex }));

test("6-15: the last 波次 is empty; its slider is disabled and 播放 stays put", async ({
  page,
}) => {
  expect(siteLevel("main_06-15").waves, "6-15 has 2 波次").toHaveLength(2);
  expect(emptyWaveOf("main_06-15", 1), "第 2 波 is a 空波次").toBe(true);

  await page.goto("#/level/main_06-15?v=normal");
  await selectWave(page, 1);

  await expect(timeSlider(page)).toBeDisabled();
  await expect(timeDisplay(page)).toHaveText("本波沒有敵人");
  expect(await shownOpacity(timeSlider(page))).toBeLessThan(1);
  await expect(playButton(page)).toBeEnabled();

  await playButton(page).click();

  await expect(playButton(page)).toBeVisible();
  await expect(page.getByRole("radio", { name: "第 2 波" })).toBeChecked();
  await expect(timeSlider(page)).toBeDisabled();
  await expect(timeDisplay(page)).toHaveText("本波沒有敵人");
  await expect(page.locator("svg.map g.enemy")).toHaveCount(0);
});

test("2-8: opening on an empty 第 1 波, 播放 moves on to 第 2 波 and the slider comes back", async ({
  page,
}) => {
  expect(emptyWaveOf("main_02-08", 0), "第 1 波 is a 空波次").toBe(true);
  expect(emptyWaveOf("main_02-08", 1), "第 2 波 is not a 空波次").toBe(false);

  await page.goto("#/level/main_02-08?v=normal");

  await expect(timeSlider(page)).toBeDisabled();
  await expect(timeDisplay(page)).toHaveText("本波沒有敵人");

  await playButton(page).click();

  await expect(page.getByRole("radio", { name: "第 2 波" })).toBeChecked();
  await expect(timeSlider(page)).toBeEnabled();
  await expect(timeDisplay(page)).toHaveText(/^\d+\.\d 秒$/);
  await expect(timeDisplay(page)).not.toHaveText(/^0\.0 /);
  expect(await shownOpacity(timeSlider(page))).toBe(1);
});

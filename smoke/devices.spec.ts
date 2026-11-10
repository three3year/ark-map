// 裝置 on the map: square frames with the game's image, 擋路裝置 framed more boldly.
import { expect, test, type Page } from "@playwright/test";
import { cellKey } from "../src/level/index.ts";
import { expectVariantShown, siteLevel } from "./levelPage.ts";

const devicesOnMap = (page: Page, key: string) => page.locator(`svg.map [data-device="${key}"]`);

const frameWidth = (page: Page, key: string) =>
  devicesOnMap(page, key)
    .first()
    .locator(".device-frame")
    .evaluate((el) => parseFloat(getComputedStyle(el).strokeWidth));

test("TB-1 draws its 8 碎石 at their cells, framed more boldly than its 留聲機", async ({
  page,
}) => {
  const level = siteLevel("act10mini_01");
  const stones = level.devices.filter((d) => d.key === "trap_027_stone");
  expect(stones).toHaveLength(8);
  const towers = level.devices.filter((d) => d.key === "trap_014_tower");

  await page.goto("#/level/act10mini_01?v=normal");

  const drawn = devicesOnMap(page, "trap_027_stone");
  await expect(drawn).toHaveCount(8);
  const cells = await drawn.evaluateAll((els) => els.map((e) => e.getAttribute("data-cell")));
  expect(cells.sort()).toEqual(stones.map((d) => cellKey(d.cell)).sort());
  await expect(drawn.first()).toHaveAccessibleName("碎石");
  await expect(drawn.first().locator("image")).toHaveAttribute("href", stones[0]!.image!);
  await expect(page.locator('svg.map [data-device][data-blocker="true"]')).toHaveCount(8);

  await expect(devicesOnMap(page, "trap_014_tower")).toHaveCount(towers.length);
  expect(await frameWidth(page, "trap_027_stone")).toBeGreaterThan(
    await frameWidth(page, "trap_014_tower"),
  );
});

test("WR-EX-6: normal draws none of the 3 hidden 障礙物; challenge, whose 難度修正 enables them, draws all 3", async ({
  page,
}) => {
  const crates = siteLevel("act16d5_ex06").devices.filter((d) => d.key === "trap_001_crate");
  expect(crates.map((d) => d.hidden)).toEqual([true, true, true]);

  await page.goto("#/level/act16d5_ex06?v=normal");
  await expectVariantShown(page, "normal");
  await expect(page.locator("svg.map .tile").first()).toBeVisible();
  await expect(devicesOnMap(page, "trap_001_crate")).toHaveCount(0);

  await page.goto("#/level/act16d5_ex06?v=challenge");
  await expectVariantShown(page, "challenge");
  await expect(devicesOnMap(page, "trap_001_crate")).toHaveCount(3);
});

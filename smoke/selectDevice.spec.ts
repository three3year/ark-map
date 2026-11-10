import { expect, test, type Page } from "@playwright/test";
import type { Cell, Level } from "../src/level/index.ts";
import { buildTimeline, takeSnapshot, timelineEnd, type Timeline } from "../src/timeline/index.ts";
import { deviceOnMap, enemyOnMap, seek, selectWave, siteLevel, wideWindow } from "./levelPage.ts";

test.use({ viewport: wideWindow });

const clearAround = (timeline: Timeline, t: number, { row, col }: Cell) =>
  takeSnapshot(timeline, t).onField.every(
    ({ position }) => Math.hypot(position.x - col, position.y - row) > 1,
  );

function deviceClearOfEnemies(level: Level, key: string) {
  const timeline = buildTimeline(level);
  const end = Math.ceil(timelineEnd(timeline));
  for (let t = 0; t <= end; t++) {
    const onField = takeSnapshot(timeline, t).onField;
    if (onField.length === 0) continue;
    for (const [index, device] of level.devices.entries()) {
      if (device.key === key && clearAround(timeline, t, device.cell)) {
        return { index, device, t, individual: onField[0]!.individual };
      }
    }
  }
  throw new Error(`no ${key} clear of enemies while some are on the field`);
}

const devicePanel = (page: Page) => page.locator(".selection[data-selected-device]");
const enemyPanel = (page: Page) => page.locator("p.selection[data-selected]");
const panelButton = (page: Page, name: string) =>
  devicePanel(page).getByRole("button", { name, exact: true });
const removedHint = (page: Page) => page.locator("[data-removed-count]");

test("TB-1: click a 碎石 to select it; 移除 in its panel leaves it selected as a dashed frame", async ({
  page,
}) => {
  const level = siteLevel("act10mini_01");
  const { index, device, t } = deviceClearOfEnemies(level, "trap_027_stone");

  await page.goto("#/level/act10mini_01?v=normal");
  await seek(page, t);
  await deviceOnMap(page, index).click();

  await expect(devicePanel(page)).toHaveAttribute("data-selected-device", String(index));
  await expect(devicePanel(page)).toContainText(device.name);
  expect(device.description).not.toBeNull();
  await expect(devicePanel(page)).toContainText(device.description!);
  await expect(deviceOnMap(page, index)).toHaveAttribute("aria-pressed", "true");
  await expect(removedHint(page)).toHaveCount(0);

  await panelButton(page, "移除").click();

  await expect(deviceOnMap(page, index).and(page.locator("[data-removed]"))).toHaveCount(1);
  await expect(deviceOnMap(page, index)).toHaveAttribute("aria-pressed", "true");
  await expect(devicePanel(page)).toHaveAttribute("data-selected-device", String(index));
  await expect(panelButton(page, "移除")).toHaveCount(0);
  await expect(panelButton(page, "恢復")).toHaveCount(1);
  await expect(removedHint(page)).toContainText("已移除 1 個裝置");

  await removedHint(page).getByRole("button", { name: "全部恢復" }).click();
  await expect(page.locator("svg.map g.device[data-removed]")).toHaveCount(0);
  await expect(deviceOnMap(page, index)).toHaveCount(1);
  await expect(removedHint(page)).toHaveCount(0);
  await expect(panelButton(page, "移除")).toHaveCount(1);
});

test("TB-1: 恢復 in the panel puts the selected 碎石 back", async ({ page }) => {
  const level = siteLevel("act10mini_01");
  const { index, t } = deviceClearOfEnemies(level, "trap_027_stone");

  await page.goto("#/level/act10mini_01?v=normal");
  await seek(page, t);
  await deviceOnMap(page, index).press("Enter");
  await panelButton(page, "移除").click();
  await panelButton(page, "恢復").click();

  await expect(page.locator("svg.map g.device[data-removed]")).toHaveCount(0);
  await expect(panelButton(page, "移除")).toHaveCount(1);
  await expect(removedHint(page)).toHaveCount(0);
});

test("TB-1: a selected 塔, not a 擋路裝置, has no 移除 button", async ({ page }) => {
  const level = siteLevel("act10mini_01");
  const { index, device, t } = deviceClearOfEnemies(level, "trap_014_tower");
  expect(device.blocker).toBe(false);

  await page.goto("#/level/act10mini_01?v=normal");
  await seek(page, t);
  await deviceOnMap(page, index).click();

  await expect(devicePanel(page)).toHaveAttribute("data-selected-device", String(index));
  await expect(devicePanel(page)).toContainText(device.name);
  await expect(panelButton(page, "移除")).toHaveCount(0);
  await expect(panelButton(page, "恢復")).toHaveCount(0);
});

test("TB-1: Enter on a focused device selects it, and a click on it again deselects it", async ({
  page,
}) => {
  const level = siteLevel("act10mini_01");
  const { index, t } = deviceClearOfEnemies(level, "trap_027_stone");

  await page.goto("#/level/act10mini_01?v=normal");
  await seek(page, t);
  await deviceOnMap(page, index).focus();
  await page.keyboard.press("Enter");
  await expect(devicePanel(page)).toHaveAttribute("data-selected-device", String(index));

  await deviceOnMap(page, index).click();
  await expect(devicePanel(page)).toHaveCount(0);
  await expect(deviceOnMap(page, index)).toHaveAttribute("aria-pressed", "false");
});

test("TB-1: selecting a device deselects the enemy, and selecting an enemy deselects the device", async ({
  page,
}) => {
  const level = siteLevel("act10mini_01");
  const { index, t, individual } = deviceClearOfEnemies(level, "trap_027_stone");

  await page.goto("#/level/act10mini_01?v=normal");
  await seek(page, t);
  await enemyOnMap(page, individual.id).press("Enter");
  await expect(enemyPanel(page)).toHaveAttribute("data-selected", individual.id);

  await deviceOnMap(page, index).click();
  await expect(devicePanel(page)).toHaveCount(1);
  await expect(enemyPanel(page)).toHaveCount(0);
  await expect(enemyOnMap(page, individual.id)).toHaveAttribute("aria-pressed", "false");

  await enemyOnMap(page, individual.id).press("Enter");
  await expect(enemyPanel(page)).toHaveAttribute("data-selected", individual.id);
  await expect(devicePanel(page)).toHaveCount(0);
  await expect(deviceOnMap(page, index)).toHaveAttribute("aria-pressed", "false");
});

test("ISW-NO: a selected 碎石 stays selected on another wave where it is still drawn", async ({
  page,
}) => {
  const level = siteLevel("ro2_n_5_5");
  expect(level.waves.length).toBeGreaterThan(1);
  const drawnAtStart = (waveIndex: number) => buildTimeline(level, { waveIndex }).devicesAt(0);
  const stone = level.devices.findIndex(
    (d) => d.key === "trap_027_stone" && drawnAtStart(0).includes(d) && drawnAtStart(1).includes(d),
  );
  expect(stone).toBeGreaterThanOrEqual(0);

  await page.goto("#/level/ro2_n_5_5?v=normal");
  await deviceOnMap(page, stone).press("Enter");
  await expect(devicePanel(page)).toHaveAttribute("data-selected-device", String(stone));

  await selectWave(page, 1);
  await expect(devicePanel(page)).toHaveAttribute("data-selected-device", String(stone));
  await expect(deviceOnMap(page, stone)).toHaveAttribute("aria-pressed", "true");
});

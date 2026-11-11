import { expect, test, type Page } from "@playwright/test";
import { cellKey, type Level } from "../src/level/index.ts";
import { buildTimeline, takeSnapshot, timelineEnd } from "../src/timeline/index.ts";
import {
  conditionalSwitch,
  deviceByIndex,
  deviceIndex,
  enemyOnMap,
  seek,
  setConditionalSecond,
  siteLevel,
  wideWindow,
} from "./levelPage.ts";

test.use({ viewport: wideWindow });

const effectLayer = (page: Page) => page.locator("svg.map [data-effect-cells]");
const legendItem = (page: Page) =>
  page.getByRole("list", { name: "圖例" }).getByText("作用範圍", { exact: true });

async function drawnCells(page: Page): Promise<string[]> {
  const cells = await effectLayer(page).getAttribute("data-effect-cells");
  return cells!.split(" ").sort();
}

test("TB-1: selecting a 留聲機 draws its 18 cells and lists 作用範圍; selecting it again clears both", async ({
  page,
}) => {
  const level = siteLevel("act10mini_01");
  const index = deviceIndex(level, "trap_014_tower#3");
  const cells = level.devices[index]!.effectCells;
  expect(cells).toHaveLength(18);

  await page.goto("#/level/act10mini_01?v=normal");
  await expect(effectLayer(page)).toHaveCount(0);
  await expect(legendItem(page)).toHaveCount(0);

  await deviceByIndex(page, index).click();
  await expect(effectLayer(page)).toHaveCount(1);
  expect(await drawnCells(page)).toEqual(cells.map(cellKey).sort());
  await expect(legendItem(page)).toBeVisible();

  await deviceByIndex(page, index).click();
  await expect(effectLayer(page)).toHaveCount(0);
  await expect(legendItem(page)).toHaveCount(0);
});

test("TB-1: a selected 碎石 draws no 作用範圍", async ({ page }) => {
  const level = siteLevel("act10mini_01");
  const index = deviceIndex(level, "trap_027_stone#1");

  await page.goto("#/level/act10mini_01?v=normal");
  await deviceByIndex(page, index).click();
  await expect(deviceByIndex(page, index)).toHaveAttribute("aria-pressed", "true");
  await expect(effectLayer(page)).toHaveCount(0);
  await expect(legendItem(page)).toHaveCount(0);
});

test("1-7: a 震撼裝置 draws its skill's 作用範圍; 移除 clears it and 恢復 brings it back", async ({
  page,
}) => {
  const level = siteLevel("main_01-07");
  const index = level.devices.findIndex((d) => d.key === "trap_002_emp");
  const cells = level.devices[index]!.effectCells;
  expect(cells, "x-4: the 3 x 3 square around it").toHaveLength(9);
  const panelButton = (name: string) =>
    page.locator(".selection[data-selected-device]").getByRole("button", { name, exact: true });

  await page.goto("#/level/main_01-07?v=normal");
  await deviceByIndex(page, index).click();
  await expect(effectLayer(page)).toHaveCount(1);
  expect(await drawnCells(page)).toEqual(cells.map(cellKey).sort());
  await expect(legendItem(page)).toBeVisible();

  await panelButton("移除").click();
  await expect(effectLayer(page)).toHaveCount(0);
  await expect(legendItem(page)).toHaveCount(0);

  await panelButton("恢復").click();
  await expect(effectLayer(page)).toHaveCount(1);
  await expect(legendItem(page)).toBeVisible();
});

test("TB-1: the 作用範圍 is the map's last layer", async ({ page }) => {
  const level = siteLevel("act10mini_01");

  await page.goto("#/level/act10mini_01?v=normal");
  await deviceByIndex(page, deviceIndex(level, "trap_014_tower#1")).click();
  await expect(page.locator("svg.map > :last-child")).toHaveAttribute("data-effect-cells");
});

test("EP-8: a 鹽坨子炮 HidenCnnon activates draws its 作用範圍 only while it is on the map", async ({
  page,
}) => {
  const level = siteLevel("act39side_08");
  const branch = level.branches.findIndex((b) => b.key === "HidenCnnon");
  const cannon = deviceIndex(level, "trap_196_cnnon#3");
  const cells = level.devices[cannon]!.effectCells;
  expect(cells).toHaveLength(7);
  const trigger = 20;

  await page.goto("#/level/act39side_08?v=normal");
  await conditionalSwitch(page, branch).check();
  await setConditionalSecond(page, branch, trigger);
  await seek(page, trigger + 5);
  await deviceByIndex(page, cannon).click();
  expect(await drawnCells(page)).toEqual(cells.map(cellKey).sort());
  await expect(legendItem(page)).toBeVisible();

  await seek(page, trigger - 1);
  await expect(effectLayer(page)).toHaveCount(0);
  await expect(legendItem(page)).toHaveCount(0);

  await seek(page, trigger + 5);
  expect(await drawnCells(page)).toEqual(cells.map(cellKey).sort());
});

function enemyInside(level: Level, cells: string[]) {
  const timeline = buildTimeline(level);
  const deviceCells = new Set(level.devices.map((d) => cellKey(d.cell)));
  const end = Math.ceil(timelineEnd(timeline));
  for (let t = 0; t <= end; t++) {
    const onField = takeSnapshot(timeline, t).onField;
    for (const { individual, position } of onField) {
      const cell = cellKey({ row: Math.round(position.y), col: Math.round(position.x) });
      const alone = onField.every(
        (o) =>
          o.individual.id === individual.id ||
          Math.hypot(o.position.x - position.x, o.position.y - position.y) > 1,
      );
      if (cells.includes(cell) && !deviceCells.has(cell) && alone) return { t, individual };
    }
  }
  throw new Error("no enemy individual alone inside the 作用範圍");
}

test("TB-1: a click on an enemy individual inside the 作用範圍 selects it", async ({ page }) => {
  const level = siteLevel("act10mini_01");
  const index = deviceIndex(level, "trap_014_tower#1");
  const { t, individual } = enemyInside(level, level.devices[index]!.effectCells.map(cellKey));

  await page.goto("#/level/act10mini_01?v=normal");
  await seek(page, t);
  await deviceByIndex(page, index).press("Enter");
  await expect(effectLayer(page)).toHaveCount(1);

  await enemyOnMap(page, individual.id).click();
  await expect(page.locator("p.selection[data-selected]")).toHaveAttribute(
    "data-selected",
    individual.id,
  );
  await expect(effectLayer(page)).toHaveCount(0);
});

import { expect, test, type Page } from "@playwright/test";
import { cellKey, type Level } from "../src/level/index.ts";
import { buildTimeline, takeSnapshot, timelineEnd } from "../src/timeline/index.ts";
import { deviceByIndex, enemyOnMap, seek, siteLevel, wideWindow } from "./levelPage.ts";

test.use({ viewport: wideWindow });

/** The 作用範圍 drawn on the map. */
const effectLayer = (page: Page) => page.locator("svg.map [data-effect-cells]");
const legendItem = (page: Page) =>
  page.getByRole("list", { name: "圖例" }).getByText("作用範圍", { exact: true });

async function drawnCells(page: Page): Promise<string[]> {
  const cells = await effectLayer(page).getAttribute("data-effect-cells");
  return cells!.split(" ").sort();
}

const deviceIndex = (level: Level, alias: string) =>
  level.devices.findIndex((d) => d.alias === alias);

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

  // The stripes cover the device's own cell; the click still reaches the device.
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

test("TB-1: the 作用範圍 is the map's last layer", async ({ page }) => {
  const level = siteLevel("act10mini_01");

  await page.goto("#/level/act10mini_01?v=normal");
  await deviceByIndex(page, deviceIndex(level, "trap_014_tower#1")).click();
  await expect(page.locator("svg.map > :last-child")).toHaveAttribute("data-effect-cells");
});

/**
 * A second at which an enemy individual stands in `cells`, off any device's cell and more than a
 * cell from any other individual, so a click on it can reach nothing else.
 */
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

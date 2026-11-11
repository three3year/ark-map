import { expect, test, type Page } from "@playwright/test";
import { spawnTable } from "../src/timeline/index.ts";
import { orderCell, rowOf, siteLevel, wideWindow } from "./levelPage.ts";

test.use({ viewport: wideWindow });

const attributes = (page: Page) => page.locator("dl.enemy-attributes");
const valueOf = (page: Page, label: string) =>
  attributes(page)
    .locator("div")
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator("dd");

test("4-4 突襲: a selected soldier shows 10 屬性; the modified 移速 stands out with its base", async ({
  page,
}) => {
  const row = spawnTable(siteLevel("main_04-04"), { difficulty: "FOUR_STAR" }).find(
    (r) => r.enemyId === "enemy_1002_nsabr",
  )!;
  await page.goto("#/level/main_04-04?v=challenge");
  await orderCell(rowOf(page, row)).click();

  await expect(attributes(page).locator("dt")).toHaveCount(10);
  await expect(valueOf(page, "移速")).toHaveText("2.2");
  await expect(valueOf(page, "移速")).toHaveAttribute("title", "基礎 1.1 ×2");
  const color = (label: string) =>
    valueOf(page, label).evaluate((el) => getComputedStyle(el).color);
  expect(await color("移速")).not.toBe(await color("攻擊"));

  await page.locator('[data-variant="normal"]').click();

  await expect(valueOf(page, "移速")).toHaveText("1.1");
  await expect(valueOf(page, "移速")).not.toHaveAttribute("title");
});

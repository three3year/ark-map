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

const framed = (page: Page, label: string) =>
  valueOf(page, label).evaluate((el) => {
    const style = getComputedStyle(el);
    const width = parseFloat(style.outlineWidth);
    const alpha = style.outlineColor.match(/^rgba\(.*,\s*([\d.]+)\)$/)?.[1];
    return width > 0 && style.outlineStyle !== "none" && (alpha === undefined || Number(alpha) > 0);
  });

test("4-4 突襲: a selected soldier shows 9 屬性, no 攻速; the modified 移速 stands out with its base, the overwritten 生命值 is framed", async ({
  page,
}) => {
  const row = spawnTable(siteLevel("main_04-04"), { difficulty: "FOUR_STAR" }).find(
    (r) => r.enemyId === "enemy_1002_nsabr",
  )!;
  await page.goto("#/level/main_04-04?v=challenge");
  await orderCell(rowOf(page, row)).click();

  await expect(attributes(page).locator("dt")).toHaveCount(9);
  await expect(valueOf(page, "移速")).toHaveText("2.2");
  await expect(valueOf(page, "移速")).toHaveAttribute("title", "關卡基礎: 1.1, 調整: ×2");
  const color = (label: string) =>
    valueOf(page, label).evaluate((el) => getComputedStyle(el).color);
  expect(await color("移速")).not.toBe(await color("攻擊"));
  expect(await framed(page, "生命值")).toBe(true);
  expect(await framed(page, "攻擊")).toBe(false);
  await expect(valueOf(page, "生命值")).toHaveAttribute("title", "原始數值: 1650, 關卡基礎: 2200");

  await page.locator('[data-variant="normal"]').click();

  await expect(valueOf(page, "移速")).toHaveText("1.1");
  await expect(valueOf(page, "移速")).not.toHaveAttribute("title");
  expect(await color("移速")).toBe(await color("攻擊"));
  expect(await framed(page, "生命值")).toBe(true);
});

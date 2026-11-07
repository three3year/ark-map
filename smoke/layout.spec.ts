// Smoke test: on a screen clearly wider than the breakpoint, the level page puts the spawn table
// in a right column that stays on screen and scrolls on its own.
import { expect, test, type Page } from "@playwright/test";
import { wideWindow } from "./levelPage.ts";

test.use({ viewport: wideWindow });

const map = (page: Page) => page.locator("svg.map");
const spawnTable = (page: Page) => page.getByRole("region", { name: "出兵表" });
const tableHeading = (page: Page) => spawnTable(page).getByRole("heading", { name: "出兵表" });
/** The width the page's content gets, inside its side padding. */
const pageWidth = (page: Page) =>
  page.locator("main").evaluate((m) => parseFloat(getComputedStyle(m).width));

test("the spawn table sits right of the map; only the level page is wider than 960px", async ({
  page,
}) => {
  await page.goto("#/level/main_01-07?v=normal");
  const mapBox = (await map(page).boundingBox())!;
  const tableBox = (await spawnTable(page).boundingBox())!;

  expect(tableBox.x).toBeGreaterThanOrEqual(mapBox.x + mapBox.width);
  expect(tableBox.y).toBeLessThan(mapBox.y + mapBox.height);
  // No drawer: the column cannot be closed.
  await expect(page.getByRole("button", { name: "出兵表" })).toBeHidden();
  expect(await pageWidth(page)).toBeGreaterThan(1400);
  expect(await pageWidth(page)).toBeLessThanOrEqual(1440);

  await page.goto("#/");
  await expect(page.locator("main a[href^='#/area/']").first()).toBeVisible();
  expect(await pageWidth(page)).toBeLessThanOrEqual(960);
});

test("scrolling the page to the bottom keeps the spawn table on screen", async ({ page }) => {
  // A short window, so the page scrolls well past the spawn table's heading.
  await page.setViewportSize({ width: wideWindow.width, height: 500 });
  await page.goto("#/level/main_01-07?v=normal");
  await expect(map(page)).toBeVisible();

  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));

  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(200);
  await expect(tableHeading(page)).toBeInViewport({ ratio: 1 });
});

test("the spawn table scrolls in its column, 端點篩選 caption and all, leaving the page", async ({
  page,
}) => {
  // 29 of 15-12's 30 rows leave by 消失點(5, 5): more than a 900px column holds.
  await page.goto("#/level/main_15-12?v=normal");
  await page.getByRole("button", { name: "消失點(5, 5)" }).click();
  const caption = spawnTable(page).locator("[data-endpoint-filter]");
  await spawnTable(page).locator("tbody tr").first().hover();
  const before = (await caption.boundingBox())!.y;
  const pageScroll = await page.evaluate(() => scrollY);

  await page.mouse.wheel(0, 300);

  await expect.poll(async () => (await caption.boundingBox())!.y).toBeLessThan(before - 200);
  expect(await page.evaluate(() => scrollY)).toBe(pageScroll);
});

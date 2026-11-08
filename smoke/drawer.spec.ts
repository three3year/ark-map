// Smoke test: on a phone, the level page keeps the spawn table in a drawer that slides out from the
// right over the page, opened and closed by a button in the bottom-right corner.
import { expect, test, type Page } from "@playwright/test";
import {
  drawerButton,
  filterCaption,
  phoneWindow,
  spawnTableRegion,
  timeDisplay,
} from "./levelPage.ts";

test.use({ viewport: phoneWindow });

const map = (page: Page) => page.locator("svg.map");

test("the drawer starts closed; its button opens it over the page and closes it", async ({
  page,
}) => {
  await page.goto("#/level/main_01-07?v=normal");
  await expect(map(page)).toBeVisible();
  const mapBox = await map(page).boundingBox();

  await expect(drawerButton(page)).toHaveAttribute("aria-expanded", "false");
  await expect(spawnTableRegion(page)).toBeHidden();
  // In the window's bottom-right corner: on the right edge, give or take the drawer's 1px border.
  const closed = (await drawerButton(page).boundingBox())!;
  expect(Math.abs(closed.x + closed.width - phoneWindow.width)).toBeLessThanOrEqual(1);
  expect(closed.y + closed.height).toBeGreaterThan(phoneWindow.height - 40);
  expect(closed.y + closed.height).toBeLessThanOrEqual(phoneWindow.height);

  await drawerButton(page).click();

  await expect(drawerButton(page)).toHaveAttribute("aria-expanded", "true");
  await expect(spawnTableRegion(page)).toBeInViewport();
  // Still at the bottom, now on the open drawer's left edge, not under it.
  await expect
    .poll(async () => {
      const box = (await drawerButton(page).boundingBox())!;
      return box.x >= 0 && box.y === closed.y;
    })
    .toBe(true);
  const table = (await spawnTableRegion(page).boundingBox())!;
  expect((await drawerButton(page).boundingBox())!.x + closed.width).toBeLessThanOrEqual(table.x);
  // Over the page: the map stays where it was, as large as it was, and nothing scrolls sideways.
  expect(await map(page).boundingBox()).toEqual(mapBox);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(phoneWindow.width);

  await drawerButton(page).click();

  await expect(drawerButton(page)).toHaveAttribute("aria-expanded", "false");
  await expect(spawnTableRegion(page)).toBeHidden();
});

test("jumping from a row of the drawer's spawn table leaves the drawer open", async ({ page }) => {
  await page.goto("#/level/main_01-07?v=normal");
  await drawerButton(page).click();
  const row = spawnTableRegion(page).locator("tr[data-action]").nth(3);

  await row.locator("td").nth(2).click();

  await expect(page.locator("p.selection")).toHaveAttribute(
    "data-selected",
    `${await row.getAttribute("data-action")}-0`,
  );
  expect(await timeDisplay(page).textContent()).not.toBe("0.0 秒");
  await expect(drawerButton(page)).toHaveAttribute("aria-expanded", "true");
  await expect(spawnTableRegion(page)).toBeInViewport();
});

test("a dot that sets a 端點篩選 opens the closed drawer; the same dot again leaves it closed", async ({
  page,
}) => {
  await page.goto("#/level/main_15-12?v=normal");
  const spawn = page.getByRole("button", { name: "出生點(3, 0)" });

  await spawn.click();

  await expect(drawerButton(page)).toHaveAttribute("aria-expanded", "true");
  await expect(spawnTableRegion(page)).toBeInViewport();
  await expect(filterCaption(page)).toBeVisible();
  await expect(filterCaption(page)).toContainText("出生點(3, 0)");

  await drawerButton(page).click();
  await spawn.click();

  await expect(filterCaption(page)).toHaveCount(0);
  await expect(drawerButton(page)).toHaveAttribute("aria-expanded", "false");
  await expect(spawnTableRegion(page)).toBeHidden();
});

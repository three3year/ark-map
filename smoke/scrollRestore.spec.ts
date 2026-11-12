import { expect, test, type Page } from "@playwright/test";

/** Scroll `list` to its last link, open it, wait for `opened`, then press 上一頁. */
async function openLastAndGoBack(page: Page, list: string, opened: string) {
  const links = page.locator(list);
  await expect(links.first()).toBeVisible();
  await links.last().scrollIntoViewIfNeeded();
  const listScroll = await page.evaluate(() => scrollY);
  expect(listScroll, "the list scrolls").toBeGreaterThan(100);

  await links.last().click();
  await expect(page.locator(opened).first()).toBeVisible();
  await page.goBack();

  await expect(links.first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(listScroll);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
});

test("上一頁 from a stage returns its area's list to where it was scrolled", async ({ page }) => {
  await page.goto("#/area/rogue_5");
  await openLastAndGoBack(page, "a[data-stage]", "svg.map");
});

test("上一頁 from an area returns the area list to where it was scrolled", async ({ page }) => {
  await page.goto("#/");
  await openLastAndGoBack(page, "a[data-area]", "a[data-stage]");
});

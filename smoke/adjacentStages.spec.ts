// Smoke test: the 上一關／下一關 links beside the level title, in the built site (dist/).
import { expect, test, type Page } from "@playwright/test";
import { expectVariantShown, seek, siteStage, timeDisplay } from "./levelPage.ts";

const prevLink = (page: Page) => page.locator('a[data-adjacent="prev"]');
const nextLink = (page: Page) => page.locator('a[data-adjacent="next"]');

/** The link text naming stage `id`: its code and name, the code left out when blank. */
const label = (id: string) => {
  const { code, name } = siteStage(id);
  return code.trim() ? `${code} ${name}` : name;
};

test("a 集成戰略 node's links name its neighbours by code and name, telling apart the same ISW-NO", async ({
  page,
}) => {
  expect(siteStage("ro1_n_1_1").code).toBe(siteStage("ro1_n_1_2").code);
  await page.goto("#/level/ro1_n_1_2?v=normal");

  await expect(prevLink(page)).toHaveText(`‹ ${label("ro1_n_1_1")}`);
  await expect(prevLink(page)).toHaveAttribute("href", "#/level/ro1_n_1_1?v=normal");
  await expect(nextLink(page)).toHaveText(`${label("ro1_n_1_3")} ›`);
  await expect(nextLink(page)).toHaveAttribute("href", "#/level/ro1_n_1_3?v=normal");
});

test("the links run on across the area's sections", async ({ page }) => {
  await page.goto("#/level/ro1_n_1_5?v=normal");

  await expect(nextLink(page)).toHaveText(`${label("ro1_n_2_1")} ›`);
  await expect(nextLink(page)).toHaveAttribute("href", "#/level/ro1_n_2_1?v=normal");
});

test("the area's first stage has no 上一關 link", async ({ page }) => {
  await page.goto("#/level/main_00-01");

  await expect(page.locator("svg.map")).toBeVisible();
  await expect(prevLink(page)).toHaveCount(0);
  await expect(nextLink(page)).toHaveText(`${label("tr_01")} ›`);
});

test("the links keep the URL's 內容拓展", async ({ page }) => {
  await page.goto("#/level/ro4_n_1_2?v=normal&x=1");

  await expect(prevLink(page)).toHaveAttribute("href", "#/level/ro4_n_1_1?v=normal&x=1");
  await expect(nextLink(page)).toHaveAttribute("href", "#/level/ro4_n_1_3?v=normal&x=1");
});

test("on 突襲, 下一關 opens the next stage's 突襲 from the start; 上一頁 comes back", async ({
  page,
}) => {
  const has = (id: string) => siteStage(id).variants.some((v) => v.id === "challenge");
  expect([has("main_01-02"), has("main_01-03"), has("main_01-04")]).toEqual([false, true, true]);
  await page.goto("#/level/main_01-03?v=challenge");

  await expect(prevLink(page)).toHaveAttribute("href", "#/level/main_01-02?v=normal");
  await seek(page, 5);
  await nextLink(page).click();

  await expect(page).toHaveURL(/#\/level\/main_01-04\?v=challenge$/);
  await expectVariantShown(page, "challenge");
  await expect(timeDisplay(page)).toHaveText("0.0 秒");

  await page.goBack();

  await expect(page).toHaveURL(/#\/level\/main_01-03\?v=challenge$/);
  await expectVariantShown(page, "challenge");
});

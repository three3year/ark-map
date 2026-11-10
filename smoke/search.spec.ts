// Smoke test: the home page's 關卡 search in the built site (dist/), against the index it ships.
import { expect, test, type Page } from "@playwright/test";
import type { StageIndex } from "../src/level/index.ts";
import { expectVariantShown, readSiteJson, siteStage } from "./levelPage.ts";

const searchBox = (page: Page) => page.getByRole("searchbox", { name: "搜尋關卡" });
const stageLinks = (page: Page) => page.locator("a[data-stage]");
const stageLink = (page: Page, id: string) => page.locator(`a[data-stage="${id}"]`);
const areaLinks = (page: Page) => page.locator("a[data-area]");

const areaOf = (id: string) =>
  readSiteJson<StageIndex>("data/index.json").areas.find((a) =>
    a.sections.some((s) => s.stages.some((x) => x.id === id)),
  )!;

test("searching a 關卡代號 lists that stage; a hit opens its base variant", async ({ page }) => {
  const stage = siteStage("main_06-14");
  const area = areaOf(stage.id);
  expect(stage.code).toBe("6-16");
  expect(stage.variants.map((v) => v.id)).toEqual(["normal", "challenge"]);
  await page.goto("#/");
  await expect(areaLinks(page).first()).toBeVisible();

  await searchBox(page).fill("6-16");

  await expect(areaLinks(page)).toHaveCount(0);
  const hit = stageLink(page, stage.id);
  for (const text of [area.code!, area.name, stage.code, stage.name, "突襲"]) {
    await expect(hit).toContainText(text);
  }
  await hit.click();
  await expect(page).toHaveURL(/#\/level\/main_06-14\?v=normal$/);
  await expectVariantShown(page, "normal");
});

test("back from a stage keeps the keyword and its hits; a reload clears them", async ({ page }) => {
  await page.goto("#/");
  await searchBox(page).fill("6-16");
  await expect(stageLink(page, "main_06-14")).toBeVisible();
  const hits = await stageLinks(page).count();
  await stageLink(page, "main_06-14").click();
  await expectVariantShown(page, "normal");

  await page.goBack();

  await expect(page).toHaveURL(/#\/$/);
  await expect(searchBox(page)).toHaveValue("6-16");
  await expect(stageLinks(page)).toHaveCount(hits);

  await page.reload();

  await expect(searchBox(page)).toHaveValue("");
  await expect(stageLinks(page)).toHaveCount(0);
  await expect(areaLinks(page).first()).toBeVisible();
});

test("clearing the keyword, or leaving only spaces, brings back the area list", async ({
  page,
}) => {
  await page.goto("#/");
  await expect(areaLinks(page).first()).toBeVisible();
  const areas = await areaLinks(page).count();
  await searchBox(page).fill("6-16");
  await expect(areaLinks(page)).toHaveCount(0);

  await searchBox(page).fill("   ");

  await expect(stageLinks(page)).toHaveCount(0);
  await expect(areaLinks(page)).toHaveCount(areas);

  await searchBox(page).fill("6-16");
  await searchBox(page).fill("");

  await expect(areaLinks(page)).toHaveCount(areas);
});

test("a keyword nothing matches says so", async ({ page }) => {
  await page.goto("#/");

  await searchBox(page).fill("沒有這種關卡zzz");

  await expect(page.getByText("找不到符合的關卡")).toBeVisible();
  await expect(stageLinks(page)).toHaveCount(0);
  await expect(areaLinks(page)).toHaveCount(0);
});

test("a hit in a theme with 內容拓展 carries the site's choice; one in another theme does not", async ({
  page,
}) => {
  expect(siteStage("ro4_n_1_1").expansions?.map((x) => x.number)).toContain(2);
  expect(
    areaOf("ro1_n_1_1")
      .sections.flatMap((s) => s.stages)
      .some((x) => x.expansions),
  ).toBe(false);
  await page.goto("#/level/ro4_n_1_1?x=2");
  await expect(page.locator("svg.map")).toBeVisible();
  await page.goto("#/");

  await searchBox(page).fill(siteStage("ro4_n_1_1").name);
  await expect(stageLink(page, "ro4_n_1_1")).toHaveAttribute(
    "href",
    "#/level/ro4_n_1_1?v=normal&x=2",
  );

  await searchBox(page).fill(siteStage("ro1_n_1_1").name);
  await expect(stageLink(page, "ro1_n_1_1")).toHaveAttribute("href", "#/level/ro1_n_1_1?v=normal");
});

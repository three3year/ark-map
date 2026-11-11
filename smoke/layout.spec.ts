// Smoke test: on a screen clearly wider than the breakpoint, the level page puts the spawn table
// in a right column that stays on screen and scrolls on its own.
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  drawerButton,
  filterCaption,
  playButton,
  seek,
  shortWideWindow,
  siteLevel,
  spawnTableRegion,
  timeSlider,
  wideWindow,
} from "./levelPage.ts";

test.use({ viewport: wideWindow });

const map = (page: Page) => page.locator("svg.map");
const waveSelect = (page: Page) => page.getByRole("radiogroup", { name: "波次" });
const siteTitle = (page: Page) => page.getByRole("heading", { level: 1 });
const viewButton = (page: Page) => page.getByRole("button", { name: /^(平面俯視|傾斜視角)$/ });
const expansionSwitch = (page: Page) => page.getByRole("group", { name: "內容拓展" });

async function expectBelow(above: Locator, below: Locator, what: string) {
  const a = (await above.boundingBox())!;
  const b = (await below.boundingBox())!;
  expect(b.y, what).toBeGreaterThanOrEqual(a.y + a.height);
}

async function expectRightOf(left: Locator, right: Locator, what: string) {
  const l = (await left.boundingBox())!;
  const r = (await right.boundingBox())!;
  expect(r.x, `${what}: right of it`).toBeGreaterThanOrEqual(l.x + l.width);
  expect(r.y, `${what}: on its row`).toBeLessThan(l.y + l.height);
  expect(r.y + r.height, `${what}: on its row`).toBeGreaterThan(l.y);
}

test("above the map, top to bottom: the 波次, the time slider as wide as the map, the playback controls", async ({
  page,
}) => {
  expect(siteLevel("ro2_n_5_5").waves.length, "ro2_n_5_5 has several 波次").toBeGreaterThan(1);
  await page.goto("#/level/ro2_n_5_5?v=normal");
  await expect(map(page)).toBeVisible();

  await expectBelow(waveSelect(page), timeSlider(page), "the slider under the 波次");
  await expectBelow(timeSlider(page), playButton(page), "播放 under the slider");
  await expectBelow(playButton(page), map(page), "the map under 播放");
  const slider = (await timeSlider(page).boundingBox())!;
  const mapBox = (await map(page).boundingBox())!;
  expect(slider.width).toBeCloseTo(mapBox.width, 0);
});

test("a level of one 波次 has no 波次 row; the slider still sits above the map", async ({
  page,
}) => {
  expect(siteLevel("main_01-07").waves).toHaveLength(1);
  await page.goto("#/level/main_01-07?v=normal");
  await expect(map(page)).toBeVisible();

  await expect(waveSelect(page)).toHaveCount(0);
  await expectBelow(playButton(page), map(page), "the map under 播放");
});

test("the view button sits after the site title and switches the view, remembered on reload", async ({
  page,
}) => {
  await page.goto("#/level/main_01-07?v=normal");
  await expect(map(page)).toBeVisible();
  await expectRightOf(siteTitle(page), viewButton(page), "the view button by the site title");
  await expect(viewButton(page)).toHaveText("平面俯視");
  await expect(viewButton(page)).toHaveAttribute("aria-pressed", "false");
  const tiltedHeight = (await map(page).boundingBox())!.height;

  await viewButton(page).click();

  await expect(viewButton(page)).toHaveText("傾斜視角");
  await expect(viewButton(page)).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(async () => (await map(page).boundingBox())!.height, "the flat map stands taller")
    .toBeGreaterThan(tiltedHeight + 10);

  await page.reload();

  await expect(viewButton(page)).toHaveText("傾斜視角");
});

for (const [id, buttons] of [
  ["ro4_n_1_1", "原版 and 內容拓展"],
  ["ro4_n_1_5", "原版 only"],
] as const) {
  test(`${id}: the view button follows the 內容拓展 buttons (${buttons})`, async ({ page }) => {
    await page.goto(`#/level/${id}`);
    await expect(map(page)).toBeVisible();

    await expect(expansionSwitch(page).getByRole("button").first()).toHaveText("原版");
    await expectRightOf(expansionSwitch(page), viewButton(page), "the view button by 內容拓展");
  });
}

test("a lone 原版 button is rounded on both ends", async ({ page }) => {
  await page.goto("#/level/ro4_n_1_5");
  const button = expansionSwitch(page).getByRole("button");
  await expect(button).toHaveCount(1);
  await expect(button).toHaveCSS("border-top-left-radius", "999px");
  await expect(button).toHaveCSS("border-top-right-radius", "999px");
});

test("the home page and a stage list have no view button", async ({ page }) => {
  await page.goto("#/");
  await expect(page.locator("main a[href^='#/area/']").first()).toBeVisible();
  await expect(viewButton(page)).toHaveCount(0);

  await page.goto("#/area/rogue_4");
  await expect(expansionSwitch(page)).toBeVisible();
  await expect(viewButton(page)).toHaveCount(0);
});

test("the level page shows no 未出現／在場／已進點 counts", async ({ page }) => {
  await page.goto("#/level/main_01-07?v=normal");
  await seek(page, 35);

  for (const label of ["未出現", "在場", "已進點"]) {
    await expect(page.getByText(label, { exact: true })).toHaveCount(0);
  }
});
const tableHeading = (page: Page) =>
  spawnTableRegion(page).getByRole("heading", { name: "出兵表" });
/** The width the page's content gets, inside its side padding. */
const pageWidth = (page: Page) =>
  page.locator("main").evaluate((m) => parseFloat(getComputedStyle(m).width));

test("the spawn table sits right of the map; only the level page is wider than 960px, as wide as the window", async ({
  page,
}) => {
  await page.goto("#/level/main_01-07?v=normal");
  const mapBox = (await map(page).boundingBox())!;
  const tableBox = (await spawnTableRegion(page).boundingBox())!;

  expect(tableBox.x).toBeGreaterThanOrEqual(mapBox.x + mapBox.width);
  expect(tableBox.y).toBeLessThan(mapBox.y + mapBox.height);
  // No drawer: the column cannot be closed.
  await expect(drawerButton(page)).toBeHidden();
  // No cap: the window's width less the page's 16px side padding.
  expect(await pageWidth(page)).toBe(
    (await page.evaluate(() => document.documentElement.clientWidth)) - 32,
  );

  await page.goto("#/");
  await expect(page.locator("main a[href^='#/area/']").first()).toBeVisible();
  expect(await pageWidth(page)).toBeLessThanOrEqual(960);
});

test("ISW-NO ro6_b_1_b_dlc1, the widest spawn table, fits its column without scrolling sideways", async ({
  page,
}) => {
  await page.goto("#/level/ro6_b_1_b_dlc1?v=normal");
  const table = spawnTableRegion(page).locator("table");
  await expect(table.locator("tbody tr").first()).toBeVisible();

  const overflow = await table.evaluate(
    (t) => t.parentElement!.scrollWidth - t.parentElement!.clientWidth,
  );

  expect(overflow).toBe(0);
});

test.describe("short window", () => {
  test.use({ viewport: shortWideWindow });

  test("scrolling the page to the bottom keeps the spawn table on screen", async ({ page }) => {
    await page.goto("#/level/main_01-07?v=normal");
    await expect(map(page)).toBeVisible();

    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));

    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(200);
    await expect(tableHeading(page)).toBeInViewport({ ratio: 1 });
  });

  test("the spawn table's column is as tall as the window and inside it at any page scroll", async ({
    page,
  }) => {
    await page.goto("#/level/main_15-12?v=normal");
    await expect(map(page)).toBeVisible();
    const column = page.locator("#spawn-table-drawer");
    const height = shortWideWindow.height;

    for (const y of [0, 20, 100, Number.MAX_SAFE_INTEGER]) {
      await page.evaluate((y) => scrollTo(0, y), y);
      const box = (await column.boundingBox())!;
      expect(box.y, `scrolled to ${y}`).toBeCloseTo(0, 0);
      expect(box.height, `scrolled to ${y}`).toBeCloseTo(height, 0);
    }
    expect(await page.evaluate(() => scrollY), "the page scrolls").toBeGreaterThan(100);
  });
});

test("the spawn table scrolls in its column, 端點篩選 caption and all, leaving the page", async ({
  page,
}) => {
  // 29 of 15-12's 30 rows leave by 消失點(5, 5): more than a 900px column holds.
  await page.goto("#/level/main_15-12?v=normal");
  await page.getByRole("button", { name: "消失點(5, 5)" }).click();
  const caption = filterCaption(page);
  await spawnTableRegion(page).locator("tbody tr").first().hover();
  const before = (await caption.boundingBox())!.y;
  const pageScroll = await page.evaluate(() => scrollY);

  await page.mouse.wheel(0, 300);

  await expect.poll(async () => (await caption.boundingBox())!.y).toBeLessThan(before - 200);
  expect(await page.evaluate(() => scrollY)).toBe(pageScroll);
});

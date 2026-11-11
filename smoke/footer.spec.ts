import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { StageIndex } from "../src/level/index.ts";
import { drawerButton, phoneWindow, wideWindow } from "./levelPage.ts";

const dist = path.resolve(import.meta.dirname, "..", "dist");
const index = JSON.parse(readFileSync(path.join(dist, "data", "index.json"), "utf8")) as StageIndex;

const links = [
  [
    "陸服",
    "https://github.com/Kengxxiao/ArknightsGameData",
    "資料來源:Kengxxiao/ArknightsGameData",
  ],
  [
    "台服",
    "https://github.com/ArknightsAssets/ArknightsGamedata",
    "資料來源:ArknightsAssets/ArknightsGamedata",
  ],
  [
    "頭像與裝置圖",
    "https://github.com/yuanyan3060/ArknightsGameResource",
    "資料來源:yuanyan3060/ArknightsGameResource",
  ],
  ["參考 PRTS", "https://prts.wiki/w/作战机制", "擋路裝置清單參考 PRTS"],
  ["參考 PRTS.Map", "https://map.ark-nights.com", "出兵表絕對時刻的算法參考 PRTS.Map"],
];

async function expectFooter(page: Page) {
  const footer = page.locator("footer");
  const dataVersion = String.raw`(?: \S+)? · \d{4}-\d{2}-\d{2} \d{2}:\d{2}\(UTC\+8\)`;
  await expect(footer.locator("p").first()).toHaveText(
    new RegExp(
      `^陸服${dataVersion} · 台服${dataVersion} · 頭像與裝置圖 · 參考 PRTS · 參考 PRTS\\.Map$`,
    ),
  );
  for (const [label, href, hint] of links) {
    const link = footer.getByRole("link", { name: label, exact: true });
    await expect(link).toHaveAttribute("href", href!);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await expect(link).toHaveAttribute("title", hint!);
  }
  await expect(footer).toContainText(
    "本站為非官方工具，遊戲內容版權屬於上海鷹角網路科技有限公司(Hypergryph)。",
  );
}

test("the home page ends with the 頁尾: 資料來源, 參考來源 and the copyright notice", async ({
  page,
}) => {
  await page.goto("#/");
  await expectFooter(page);
});

test("an area page ends with the 頁尾", async ({ page }) => {
  await page.goto(`#/area/${index.areas[0]!.id}`);
  await expect(page.locator("a[data-stage]").first()).toBeVisible();
  await expectFooter(page);
});

test.describe("wide screen", () => {
  test.use({ viewport: wideWindow });

  test("a level page ends its left column with the 頁尾, left of the spawn table's column", async ({
    page,
  }) => {
    await page.goto("#/level/main_01-07?v=normal");
    await expect(page.locator("svg.map")).toBeVisible();
    await expectFooter(page);
    const footer = page.locator("footer");

    const column = await footer.evaluate((f) => {
      const parent = f.parentElement!;
      const others = [...parent.children].filter((c) => c !== f);
      return {
        holdsMap: parent.querySelector("svg.map") !== null,
        last: parent.lastElementChild === f,
        othersBottom: Math.max(...others.map((c) => c.getBoundingClientRect().bottom)),
      };
    });
    const box = (await footer.boundingBox())!;
    expect(column.holdsMap, "in the map's column").toBe(true);
    expect(column.last, "last in it").toBe(true);
    expect(box.y, "under the rest of the column").toBeGreaterThanOrEqual(column.othersBottom);

    const side = (await page.locator("#spawn-table-drawer").boundingBox())!;
    expect(box.x + box.width, "left of the spawn table's column").toBeLessThanOrEqual(side.x);
  });
});

test.describe("phone", () => {
  test.use({ viewport: phoneWindow });

  test("scrolled to the bottom of a level page, the 頁尾 ends above the drawer's button", async ({
    page,
  }) => {
    await page.goto("#/level/main_15-12?v=normal");
    await expect(page.locator("svg.map")).toBeVisible();
    await expectFooter(page);

    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));

    expect(await page.evaluate(() => scrollY), "the page scrolls").toBeGreaterThan(0);
    const footer = (await page.locator("footer").boundingBox())!;
    const button = (await drawerButton(page).boundingBox())!;
    expect(footer.y + footer.height).toBeLessThanOrEqual(button.y);
  });
});

test.describe("a level route with no level on screen still ends with the 頁尾, under its message", () => {
  async function expectFooterUnder(page: Page, message: string) {
    const shown = page.getByText(message);
    await expect(shown).toBeVisible();
    await expectFooter(page);
    const box = (await shown.boundingBox())!;
    expect((await page.locator("footer").boundingBox())!.y).toBeGreaterThanOrEqual(
      box.y + box.height,
    );
  }

  test("the level file loading", async ({ page }) => {
    // Never answered: the level file stays loading.
    await page.route("**/data/levels/**", () => {});
    await page.goto("#/level/main_01-07?v=normal");
    await expectFooterUnder(page, "載入中…");
  });

  test("the level file failing to load", async ({ page }) => {
    await page.route("**/data/levels/**", (route) => route.abort());
    await page.goto("#/level/main_01-07?v=normal");
    await expectFooterUnder(page, "資料載入失敗");
  });

  test("no such stage", async ({ page }) => {
    await page.goto("#/level/no_such_stage");
    await expectFooterUnder(page, "找不到關卡 no_such_stage");
  });

  test("no such area", async ({ page }) => {
    await page.goto("#/area/no_such_area");
    await expectFooterUnder(page, "找不到區域 no_such_area");
  });
});

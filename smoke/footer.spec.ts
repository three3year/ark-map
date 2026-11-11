// Smoke test: the 頁尾 in the built site (dist/), against the index the site ships.
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { StageIndex } from "../src/level/index.ts";

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
  await expect(footer).toContainText("陸服 · 台服 · 頭像與裝置圖 · 參考 PRTS · 參考 PRTS.Map");
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

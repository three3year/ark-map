// Smoke test: the 總覽 in the built site (dist/), against the index the site ships.
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { StageIndex } from "../src/level/index.ts";

const dist = path.resolve(import.meta.dirname, "..", "dist");
const index = JSON.parse(readFileSync(path.join(dist, "data", "index.json"), "utf8")) as StageIndex;

test("the overview lists 集成戰略, 主線, 活動, 剿滅作戰 in that order", async ({ page }) => {
  await page.goto("#/");

  await expect(page.locator("h2")).toHaveText(["集成戰略", "主線", "活動", "剿滅作戰"]);
});

test("each overview section keeps the index's area order", async ({ page }) => {
  await page.goto("#/");

  const sections = page.locator("section");
  await expect(sections).toHaveCount(4);
  for (const section of await sections.all()) {
    const shown = await section
      .locator("a[data-area]")
      .evaluateAll((links) => links.map((a) => a.getAttribute("data-area")));
    const kind = index.areas.find((a) => a.id === shown[0])!.kind;
    expect(shown).toEqual(index.areas.filter((a) => a.kind === kind).map((a) => a.id));
  }
});

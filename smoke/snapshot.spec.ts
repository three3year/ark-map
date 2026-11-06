// Smoke test against the built site (dist/), served under a sub-path like GitHub Pages.
// The expected count comes from 基準時間軸 run on the same data the site ships.
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { Level, StageIndex } from "../src/level/index.ts";
import { buildTimeline, takeSnapshot } from "../src/timeline/index.ts";

const dist = path.resolve(import.meta.dirname, "..", "dist");
const readSiteJson = <T>(file: string): T =>
  JSON.parse(readFileSync(path.join(dist, file), "utf8")) as T;

test("1-7 at 35 s shows as many enemy individuals as the timeline has on field", async ({
  page,
}) => {
  const stage = readSiteJson<StageIndex>("data/index.json")
    .areas.flatMap((a) => a.sections.flatMap((s) => s.stages))
    .find((s) => s.id === "main_01-07");
  expect(stage, "the built site publishes 1-7").toBeDefined();
  const level = readSiteJson<Level>(stage!.variants[0]!.levelFile);
  const expected = takeSnapshot(buildTimeline(level), 35).counts.onField;
  expect(expected, "1-7 has enemies on field at 35 s").toBeGreaterThan(0);

  await page.goto("#/level/main_01-07?t=35");

  await expect(page.locator("svg.map g.enemy")).toHaveCount(expected);
});

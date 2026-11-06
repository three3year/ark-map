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

function siteStage(id: string) {
  const stage = readSiteJson<StageIndex>("data/index.json")
    .areas.flatMap((a) => a.sections.flatMap((s) => s.stages))
    .find((s) => s.id === id);
  expect(stage, `the built site publishes ${id}`).toBeDefined();
  return stage!;
}

test("1-7 at 35 s shows as many enemy individuals as the timeline has on field", async ({
  page,
}) => {
  const stage = siteStage("main_01-07");
  const level = readSiteJson<Level>(stage.variants[0]!.levelFile);
  const expected = takeSnapshot(buildTimeline(level), 35).counts.onField;
  expect(expected, "1-7 has enemies on field at 35 s").toBeGreaterThan(0);

  await page.goto("#/level/main_01-07?t=35");

  await expect(page.locator("svg.map g.enemy")).toHaveCount(expected);
});

test("4-4 challenge runs its 難度修正 move speed and lists its modifiers", async ({ page }) => {
  const stage = siteStage("main_04-04");
  const level = readSiteJson<Level>(stage.variants[0]!.levelFile);
  const normal = buildTimeline(level);
  const challenge = buildTimeline(level, { difficulty: "FOUR_STAR" });
  // The first whole second at which the two variants have different counts on field.
  const onField = (timeline: typeof normal, t: number) => takeSnapshot(timeline, t).counts.onField;
  const t = Array.from({ length: 300 }, (_, i) => i).find(
    (s) => onField(normal, s) !== onField(challenge, s),
  );
  expect(t, "challenge and normal differ at some second").toBeDefined();

  await page.goto(`#/level/main_04-04?v=challenge&t=${t}`);

  await expect(page.locator("svg.map g.enemy")).toHaveCount(onField(challenge, t!));
  const moveModifier = page.locator('[data-modifier="ebuff_attribute"]');
  await expect(moveModifier).toContainText("移速");
  await expect(moveModifier).toContainText("計入移速");
  await expect(page.locator(".level-info dd")).toHaveCount(4);
});

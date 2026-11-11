import { expect, test, type Page } from "@playwright/test";
import { cellKey } from "../src/level/index.ts";
import { buildTimeline } from "../src/timeline/index.ts";
import {
  conditionalSwitch,
  deviceByIndex,
  deviceIndex,
  devicesByKind,
  drawnAt,
  enemyOnMap,
  expectVariantShown,
  seek,
  setConditionalSecond,
  siteLevel,
} from "./levelPage.ts";

const frameWidth = (page: Page, key: string) =>
  devicesByKind(page, key)
    .first()
    .locator(".device-frame")
    .evaluate((el) => parseFloat(getComputedStyle(el).strokeWidth));

test("TB-1 draws its 8 碎石 at their cells, framed more boldly than its 留聲機", async ({
  page,
}) => {
  const level = siteLevel("act10mini_01");
  const stones = level.devices.filter((d) => d.key === "trap_027_stone");
  expect(stones).toHaveLength(8);
  const towers = level.devices.filter((d) => d.key === "trap_014_tower");

  await page.goto("#/level/act10mini_01?v=normal");

  const drawn = devicesByKind(page, "trap_027_stone");
  await expect(drawn).toHaveCount(8);
  const cells = await drawn.evaluateAll((els) => els.map((e) => e.getAttribute("data-cell")));
  expect(cells.sort()).toEqual(stones.map((d) => cellKey(d.cell)).sort());
  await expect(drawn.first()).toHaveAccessibleName("碎石");
  await expect(drawn.first().locator("image")).toHaveAttribute("href", stones[0]!.image!);
  await expect(page.locator('svg.map [data-device][data-blocker="true"]')).toHaveCount(8);

  await expect(devicesByKind(page, "trap_014_tower")).toHaveCount(towers.length);
  expect(await frameWidth(page, "trap_027_stone")).toBeGreaterThan(
    await frameWidth(page, "trap_014_tower"),
  );
});

test("WR-EX-6: normal draws none of the 3 hidden 障礙物; challenge, whose 難度修正 enables them, draws all 3", async ({
  page,
}) => {
  const crates = siteLevel("act16d5_ex06").devices.filter((d) => d.key === "trap_001_crate");
  expect(crates.map((d) => d.hidden)).toEqual([true, true, true]);

  await page.goto("#/level/act16d5_ex06?v=normal");
  await expectVariantShown(page, "normal");
  await expect(page.locator("svg.map .tile").first()).toBeVisible();
  await expect(devicesByKind(page, "trap_001_crate")).toHaveCount(0);

  await page.goto("#/level/act16d5_ex06?v=challenge");
  await expectVariantShown(page, "challenge");
  await expect(devicesByKind(page, "trap_001_crate")).toHaveCount(3);
});

test("TB-1: a selected enemy going round the 碎石 is where the timeline puts it", async ({
  page,
}) => {
  const level = siteLevel("act10mini_01");
  const timeline = buildTimeline(level);
  const bare = buildTimeline({ ...level, devices: [] });
  const moved = (t: number) =>
    timeline.individuals.find((individual, i) => {
      const a = individual.stateAt(t);
      const b = bare.individuals[i]!.stateAt(t);
      return (
        a.kind === "onField" &&
        b.kind === "onField" &&
        Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y) > 1
      );
    });
  const t = Array.from({ length: 300 }, (_, s) => s).find((s) => moved(s));
  expect(t, "some TB-1 individual goes round the 碎石").toBeDefined();
  const individual = moved(t!)!;
  const state = individual.stateAt(t!);
  if (state.kind !== "onField") throw new Error("on the field by construction");
  const mark = enemyOnMap(page, individual.id);

  await page.goto("#/level/act10mini_01?v=normal");
  await seek(page, t!);
  await mark.press("Enter");

  await expect(page.locator("p.selection")).toHaveAttribute("data-selected", individual.id);
  const { x, y } = await drawnAt(page, level, individual.id);
  expect(x).toBeCloseTo(state.position.x, 3);
  expect(y).toBeCloseTo(state.position.y, 3);
});

test("EP-8: the hidden 加農炮 HidenCnnon activates appears from the 條件出兵's trigger second", async ({
  page,
}) => {
  const level = siteLevel("act39side_08");
  const branch = level.branches.findIndex((b) => b.key === "HidenCnnon");
  const cannon = deviceIndex(level, "trap_196_cnnon#3");
  expect(level.devices[cannon]!.hidden).toBe(true);
  const trigger = 20;
  const switches = { conditional: { [branch]: { wave: 0, t: trigger } } };
  const on = (t: number) =>
    buildTimeline(level, { switches })
      .devicesAt(t)
      .some((d) => d.index === cannon);
  expect([on(trigger - 1), on(trigger)]).toEqual([false, true]);

  await page.goto("#/level/act39side_08?v=normal");
  await expect(page.locator("svg.map .tile").first()).toBeVisible();
  await expect(deviceByIndex(page, cannon)).toHaveCount(0);
  await conditionalSwitch(page, branch).check();
  await setConditionalSecond(page, branch, trigger);

  await seek(page, trigger - 1);
  await expect(deviceByIndex(page, cannon)).toHaveCount(0);
  await seek(page, trigger);
  await expect(deviceByIndex(page, cannon)).toHaveCount(1);
});

// 移除: right-clicking a 擋路裝置 removes it from the playback position on; enemies re-route.
import { expect, test, type Page } from "@playwright/test";
import type { Cell, Level } from "../src/level/index.ts";
import {
  buildTimeline,
  takeSnapshot,
  timelineEnd,
  type Individual,
  type Removals,
  type Timeline,
} from "../src/timeline/index.ts";
import {
  deviceOnMap,
  enemyOnMap,
  expectVariantShown,
  seek,
  shownOpacity,
  siteLevel,
  watchMenuCancelled,
  wideWindow,
} from "./levelPage.ts";

test.use({ viewport: wideWindow });

/** No enemy within a cell of `cell` at `t`, so a right-click there lands on the device. */
const clearAround = (timeline: Timeline, t: number, { row, col }: Cell) =>
  takeSnapshot(timeline, t).onField.every(
    ({ position }) => Math.hypot(position.x - col, position.y - row) > 1,
  );

const apart = (a: Individual, b: Individual, t: number) => {
  const sa = a.stateAt(t);
  const sb = b.stateAt(t);
  return (
    sa.kind === "onField" &&
    sb.kind === "onField" &&
    Math.hypot(sa.position.x - sb.position.x, sa.position.y - sb.position.y) > 0.5
  );
};

/**
 * A 碎石 of TB-1, a whole second `moment` to remove it at and a later whole second `later` at which
 * some individual on the field at `moment` stands elsewhere for it; the 碎石's cell is clear of
 * enemies at `moment - 1`, `moment` and `later`, with and without the removal.
 */
function removalThatTurnsSomeone(level: Level) {
  const kept = buildTimeline(level);
  const end = Math.ceil(timelineEnd(kept));
  for (let moment = 1; moment <= end; moment++) {
    for (const [index, device] of level.devices.entries()) {
      if (device.key !== "trap_027_stone") continue;
      const removals: Removals = new Map([[index, { wave: 0, t: moment }]]);
      const removed = buildTimeline(level, { removals });
      const clear = (t: number) =>
        clearAround(kept, t, device.cell) && clearAround(removed, t, device.cell);
      if (!clear(moment - 1) || !clear(moment)) continue;
      for (let later = moment + 1; later <= moment + 20; later++) {
        if (!clear(later)) continue;
        const i = removed.individuals.findIndex(
          (individual, k) =>
            individual.stateAt(moment).kind === "onField" &&
            apart(individual, kept.individuals[k]!, later),
        );
        if (i >= 0) {
          const individual = removed.individuals[i]!;
          return { index, moment, later, individual, kept: kept.individuals[i]! };
        }
      }
    }
  }
  throw new Error("no 碎石 whose removal turns someone on the field");
}

/** Where enemy `id` is drawn, in model coordinates. */
async function drawnAt(page: Page, level: Level, id: string) {
  const [x, svgY] = (await enemyOnMap(page, id).getAttribute("transform"))!
    .match(/translate\((\S+) (\S+)\)/)!
    .slice(1)
    .map(Number);
  return { x: x!, y: level.map.height - 1 - svgY! };
}

async function expectDrawnAt(page: Page, level: Level, individual: Individual, t: number) {
  const state = individual.stateAt(t);
  if (state.kind !== "onField") throw new Error("on the field by construction");
  const { x, y } = await drawnAt(page, level, individual.id);
  expect(x).toBeCloseTo(state.position.x, 3);
  expect(y).toBeCloseTo(state.position.y, 3);
}

const removedFrame = (page: Page, index: number) =>
  deviceOnMap(page, index).and(page.locator("[data-removed]"));
const clock = (page: Page, index: number) => deviceOnMap(page, index).locator(".removal-clock");

test("TB-1: right-click a 碎石 to remove it from the playback position on; enemies turn there", async ({
  page,
}) => {
  const level = siteLevel("act10mini_01");
  const { index, moment, later, individual, kept } = removalThatTurnsSomeone(level);

  await page.goto("#/level/act10mini_01?v=normal");
  await seek(page, moment);
  const lastMenuCancelled = await watchMenuCancelled(page);
  const url = page.url();
  await deviceOnMap(page, index).click({ button: "right" });

  // Removed at the playback position: it is gone at once, a faint dashed frame on its cell.
  expect(await lastMenuCancelled()).toBe("true");
  await expect(removedFrame(page, index)).toHaveCount(1);
  expect(await shownOpacity(removedFrame(page, index))).toBeLessThan(0.4);
  expect(page.url()).toBe(url);

  // Earlier, it stands as before, with a clock naming the 移除時刻.
  await seek(page, moment - 1);
  await expect(removedFrame(page, index)).toHaveCount(0);
  await expect(deviceOnMap(page, index)).toHaveCount(1);
  await expect(clock(page, index).locator("title")).toHaveText(`第 1 波 第 ${moment} 秒移除`);

  // Past the 移除時刻 again, removed; the individual it turns is where the timeline puts it.
  await seek(page, later);
  await expect(removedFrame(page, index)).toHaveCount(1);
  await enemyOnMap(page, individual.id).press("Enter");
  await expect(page.locator("p.selection")).toHaveAttribute("data-selected", individual.id);
  await expectDrawnAt(page, level, individual, later);

  // A right-click on the dashed frame puts it back: the individual walks as it did.
  await removedFrame(page, index).click({ button: "right" });
  await expect(removedFrame(page, index)).toHaveCount(0);
  await expect(clock(page, index)).toHaveCount(0);
  await expectDrawnAt(page, level, kept, later);
});

test("TB-1: a right-click before the 移除時刻 moves it to the playback position", async ({
  page,
}) => {
  const level = siteLevel("act10mini_01");
  const { index, moment } = removalThatTurnsSomeone(level);

  await page.goto("#/level/act10mini_01?v=normal");
  await seek(page, moment);
  await deviceOnMap(page, index).click({ button: "right" });
  await seek(page, moment - 1);
  await expect(clock(page, index)).toHaveCount(1);

  await deviceOnMap(page, index).click({ button: "right" });

  await expect(clock(page, index)).toHaveCount(0);
  await expect(removedFrame(page, index)).toHaveCount(1);
  await seek(page, moment - 2);
  await expect(clock(page, index).locator("title")).toHaveText(`第 1 波 第 ${moment - 1} 秒移除`);
});

test("TB-1: a right-click on a 留聲機, not a 擋路裝置, does nothing and opens no menu", async ({
  page,
}) => {
  const level = siteLevel("act10mini_01");
  const tower = level.devices.findIndex((d) => d.key === "trap_014_tower");
  expect(level.devices[tower]!.blocker).toBe(false);
  const t = Array.from({ length: 60 }, (_, s) => s).find((s) =>
    clearAround(buildTimeline(level), s, level.devices[tower]!.cell),
  )!;

  await page.goto("#/level/act10mini_01?v=normal");
  await seek(page, t);
  const lastMenuCancelled = await watchMenuCancelled(page);
  await deviceOnMap(page, tower).click({ button: "right" });

  expect(await lastMenuCancelled()).toBe("true");
  await expect(removedFrame(page, tower)).toHaveCount(0);
  await expect(page.locator("svg.map g.device[data-removed]")).toHaveCount(0);
  await expect(page.locator("svg.map .removal-clock")).toHaveCount(0);
});

test("TB-1: another variant, even on the same level file, puts every 碎石 back", async ({
  page,
}) => {
  const level = siteLevel("act10mini_01");
  const { index, moment } = removalThatTurnsSomeone(level);

  await page.goto("#/level/act10mini_01?v=normal");
  await seek(page, moment);
  await deviceOnMap(page, index).click({ button: "right" });
  await expect(removedFrame(page, index)).toHaveCount(1);

  await page.locator('button[data-variant="challenge"]').click();
  await expectVariantShown(page, "challenge");
  await expect(page.locator("svg.map g.device[data-removed]")).toHaveCount(0);

  await page.locator('button[data-variant="normal"]').click();
  await expectVariantShown(page, "normal");
  await expect(page.locator("svg.map g.device[data-removed]")).toHaveCount(0);
  await expect(deviceOnMap(page, index)).toHaveCount(1);
  await seek(page, moment - 1);
  await expect(page.locator("svg.map .removal-clock")).toHaveCount(0);
});

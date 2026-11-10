// Only an enemy's round avatar takes clicks: its 停留 bar, seconds left and 無害 tag let a click
// through to whatever lies below. Expected moments come from the data the built site ships.
import { expect, test, type Page } from "@playwright/test";
import type { Level } from "../src/level/index.ts";
import {
  buildTimeline,
  matchesEndpoint,
  routeEndpoints,
  takeSnapshot,
  type Snapshot,
  type Timeline,
} from "../src/timeline/index.ts";
import { endpointDot, enemyOnMap, seek, shownOpacity, siteLevel, stayBarOf } from "./levelPage.ts";

type OnField = Snapshot["onField"][number];
interface Point {
  x: number;
  y: number;
}

/** Map units, SVG y pointing down as drawn, so offsets read like MapView's. */
const drawn = (level: Level, { x, y }: Point): Point => ({ x, y: level.map.height - 1 - y });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** An avatar's radius is 0.36; clear of it by a margin, or well inside it. */
const clearOfAvatar = 0.46;
const insideAvatar = 0.28;

/** Nothing but enemies takes a click near `p`: no device, no 出生點 or 消失點 dot. */
function clearOfOthers(level: Level, timeline: Timeline, p: Point): boolean {
  const nearDevice = level.devices.some(({ cell }) => {
    const d = drawn(level, { x: cell.col, y: cell.row });
    return Math.abs(d.x - p.x) < 0.45 && Math.abs(d.y - p.y) < 0.45;
  });
  // Dots sit in their cell's top-right corner.
  const nearDot = routeEndpoints(timeline).some(({ cell }) => {
    const d = drawn(level, { x: cell.col, y: cell.row });
    return distance({ x: d.x + 0.21, y: d.y - 0.32 }, p) < 0.4;
  });
  return !nearDevice && !nearDot;
}

/** Where along the bar's track the click lands: share of the bar's width from its left end. */
const alongBar = [0.1, 0.25, 0.5, 0.75, 0.9];
const stayBarWidth = 0.64;

/** The centre line of `e`'s 停留 bar at share `along` of its width, in drawn map units. */
function onBar(level: Level, e: OnField, along: number): Point {
  const centre = drawn(level, e.position);
  const top = e.individual.harmless ? -0.74 : -0.52;
  return { x: centre.x + (along - 0.5) * stayBarWidth, y: centre.y + top + 0.04 };
}

/** A whole second at which some enemy stands still, a spot on its bar passing `accepts`. */
function findStay(level: Level, accepts: (at: Point, others: OnField[]) => boolean) {
  const timeline = buildTimeline(level);
  for (let t = 0; t < 300; t++) {
    const onField = takeSnapshot(timeline, t).onField;
    for (const staying of onField) {
      // Still standing a second either side, so seeking lands well inside the stay.
      if (!staying.stay || staying.stay.start > t - 1 || staying.stay.end < t + 1) continue;
      for (const along of alongBar) {
        const at = onBar(level, staying, along);
        if (!clearOfOthers(level, timeline, at)) continue;
        if (distance(drawn(level, staying.position), at) < clearOfAvatar) continue;
        const others = onField.filter((e) => e !== staying);
        if (accepts(at, others)) return { t, staying, along, at, others };
      }
    }
  }
  return undefined;
}

/** Click the screen point at share `along` of the bar's track, in the flat view. */
async function clickBar(page: Page, id: string, along: number, button?: "right") {
  const bar = stayBarOf(page, id);
  await bar.scrollIntoViewIfNeeded();
  const track = (await bar.locator("rect").first().boundingBox())!;
  await page.mouse.click(track.x + along * track.width, track.y + track.height / 2, { button });
}

async function flatView(page: Page) {
  await page.getByRole("button", { name: "平面俯視" }).click();
}

/** The one enemy whose avatar `at` is well inside, clear of every other avatar. */
function onlyAvatarUnder(level: Level, at: Point, others: OnField[]): OnField | undefined {
  const near = others.filter((e) => distance(drawn(level, e.position), at) < clearOfAvatar);
  return near.length === 1 && distance(drawn(level, near[0]!.position), at) < insideAvatar
    ? near[0]
    : undefined;
}

const selectedEnemies = (page: Page) => page.locator('svg.map g.enemy[aria-pressed="true"]');

test("1-3: clicking a 停留 bar over another enemy selects the enemy below", async ({ page }) => {
  const level = siteLevel("main_01-03");
  const found = findStay(level, (at, others) => !!onlyAvatarUnder(level, at, others));
  expect(found, "1-3 has a 停留 bar over another enemy's avatar").toBeDefined();
  const { t, staying, along, at, others } = found!;
  const below = onlyAvatarUnder(level, at, others)!;

  await page.goto("#/level/main_01-03?v=normal");
  await flatView(page);
  await seek(page, t);
  await clickBar(page, staying.individual.id, along);

  await expect(enemyOnMap(page, below.individual.id)).toHaveAttribute("aria-pressed", "true");
  await expect(selectedEnemies(page)).toHaveCount(1);
});

test("1-3: clicking a 停留 bar over bare ground neither selects nor 收起 its enemy", async ({
  page,
}) => {
  const level = siteLevel("main_01-03");
  const found = findStay(level, (at, others) =>
    others.every((e) => distance(drawn(level, e.position), at) > clearOfAvatar),
  );
  expect(found, "1-3 has a 停留 bar over bare ground").toBeDefined();
  const { t, staying, along } = found!;
  const enemy = enemyOnMap(page, staying.individual.id);

  await page.goto("#/level/main_01-03?v=normal");
  await flatView(page);
  await seek(page, t);
  await clickBar(page, staying.individual.id, along);

  await expect(selectedEnemies(page)).toHaveCount(0);

  await clickBar(page, staying.individual.id, along, "right");

  // A 收起 enemy that is not selected is not drawn.
  await expect(enemy).toHaveCount(1);
  await expect(page.getByText(/^已收起/)).toHaveCount(0);
});

test("12-14: clicking an enemy's 無害 tag does not select it", async ({ page }) => {
  const level = siteLevel("main_12-14");
  const timeline = buildTimeline(level);
  let found: { t: number; harmless: OnField } | undefined;
  for (let t = 0; t < 300 && !found; t++) {
    const onField = takeSnapshot(timeline, t).onField;
    const harmless = onField.find((e) => {
      if (!e.individual.harmless) return false;
      const centre = drawn(level, e.position);
      // The tag sits right above the avatar, about 0.4 wide.
      const tag = { x: centre.x, y: centre.y - 0.5 };
      return (
        clearOfOthers(level, timeline, tag) &&
        onField.every((o) => o === e || distance(drawn(level, o.position), tag) > 0.7)
      );
    });
    if (harmless) found = { t, harmless };
  }
  expect(found, "12-14 has a 無害 enemy with nothing near its tag").toBeDefined();
  const { t, harmless } = found!;
  const enemy = enemyOnMap(page, harmless.individual.id);
  const tag = enemy.locator("text", { hasText: "無害" });

  await page.goto("#/level/main_12-14?v=normal");
  await flatView(page);
  await seek(page, t);
  await tag.scrollIntoViewIfNeeded();
  const box = (await tag.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  await expect(enemy).toHaveAttribute("aria-pressed", "false");
  await expect(selectedEnemies(page)).toHaveCount(0);
});

test("4-10: 停留 bars are drawn over every enemy and 等 N 秒 label, faded with their enemy", async ({
  page,
}) => {
  const level = siteLevel("main_04-10");
  const timeline = buildTimeline(level);
  const t = Array.from({ length: 300 }, (_, i) => i).find((s) =>
    takeSnapshot(timeline, s).onField.some((e) => e.stay && e.stay.start <= s - 1),
  );
  expect(t, "4-10 has an enemy standing still").toBeDefined();
  const { individual } = takeSnapshot(timeline, t!).onField.find(
    (e) => e.stay && e.stay.start <= t! - 1,
  )!;
  const bar = stayBarOf(page, individual.id);

  await page.goto("#/level/main_04-10?v=normal");
  await seek(page, t!);
  // Selected, its 路徑 shows the 等 N 秒 label of the stay it is in.
  await enemyOnMap(page, individual.id).press("Enter");
  const waitLabel = page.locator("svg.map text", { hasText: /^等 [\d.]+ 秒$/ }).first();
  await expect(waitLabel).toHaveCount(1);

  const drawnAfter = await page.evaluate(() => {
    const bars = [...document.querySelectorAll("svg.map [data-stay]")];
    const below = [
      ...document.querySelectorAll("svg.map g.enemy"),
      ...[...document.querySelectorAll("svg.map text")].filter((e) =>
        /^等 [\d.]+ 秒$/.test(e.textContent ?? ""),
      ),
    ];
    return (
      bars.length > 0 &&
      bars.every((b) =>
        below.every((e) => e.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING),
      )
    );
  });
  expect(drawnAfter, "every 停留 bar follows every enemy and 等 N 秒 label").toBe(true);

  const elsewhere = routeEndpoints(timeline).find((e) => !matchesEndpoint(individual, e))!;
  await endpointDot(page, elsewhere).click();

  await expect(enemyOnMap(page, individual.id)).toHaveAttribute("data-filtered-out");
  expect(await shownOpacity(bar.locator("rect").first())).toBeCloseTo(0.4, 2);
});

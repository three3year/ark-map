// Level page controls as a player uses them: 播放位置 lives on the page, not in the URL.
// Expected values come from the same data the built site (dist/) ships.
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";
import {
  cellKey,
  withNames,
  type Cell,
  type Difficulty,
  type Level,
  type LevelFile,
  type NameTable,
  type StageEntry,
  type StageIndex,
  type Vec2,
} from "../src/level/index.ts";
import {
  actionKey,
  spawnPlan,
  takeSnapshot,
  type EndpointPlace,
  type SpawnRow,
  type Timeline,
} from "../src/timeline/index.ts";

const dist = path.resolve(import.meta.dirname, "..", "dist");

/** A JSON file of the built site. */
export const readSiteJson = <T>(file: string): T =>
  JSON.parse(readFileSync(path.join(dist, file), "utf8")) as T;

/** Stage `id` in the built site's index. */
export function siteStage(id: string): StageEntry {
  const stage = readSiteJson<StageIndex>("data/index.json")
    .areas.flatMap((a) => a.sections.flatMap((s) => s.stages))
    .find((s) => s.id === id);
  expect(stage, `the built site publishes ${id}`).toBeDefined();
  return stage!;
}

/** A level file of the built site, its names filled back in as the browser does. */
export const readSiteLevel = (file: string): Level =>
  withNames(readSiteJson<LevelFile>(file), readSiteJson<NameTable>("data/names.json"));

/** The level of stage `id`'s first variant. */
export const siteLevel = (id: string): Level => readSiteLevel(siteStage(id).variants[0]!.levelFile);

/**
 * A window clearly wider than the level page's breakpoint, where the spawn table sits in a column
 * beside the map. Tests that use the spawn table run in it, so they do not depend on the narrow
 * layout. Desktop Chrome's default 1280px is below the breakpoint.
 */
export const wideWindow = { width: 1600, height: 900 };

/**
 * As wide as `wideWindow` but short: the page scrolls well past the spawn table's heading, and the
 * spawn table's column shows few rows at once.
 */
export const shortWideWindow = { width: wideWindow.width, height: 500 };

/** A phone's window, well below the breakpoint: the spawn table is in a drawer. */
export const phoneWindow = { width: 390, height: 844 };

/** The spawn table, in its column or its drawer. */
export const spawnTableRegion = (page: Page) => page.getByRole("region", { name: "出兵表" });

/** The spawn table's row for `row`. */
export const rowOf = (page: Page, row: SpawnRow) =>
  page.locator(`tr[data-wave="${row.waveIndex}"][data-action="${actionKey(row)}"]`);

export const orderCell = (row: Locator) => {
  const heading = 'ancestor::table[1]/thead/tr/th[normalize-space()="次序"]';
  return row.locator(`xpath=*[${heading}][count(${heading}/preceding-sibling::*) + 1]`);
};

/** The button that opens and closes the spawn table's drawer, below the breakpoint. */
export const drawerButton = (page: Page) => page.getByRole("button", { name: "出兵表" });

/** The spawn table's caption naming the 端點篩選, there only while one is on. */
export const filterCaption = (page: Page) => page.locator("[data-endpoint-filter]");

/** Enemy individual `id` on the map. */
export const enemyOnMap = (page: Page, id: string) =>
  page.locator(`svg.map g.enemy[data-individual="${id}"]`);

/** The 停留 bar over enemy individual `id`, with its seconds left, on the map's top layer. */
export const stayBarOf = (page: Page, id: string) => page.locator(`svg.map [data-stay="${id}"]`);

/** The 座標 enemy individual `id` is drawn at. */
export async function drawnAt(page: Page, level: Level, id: string): Promise<Vec2> {
  const [x, svgY] = (await enemyOnMap(page, id).getAttribute("transform"))!
    .match(/translate\((\S+) (\S+)\)/)!
    .slice(1)
    .map(Number);
  return { x: x!, y: level.map.height - 1 - svgY! };
}

/** No individual on the field at `t` within a cell of `cell`. */
export const clearAround = (timeline: Timeline, t: number, { row, col }: Cell) =>
  takeSnapshot(timeline, t).onField.every(
    ({ position }) => Math.hypot(position.x - col, position.y - row) > 1,
  );

/** The device at `index` of `Level.devices` on the map. */
export const deviceByIndex = (page: Page, index: number) =>
  page.locator(`svg.map g.device[data-device-index="${index}"]`);

/** Every device of kind `key` on the map. */
export const devicesByKind = (page: Page, key: string) =>
  page.locator(`svg.map [data-device="${key}"]`);

export async function watchMenuCancelled(page: Page) {
  await page.evaluate(() => {
    addEventListener("contextmenu", (e) => {
      document.body.dataset.menuCancelled = String(e.defaultPrevented);
    });
  });
  return () => page.evaluate(() => document.body.dataset.menuCancelled);
}

/** The map's 出生點 or 消失點 dot on `cell`. */
export const endpointDot = (page: Page, { kind, cell }: EndpointPlace) =>
  page.locator(`svg.map [data-endpoint="${kind}"][data-cell="${cellKey(cell)}"]`);

/** Open `hash` in a fresh page load, as pasting a link into a new tab does. */
export async function openLink(page: Page, hash: string) {
  await page.goto("about:blank");
  await page.goto(hash);
}

export const timeDisplay = (page: Page) => page.locator(".controls output");

export const timeSlider = (page: Page) => page.getByRole("slider", { name: "時間軸" });

export const playButton = (page: Page) => page.getByRole("button", { name: "播放", exact: true });

/** Drag the time slider to `t` seconds. */
export async function seek(page: Page, t: number) {
  await timeSlider(page).fill(String(t));
  await expect(timeDisplay(page)).toHaveText(`${t.toFixed(1)} 秒`);
}

/** Press the button of the 0-based `wave`. */
export async function selectWave(page: Page, wave: number) {
  await page.getByRole("radio", { name: `第 ${wave + 1} 波` }).click();
}

const switchPanel = (page: Page) => page.getByRole("region", { name: "開關" });

/** The on/off switch of 條件出兵 `branch` (0-based, level-file order). */
export const conditionalSwitch = (page: Page, branch: number) =>
  switchPanel(page).locator(`[data-conditional="${branch}"] input[type="checkbox"]`);

/** Type `seconds` as the trigger second of 條件出兵 `branch`, already switched on. */
export async function setConditionalSecond(page: Page, branch: number, seconds: number) {
  const second = switchPanel(page).locator(`[data-conditional="${branch}"] input[type="number"]`);
  await second.fill(String(seconds));
  await second.press("Enter");
}

/**
 * The switch panel shows the variant's default 開關狀態: each 隱藏組 on or off by its 難度修正,
 * each 隨機出兵組 on its default pick, every 條件出兵 off.
 */
export async function expectDefaultSwitches(page: Page, level: Level, difficulty: Difficulty) {
  const { hidden, random } = spawnPlan(level, difficulty).groups;
  for (const group of hidden) {
    const box = page.locator(`input[data-hidden-group="${group.name}"]`);
    if (group.defaultOn) await expect(box).toBeChecked();
    else await expect(box).not.toBeChecked();
  }
  for (const [i, group] of random.entries()) {
    await expect(page.locator(`select[data-random-group="${i}"]`)).toHaveValue(
      String(group.defaultPick),
    );
  }
  await expect(
    switchPanel(page).locator('[data-conditional] input[type="checkbox"]:checked'),
  ).toHaveCount(0);
}

/** The variant buttons show `variant` as the one on screen. */
export async function expectVariantShown(page: Page, variant: string) {
  await expect(page.locator(`button[data-variant="${variant}"]`)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
}

/** The opacity `locator` is drawn with: its own times every ancestor's. */
export function shownOpacity(locator: Locator): Promise<number> {
  return locator.evaluate((el) => {
    let opacity = 1;
    for (let e: Element | null = el; e; e = e.parentElement) {
      opacity *= Number(getComputedStyle(e).opacity);
    }
    return opacity;
  });
}

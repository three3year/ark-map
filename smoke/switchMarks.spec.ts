import { expect, test, type Locator, type Page } from "@playwright/test";
import type { Cell, Level, Vec2 } from "../src/level/index.ts";
import {
  buildTimeline,
  matchesEndpoint,
  routeEndpoints,
  sameAction,
  spawnTable,
  switchMarkKinds,
  takeSnapshot,
  type DeviceSwitchMark,
  type Individual,
  type SpawnSwitches,
  type TimelineOptions,
} from "../src/timeline/index.ts";
import {
  clearAround,
  conditionalSwitch,
  deviceByIndex,
  endpointDot,
  enemyOnMap,
  rowOf,
  seek,
  selectWave,
  shownOpacity,
  siteLevel,
  siteStage,
  wideWindow,
} from "./levelPage.ts";

test.use({ viewport: wideWindow });

const marksIn = (scope: Locator) =>
  scope
    .locator("[data-switch-mark]")
    .evaluateAll((marks) =>
      marks.map((m) => `${m.getAttribute("data-switch-mark")} ${m.dataset.switchMarkNumber}`),
    );

const switchPanel = (page: Page) => page.getByRole("region", { name: "開關" });

function panelItem(page: Page, mark: DeviceSwitchMark): Locator {
  const panel = switchPanel(page);
  if (mark.kind === "conditional") return panel.locator(`[data-conditional="${mark.branchIndex}"]`);
  if (mark.kind === "hiddenGroup") {
    return panel
      .locator("label")
      .filter({ has: page.locator(`[data-hidden-group="${mark.name}"]`) });
  }
  return panel
    .locator("label")
    .filter({ has: page.locator(`[data-random-group="${mark.group}"]`) });
}

/** DS-2: its 開關 switched on, its rows carry all three kinds of mark. */
const everyKindStage = "act1dp_s02";

function allSwitchedOn(level: Level): { spawning: number[]; switches: SpawnSwitches } {
  const spawning = level.branches.flatMap((b, i) => (b.deviceOnly ? [] : [i]));
  const conditional = Object.fromEntries(spawning.map((i) => [i, { wave: 0, t: 0 }]));
  return { spawning, switches: { conditional, hiddenOn: ["random"] } };
}

async function switchAllOn(page: Page, spawning: number[]) {
  await page.locator('input[data-hidden-group="random"]').check();
  for (const branch of spawning) await conditionalSwitch(page, branch).check();
}

const legendKinds = (page: Page) =>
  page
    .getByRole("list", { name: "圖例" })
    .locator("[data-switch-mark]")
    .evaluateAll((marks) => marks.map((m) => m.getAttribute("data-switch-mark")));

const markBoxes = (enemy: Locator) =>
  enemy.locator("[data-switch-mark]").evaluateAll((marks) =>
    marks.map((m) => {
      const { left, top, width, height } = m.getBoundingClientRect();
      return { left, top, width, height };
    }),
  );

type Box = { left: number; top: number; width: number; height: number };
/** A point near a mark's bottom-right corner, beyond the avatar's ring. */
const outerCorner = ({ left, top, width, height }: Box): [number, number] => [
  left + width * 0.85,
  top + height * 0.85,
];
/** A point near a mark's top-left corner, over the avatar. */
const innerCorner = ({ left, top, width, height }: Box): [number, number] => [
  left + width * 0.15,
  top + height * 0.15,
];

test("DS-2: each row's marks are the 開關面板's marks for the same 開關; a 純機關 has none", async ({
  page,
}) => {
  const level = siteLevel(everyKindStage);
  const difficulty = siteStage(everyKindStage).variants[0]!.difficulty;
  const { spawning, switches } = allSwitchedOn(level);
  const rows = spawnTable(level, { difficulty, switches });
  const marks = rows.flatMap((r) => r.marks);
  expect(new Set(marks.map((m) => m.kind))).toEqual(
    new Set(["conditional", "hiddenGroup", "random"]),
  );
  expect(marks.some((m) => m.kind === "conditional" && m.number !== m.branchIndex + 1)).toBe(true);

  await page.goto(`#/level/${everyKindStage}?v=normal`);
  await switchAllOn(page, spawning);
  await expect(page.locator("tr[data-action]")).toHaveCount(rows.length);

  for (const row of rows) {
    const shown = row.marks.map((m) => `${m.kind} ${m.number}`);
    expect(await marksIn(rowOf(page, row))).toEqual(shown);
    for (const mark of row.marks) {
      expect(await marksIn(panelItem(page, mark))).toEqual([`${mark.kind} ${mark.number}`]);
    }
  }

  const deviceOnly = switchPanel(page).locator("[data-device-only]");
  await expect(deviceOnly).toHaveCount(level.branches.length - spawning.length);
  await expect(deviceOnly.locator("[data-switch-mark]")).toHaveCount(0);
});

test("DS-2: an enemy's marks on the map are its row's; they let clicks through and fade with it", async ({
  page,
}) => {
  const level = siteLevel(everyKindStage);
  const difficulty = siteStage(everyKindStage).variants[0]!.difficulty;
  const { spawning, switches } = allSwitchedOn(level);
  const rows = spawnTable(level, { difficulty, switches });
  const timeline = buildTimeline(level, { difficulty, switches });
  const endpoints = routeEndpoints(timeline);
  const near = (a: Vec2, b: Vec2, d: number) => Math.hypot(a.x - b.x, a.y - b.y) < d;
  /** Roughly where the marks sit, down and right of the enemy's centre; and an endpoint dot. */
  const marksOffset = 0.33;
  const dotOffset = 0.3;
  const clearOfEnemies = 1.2;
  const clearOfDevices = 0.8;
  const clearOfDots = 0.4;
  const cellAt = ({ col, row }: Cell): Vec2 => ({ x: col, y: row });
  let found: { t: number; individual: Individual } | undefined;
  for (let t = 0; t < 300 && !found; t++) {
    const onField = takeSnapshot(timeline, t).onField;
    const clear = onField.find(({ individual, position, invisible }) => {
      const corner = { x: position.x + marksOffset, y: position.y - marksOffset };
      const dotOf = ({ col, row }: Cell): Vec2 => ({ x: col + dotOffset, y: row + dotOffset });
      return (
        !invisible &&
        individual.marks.length > 0 &&
        onField.every(
          (o) => o.individual === individual || !near(o.position, position, clearOfEnemies),
        ) &&
        level.devices.every(({ cell }) => !near(cellAt(cell), corner, clearOfDevices)) &&
        endpoints.every(({ cell }) => !near(dotOf(cell), corner, clearOfDots))
      );
    });
    if (clear) found = { t, individual: clear.individual };
  }
  expect(found, "act1dp_s02 has an enemy with a mark standing clear").toBeDefined();
  const { t, individual } = found!;
  const row = rows.find((r) => r.waveIndex === 0 && sameAction(r, individual))!;
  const enemy = enemyOnMap(page, individual.id);

  await page.goto(`#/level/${everyKindStage}?v=normal`);
  await switchAllOn(page, spawning);
  await page.getByRole("button", { name: "平面俯視" }).click();
  await seek(page, t);

  const shown = row.marks.map((m) => `${m.kind} ${m.number}`);
  expect(await marksIn(enemy)).toEqual(shown);
  expect(await marksIn(rowOf(page, row))).toEqual(shown);
  for (const mark of row.marks) {
    expect(await marksIn(panelItem(page, mark))).toEqual([`${mark.kind} ${mark.number}`]);
  }

  const [first] = await markBoxes(enemy);
  await page.mouse.click(...outerCorner(first!));
  await expect(enemy).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator('svg.map g.enemy[aria-pressed="true"]')).toHaveCount(0);
  await page.mouse.click(...innerCorner(first!));
  await expect(enemy).toHaveAttribute("aria-pressed", "true");

  const elsewhere = endpoints.find((e) => !matchesEndpoint(individual, e))!;
  await endpointDot(page, elsewhere).click();
  await expect(enemy).toHaveAttribute("data-filtered-out");
  for (const mark of await enemy.locator("[data-switch-mark] rect").all()) {
    expect(await shownOpacity(mark)).toBeCloseTo(0.4, 2);
  }
});

test("DP-1: an enemy of three 開關 has three marks in a row, leftward from the first", async ({
  page,
}) => {
  const stage = "act1dp_01";
  const level = siteLevel(stage);
  const difficulty = siteStage(stage).variants[0]!.difficulty;
  const { spawning, switches } = allSwitchedOn(level);
  const timeline = buildTimeline(level, { difficulty, switches });
  let found: { t: number; individual: Individual } | undefined;
  for (let t = 0; t < 300 && !found; t++) {
    const three = takeSnapshot(timeline, t).onField.find((e) => e.individual.marks.length === 3);
    if (three) found = { t, individual: three.individual };
  }
  expect(found, "act1dp_01 has an enemy with three marks").toBeDefined();
  const { t, individual } = found!;
  const row = spawnTable(level, { difficulty, switches }).find(
    (r) => r.waveIndex === 0 && sameAction(r, individual),
  )!;
  const enemy = enemyOnMap(page, individual.id);

  await page.goto(`#/level/${stage}?v=normal`);
  await switchAllOn(page, spawning);
  await page.getByRole("button", { name: "平面俯視" }).click();
  await seek(page, t);

  expect(await marksIn(enemy)).toEqual(row.marks.map((m) => `${m.kind} ${m.number}`));
  const boxes = await markBoxes(enemy);
  for (let i = 1; i < boxes.length; i++) {
    expect(boxes[i]!.left + boxes[i]!.width).toBeLessThan(boxes[i - 1]!.left);
    expect(boxes[i]!.top).toBeCloseTo(boxes[0]!.top, 0);
  }
});

test("DS-2: the legend lists the mark kinds of the wave's enemies, whatever the second", async ({
  page,
}) => {
  const level = siteLevel(everyKindStage);
  const difficulty = siteStage(everyKindStage).variants[0]!.difficulty;
  const { spawning, switches } = allSwitchedOn(level);
  const rowKinds = new Set(spawnTable(level, { difficulty, switches }).flatMap((r) => r.marks));
  expect(new Set([...rowKinds].map((m) => m.kind)).size).toBe(3);
  expect(switchMarkKinds(buildTimeline(level, { difficulty }))).toEqual([]);
  expect(switchMarkKinds(buildTimeline(level, { difficulty, switches }))).toEqual(["conditional"]);

  await page.goto(`#/level/${everyKindStage}?v=normal`);
  await expect(page.getByRole("list", { name: "圖例" })).toBeVisible();
  expect(await legendKinds(page)).toEqual([]);

  await switchAllOn(page, spawning);
  await expect.poll(() => legendKinds(page)).toEqual(["conditional"]);
  await seek(page, 5);
  expect(await legendKinds(page)).toEqual(["conditional"]);
  const legend = page.getByRole("list", { name: "圖例" });
  expect(await marksIn(legend)).toEqual(["conditional 1"]);
  await expect(legend.locator("[data-switch-mark]")).toHaveText("1");
});

/** ISW-NO 公害: its 開關 activate devices; the 隨機出兵組 t1 picks one of three, 寶箱 first. */
const gonghai = "ro4_n_1_2";

/** Device `alias` of `stage`'s first variant: its index and its first whole second on the field. */
function deviceShowing(stage: string, alias: string, options: TimelineOptions) {
  const level = siteLevel(stage);
  const difficulty = siteStage(stage).variants[0]!.difficulty;
  const index = level.devices.findIndex((d) => d.alias === alias);
  const timeline = buildTimeline(level, { ...options, difficulty });
  for (let t = 0; t < 600; t++) {
    const device = timeline.devicesAt(t).find((d) => d.index === index);
    if (device && clearAround(timeline, t, device.device.cell)) return { t, ...device };
  }
  throw new Error(`${alias} never shows clear of enemies`);
}

const fillOf = (scope: Locator) =>
  scope.locator("[data-switch-mark]").evaluateAll((marks) =>
    marks.map((m) => {
      const painted = m.querySelector("rect") ?? m;
      const style = getComputedStyle(painted);
      return painted instanceof SVGElement ? style.fill : style.backgroundColor;
    }),
  );

test("公害: a device a 開關 activates carries that 開關's mark, as in the 開關面板", async ({
  page,
}) => {
  const trader = deviceShowing(gonghai, "trap_764_skzshp", { switches: { hiddenOn: ["cargo"] } });
  const chest = deviceShowing(gonghai, "trap_757_skzbox#1", { switches: { picks: { 0: 1 } } });
  expect(trader.marks).toEqual([{ kind: "hiddenGroup", number: 1, name: "cargo" }]);
  expect(chest.marks).toEqual([{ kind: "random", number: 1, group: 0 }]);

  await page.goto(`#/level/${gonghai}?v=normal`);
  await page.getByRole("button", { name: "平面俯視" }).click();
  await page.locator('input[data-hidden-group="cargo"]').check();
  await seek(page, trader.t);
  const onMap = deviceByIndex(page, trader.index);
  expect(await marksIn(onMap)).toEqual(["hiddenGroup 1"]);
  expect(await fillOf(onMap)).toEqual(await fillOf(panelItem(page, trader.marks[0]!)));

  await page.locator('select[data-random-group="0"]').selectOption("1");
  await seek(page, chest.t);
  const chestOnMap = deviceByIndex(page, chest.index);
  expect(await marksIn(chestOnMap)).toEqual(["random 1"]);
  expect(await fillOf(chestOnMap)).toEqual(await fillOf(panelItem(page, chest.marks[0]!)));
});

test("ISW-NO 第 2 波: the legend lists the kind only a device carries, its box a 1 in the map mark's colour", async ({
  page,
}) => {
  const stage = "ro2_n_5_5";
  const level = siteLevel(stage);
  const difficulty = siteStage(stage).variants[0]!.difficulty;
  const secondWave = { waveIndex: 1, difficulty };
  const switches = { picks: { 0: 1 } };
  const timeline = buildTimeline(level, { ...secondWave, switches });
  expect(timeline.individuals.flatMap((i) => i.marks)).toEqual([]);
  expect(switchMarkKinds(buildTimeline(level, secondWave))).toEqual([]);
  expect(switchMarkKinds(timeline)).toEqual(["random"]);
  const box = deviceShowing(stage, "trap_065_normbox#1", { waveIndex: 1, switches });
  const legend = page.getByRole("list", { name: "圖例" });

  await page.goto(`#/level/${stage}?v=normal`);
  await selectWave(page, 1);
  await expect(legend).toBeVisible();
  expect(await legendKinds(page)).toEqual([]);

  await page.locator('select[data-random-group="0"]').selectOption("1");
  await expect.poll(() => legendKinds(page)).toEqual(["random"]);
  expect(await marksIn(legend)).toEqual(["random 1"]);
  await expect(legend.locator("[data-switch-mark]")).toHaveText("1");
  expect(await fillOf(legend)).toEqual(await fillOf(deviceByIndex(page, box.index)));
});

test("BD-1: a device's mark lets clicks and right-clicks through to it; removed, it keeps the mark and fades", async ({
  page,
}) => {
  // 公害 has no 擋路裝置 to remove; BD-1's shelter, withdrawn by a 隱藏組, stands from the start.
  const stage = "act21mini_01";
  const shelter = deviceShowing(stage, "trap_141_sheltr#5", {});
  expect(shelter.device.blocker).toBe(true);
  const onMap = deviceByIndex(page, shelter.index);

  await page.goto(`#/level/${stage}?v=normal`);
  await page.getByRole("button", { name: "平面俯視" }).click();
  await seek(page, shelter.t);
  const [mark] = await markBoxes(onMap);
  const centre: [number, number] = [mark!.left + mark!.width / 2, mark!.top + mark!.height / 2];

  await page.mouse.click(...centre);
  await expect(onMap).toHaveAttribute("aria-pressed", "true");
  await page.mouse.click(...centre, { button: "right" });
  await expect(onMap).toHaveAttribute("data-removed");
  expect(await marksIn(onMap)).toEqual(["hiddenGroup 1"]);
  expect(await shownOpacity(onMap.locator("[data-switch-mark] rect"))).toBeCloseTo(
    await shownOpacity(onMap.locator(".device-frame")),
    2,
  );
});

test("一步之遥: a device of four 開關 has four marks leftward from its square's bottom-right corner", async ({
  page,
}) => {
  const stage = "ro6_n_5_1";
  const switches = { picks: { 2: 1 } };
  const treant = deviceShowing(stage, "trap_219_fttreant#5", { switches });
  const onMap = deviceByIndex(page, treant.index);

  await page.goto(`#/level/${stage}?v=normal`);
  await page.getByRole("button", { name: "平面俯視" }).click();
  await page.locator('select[data-random-group="2"]').selectOption("1");
  await seek(page, treant.t);

  expect(await marksIn(onMap)).toEqual(["hiddenGroup 1", "hiddenGroup 2", "random 3", "random 5"]);
  const square = (await onMap.locator(".device-bg").boundingBox())!;
  const boxes = await markBoxes(onMap);
  expect(boxes[0]!.left + boxes[0]!.width).toBeCloseTo(square.x + square.width, 0);
  expect(boxes[0]!.top + boxes[0]!.height).toBeCloseTo(square.y + square.height, 0);
  for (let i = 1; i < boxes.length; i++) {
    expect(boxes[i]!.left + boxes[i]!.width).toBeLessThan(boxes[i - 1]!.left);
    expect(boxes[i]!.top).toBeCloseTo(boxes[0]!.top, 0);
  }
});

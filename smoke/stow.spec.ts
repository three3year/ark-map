import { expect, test, type Page } from "@playwright/test";
import {
  actionKey,
  buildTimeline,
  endpointRows,
  matchesEndpoint,
  routeEndpoints,
  sameAction,
  spawnTable,
  takeSnapshot,
  timelineEnd,
  type Individual,
  type Snapshot,
  type SpawnRow,
  type Timeline,
} from "../src/timeline/index.ts";
import { ceilTenth } from "../src/ui/playback.ts";
import {
  conditionalSwitch,
  drawerButton,
  endpointDot,
  enemyOnMap,
  filterCaption,
  orderCell,
  phoneWindow,
  readSiteLevel,
  rowOf,
  seek,
  selectWave,
  shownOpacity,
  siteLevel,
  siteStage,
  spawnTableRegion,
  timeDisplay,
  watchMenuCancelled,
  wideWindow,
} from "./levelPage.ts";

test.use({ viewport: wideWindow });

type OnField = Snapshot["onField"];

const iconReachInCells = 1;

function aloneOnField(timeline: Timeline, fits: (i: Individual, onField: OnField) => boolean) {
  for (let t = 0; t <= Math.ceil(timelineEnd(timeline)); t++) {
    const onField = takeSnapshot(timeline, t).onField;
    const alone = onField.find(
      ({ individual, position }) =>
        fits(individual, onField) &&
        onField.every(
          (other) =>
            other.individual === individual ||
            Math.hypot(other.position.x - position.x, other.position.y - position.y) >
              iconReachInCells,
        ),
    );
    if (alone) return { t, individual: alone.individual, onField };
  }
  throw new Error("no individual that fits stands alone at any whole second");
}

const withActionMate = (i: Individual, onField: OnField) =>
  onField.some((e) => e.individual !== i && actionKey(e.individual) === actionKey(i));

const counts = (page: Page) =>
  Promise.all(
    ["pending", "onField", "leaked"].map((c) => page.locator(`[data-count="${c}"]`).textContent()),
  );
const stowedHint = (page: Page) => page.locator("[data-stowed-count]");

test("1-7: right-clicking an enemy stows that one individual, without the browser menu", async ({
  page,
}) => {
  const { t, individual, onField } = aloneOnField(
    buildTimeline(siteLevel("main_01-07")),
    withActionMate,
  );
  const mates = onField.filter(
    (e) => e.individual !== individual && actionKey(e.individual) === actionKey(individual),
  );

  await page.goto("#/level/main_01-07?v=normal");
  await seek(page, t);
  const lastMenuCancelled = await watchMenuCancelled(page);
  const before = await counts(page);
  const url = page.url();
  await expect(stowedHint(page)).toHaveCount(0);

  await enemyOnMap(page, individual.id).click({ button: "right" });

  await expect(enemyOnMap(page, individual.id)).toHaveCount(0);
  expect(await lastMenuCancelled()).toBe("true");
  await expect(page.locator("svg.map g.enemy")).toHaveCount(onField.length - 1);
  for (const e of mates) await expect(enemyOnMap(page, e.individual.id)).toHaveCount(1);
  expect(await counts(page)).toEqual(before);
  await expect(stowedHint(page)).toHaveAttribute("data-stowed-count", "1");
  await expect(stowedHint(page)).toContainText("已收起 1 隻");
  expect(page.url()).toBe(url);

  await page.locator("svg.map rect.tile").first().click({ button: "right" });
  expect(await lastMenuCancelled()).toBe("false");
});

test("15-13: a stowed enemy stays off the map inside its 端點篩選; the dots stay", async ({
  page,
}) => {
  const timeline = buildTimeline(siteLevel("main_15-12"));
  const { t, individual } = aloneOnField(timeline, () => true);
  const spawn = routeEndpoints(timeline).find(
    (e) => e.kind === "spawn" && matchesEndpoint(individual, e),
  )!;
  const dots = page.locator("svg.map g.endpoint");

  await page.goto("#/level/main_15-12?v=normal");
  await seek(page, t);
  const dotCount = await dots.count();

  await enemyOnMap(page, individual.id).click({ button: "right" });
  await endpointDot(page, spawn).click();

  await expect(filterCaption(page)).toBeVisible();
  await expect(enemyOnMap(page, individual.id)).toHaveCount(0);
  await expect(dots).toHaveCount(dotCount);
});

test("1-7: stowing the selected enemy deselects it; selected again, it shows until shown for good", async ({
  page,
}) => {
  const level = siteLevel("main_01-07");
  const { t, individual } = aloneOnField(buildTimeline(level), (i) => i.spawnIndex === 0);
  const row = spawnTable(level).find((r) => r.waveIndex === 0 && sameAction(r, individual))!;
  const path = page.locator(`g.path[data-path="${individual.id}"]`);
  const selection = page.locator("p.selection");

  await page.goto("#/level/main_01-07?v=normal");
  await seek(page, t);
  await enemyOnMap(page, individual.id).click();
  await expect(selection).toHaveAttribute("data-selected", individual.id);

  await enemyOnMap(page, individual.id).click({ button: "right" });

  await expect(selection).toHaveCount(0);
  await expect(path).toHaveCount(0);
  await expect(enemyOnMap(page, individual.id)).toHaveCount(0);

  await rowOf(page, row).locator("button.enemy").click();

  await expect(timeDisplay(page)).toHaveText(`${ceilTenth(row.waveTime).toFixed(1)} 秒`);
  await expect(selection).toHaveAttribute("data-selected", individual.id);
  await expect(enemyOnMap(page, individual.id)).toHaveCount(1);
  await expect(path).toBeVisible();
  await expect(stowedHint(page)).toHaveAttribute("data-stowed-count", "1");

  await seek(page, t);
  await enemyOnMap(page, individual.id).click({ button: "right" });

  await expect(stowedHint(page)).toHaveCount(0);
  await expect(selection).toHaveAttribute("data-selected", individual.id);
  await page.getByRole("button", { name: "取消選取" }).click();
  await expect(enemyOnMap(page, individual.id)).toHaveCount(1);
});

const selectionButton = (page: Page, name: "收起" | "顯示") =>
  page.locator("p.selection").getByRole("button", { name, exact: true });

test("1-7: the selection row's 收起 stows and deselects; 顯示 on a stowed one shows it, kept selected", async ({
  page,
}) => {
  const level = siteLevel("main_01-07");
  const { t, individual } = aloneOnField(buildTimeline(level), (i) => i.spawnIndex === 0);
  const row = spawnTable(level).find((r) => r.waveIndex === 0 && sameAction(r, individual))!;
  const selection = page.locator("p.selection");

  await page.goto("#/level/main_01-07?v=normal");
  await seek(page, t);
  await enemyOnMap(page, individual.id).click();
  await expect(selectionButton(page, "顯示")).toHaveCount(0);
  await expect(stowedHint(page)).toHaveCount(0);

  await selectionButton(page, "收起").click();

  await expect(selection).toHaveCount(0);
  await expect(enemyOnMap(page, individual.id)).toHaveCount(0);
  await expect(stowedHint(page)).toHaveAttribute("data-stowed-count", "1");

  await rowOf(page, row).locator("button.enemy").click();
  await expect(selection).toHaveAttribute("data-selected", individual.id);
  await expect(selectionButton(page, "收起")).toHaveCount(0);

  await selectionButton(page, "顯示").focus();
  await page.keyboard.press("Enter");

  await expect(stowedHint(page)).toHaveCount(0);
  await expect(selection).toHaveAttribute("data-selected", individual.id);
  await expect(selectionButton(page, "收起")).toBeVisible();
  await page.getByRole("button", { name: "取消選取" }).click();
  await expect(enemyOnMap(page, individual.id)).toHaveCount(1);
});

test.describe("in a phone's window", () => {
  test.use({ viewport: phoneWindow });

  test("1-7: the selection row's 收起 stows the selected enemy", async ({ page }) => {
    const { t, individual } = aloneOnField(buildTimeline(siteLevel("main_01-07")), () => true);

    await page.goto("#/level/main_01-07?v=normal");
    await seek(page, t);
    await enemyOnMap(page, individual.id).click();

    await selectionButton(page, "收起").click();

    await expect(page.locator("p.selection")).toHaveCount(0);
    await expect(enemyOnMap(page, individual.id)).toHaveCount(0);
    await expect(stowedHint(page)).toHaveAttribute("data-stowed-count", "1");
  });
});

test("ro4_b_5: each 波次 keeps its stowed enemies; 全部顯示 shows this 波次's again", async ({
  page,
}) => {
  const level = siteLevel("ro4_b_5");
  const alone = (waveIndex: number) =>
    aloneOnField(buildTimeline(level, { waveIndex }), () => true);
  const [first, second] = [alone(0), alone(1)];

  await page.goto("#/level/ro4_b_5?v=normal");
  const url = page.url();
  await seek(page, first.t);
  await enemyOnMap(page, first.individual.id).click({ button: "right" });
  await expect(stowedHint(page)).toHaveAttribute("data-stowed-count", "1");

  await selectWave(page, 1);

  await expect(stowedHint(page)).toHaveCount(0);
  await seek(page, second.t);
  await enemyOnMap(page, second.individual.id).click({ button: "right" });
  await expect(stowedHint(page)).toHaveAttribute("data-stowed-count", "1");

  await selectWave(page, 0);
  await seek(page, first.t);

  await expect(stowedHint(page)).toHaveAttribute("data-stowed-count", "1");
  await expect(enemyOnMap(page, first.individual.id)).toHaveCount(0);

  await page.getByRole("button", { name: "全部顯示" }).click();

  await expect(stowedHint(page)).toHaveCount(0);
  await expect(enemyOnMap(page, first.individual.id)).toHaveCount(1);

  await selectWave(page, 1);
  await seek(page, second.t);

  await expect(stowedHint(page)).toHaveAttribute("data-stowed-count", "1");
  await expect(enemyOnMap(page, second.individual.id)).toHaveCount(0);
  expect(page.url()).toBe(url);
});

test("ro2_n_2_6: switching a 隨機出兵組's candidate and back keeps an enemy stowed", async ({
  page,
}) => {
  const { t, individual } = aloneOnField(buildTimeline(siteLevel("ro2_n_2_6")), () => true);
  // Group 2, the thieves: groups 0 and 1 pick wave 1's treasure boxes.
  const random = page.locator('select[data-random-group="2"]');

  await page.goto("#/level/ro2_n_2_6?v=normal");
  await seek(page, t);
  await enemyOnMap(page, individual.id).click({ button: "right" });
  const pick = await random.inputValue();
  const values = await random
    .locator("option")
    .evaluateAll((options) => options.map((o) => (o as HTMLOptionElement).value));

  await random.selectOption(values.find((v) => v !== pick)!);
  await random.selectOption(pick);

  await expect(stowedHint(page)).toHaveAttribute("data-stowed-count", "1");
  await expect(enemyOnMap(page, individual.id)).toHaveCount(0);
});

test("15-13: switching a 隱藏組 on and off keeps an enemy stowed", async ({ page }) => {
  const { t, individual } = aloneOnField(buildTimeline(siteLevel("main_15-12")), () => true);
  const group1 = page.locator('input[data-hidden-group="group1"]');

  await page.goto("#/level/main_15-12?v=normal");
  await seek(page, t);
  await enemyOnMap(page, individual.id).click({ button: "right" });
  await expect(group1).not.toBeChecked();

  await group1.check();

  await expect(stowedHint(page)).toHaveAttribute("data-stowed-count", "1");
  await expect(enemyOnMap(page, individual.id)).toHaveCount(0);

  await group1.uncheck();

  await expect(stowedHint(page)).toHaveAttribute("data-stowed-count", "1");
  await expect(enemyOnMap(page, individual.id)).toHaveCount(0);
});

test("11-7: switching a 條件出兵 on and off keeps an enemy stowed", async ({ page }) => {
  const { t, individual } = aloneOnField(buildTimeline(siteLevel("main_11-06")), () => true);
  const conditional = conditionalSwitch(page, 0);

  await page.goto("#/level/main_11-06?v=normal");
  await seek(page, t);
  await enemyOnMap(page, individual.id).click({ button: "right" });

  await conditional.check();

  await expect(page.locator('tr[data-conditional="0"]')).toHaveCount(1);
  await expect(stowedHint(page)).toHaveAttribute("data-stowed-count", "1");
  await expect(enemyOnMap(page, individual.id)).toHaveCount(0);

  await conditional.uncheck();

  await expect(stowedHint(page)).toHaveAttribute("data-stowed-count", "1");
  await expect(enemyOnMap(page, individual.id)).toHaveCount(0);
});

test("11-7: another variant, even on the same level file, or a reload shows every enemy again", async ({
  page,
}) => {
  const variants = siteStage("main_11-06").variants;
  const easy = variants.find((v) => v.id === "easy")!;
  expect(easy.levelFile, "簡單 shares the level file").toBe(variants[0]!.levelFile);
  const level = readSiteLevel(easy.levelFile);
  const { t, individual } = aloneOnField(buildTimeline(level), () => true);
  const easyOnField = takeSnapshot(buildTimeline(level, { difficulty: easy.difficulty }), t);

  await page.goto("#/level/main_11-06?v=normal");
  await seek(page, t);
  await enemyOnMap(page, individual.id).click({ button: "right" });
  await expect(stowedHint(page)).toHaveCount(1);

  await page.locator('button[data-variant="easy"]').click();

  await expect(timeDisplay(page)).toHaveText(`${t.toFixed(1)} 秒`);
  await expect(stowedHint(page)).toHaveCount(0);
  await expect(page.locator("svg.map g.enemy")).toHaveCount(easyOnField.counts.onField);

  await page.locator('button[data-variant="normal"]').click();

  await expect(stowedHint(page)).toHaveCount(0);
  await expect(enemyOnMap(page, individual.id)).toHaveCount(1);

  await enemyOnMap(page, individual.id).click({ button: "right" });
  await expect(stowedHint(page)).toHaveCount(1);
  await page.reload();
  await seek(page, t);

  await expect(stowedHint(page)).toHaveCount(0);
  await expect(enemyOnMap(page, individual.id)).toHaveCount(1);
});

test("another stage on the stage list shows every enemy again, though it shares the level file", async ({
  page,
}) => {
  const [stageId, sharing] = ["act6bossrush_01", "act6bossrush_tm01"];
  const levelFile = siteStage(stageId).variants[0]!.levelFile;
  expect(siteStage(sharing).variants[0]!.levelFile, "the two share a level file").toBe(levelFile);
  const { t, individual } = aloneOnField(buildTimeline(readSiteLevel(levelFile)), () => true);

  await page.goto(`#/level/${stageId}?v=normal`);
  await seek(page, t);
  await enemyOnMap(page, individual.id).click({ button: "right" });
  await expect(stowedHint(page)).toHaveCount(1);

  await page.evaluate((hash) => (location.hash = hash), `#/level/${sharing}?v=normal`);
  await expect(page.locator("h2")).toContainText(siteStage(sharing).code);
  await seek(page, t);

  await expect(stowedHint(page)).toHaveCount(0);
  await expect(enemyOnMap(page, individual.id)).toHaveCount(1);
});

const rowBox = (page: Page, row: SpawnRow) => rowOf(page, row).getByRole("checkbox");

test("1-7: unchecking a row's box stows its every individual, without jumping or deselecting", async ({
  page,
}) => {
  const level = siteLevel("main_01-07");
  const timeline = buildTimeline(level);
  const { t, individual, onField } = aloneOnField(timeline, withActionMate);
  const rows = spawnTable(level);
  const row = rows.find((r) => r.waveIndex === 0 && sameAction(r, individual))!;
  const other = rows.find((r) => r.waveIndex === 0 && !sameAction(r, individual))!;
  const onFieldOfRow = onField.filter((e) => sameAction(e.individual, row));
  const selection = page.locator("p.selection");

  await page.goto("#/level/main_01-07?v=normal");
  await orderCell(rowOf(page, other)).click();
  await seek(page, 0);
  const before = await counts(page);
  const url = page.url();
  await expect(rowBox(page, row)).toBeChecked();

  await rowBox(page, row).click();

  await expect(rowBox(page, row)).not.toBeChecked();
  await expect(timeDisplay(page)).toHaveText("0.0 秒");
  await expect(selection).toHaveAttribute("data-selected", `${actionKey(other)}-0`);
  expect(await counts(page)).toEqual(before);
  await expect(stowedHint(page)).toHaveAttribute("data-stowed-count", String(row.count));
  expect(await shownOpacity(rowOf(page, row).locator("button.enemy"))).toBeCloseTo(1, 2);
  await expect(rowOf(page, row).locator("button.enemy")).toHaveCSS("text-decoration-line", "none");
  expect(page.url()).toBe(url);

  await seek(page, t);

  for (const e of onFieldOfRow) await expect(enemyOnMap(page, e.individual.id)).toHaveCount(0);
  await expect(page.locator("svg.map g.enemy")).toHaveCount(onField.length - onFieldOfRow.length);

  await rowBox(page, row).click();

  await expect(rowBox(page, row)).toBeChecked();
  await expect(stowedHint(page)).toHaveCount(0);
  for (const e of onFieldOfRow) await expect(enemyOnMap(page, e.individual.id)).toHaveCount(1);
});

test("1-7: a right-clicked enemy leaves its row's box half-checked; clicking it shows the row", async ({
  page,
}) => {
  const level = siteLevel("main_01-07");
  const { t, individual, onField } = aloneOnField(buildTimeline(level), withActionMate);
  const row = spawnTable(level).find((r) => r.waveIndex === 0 && sameAction(r, individual))!;

  await page.goto("#/level/main_01-07?v=normal");
  await seek(page, t);
  await enemyOnMap(page, individual.id).click({ button: "right" });

  await expect(rowBox(page, row)).toBeChecked({ indeterminate: true });
  await expect(rowOf(page, row)).toHaveAttribute("data-stow", "mixed");

  await rowBox(page, row).click();

  await expect(rowBox(page, row)).toBeChecked();
  await expect(rowOf(page, row)).toHaveAttribute("data-stow", "shown");
  await expect(stowedHint(page)).toHaveCount(0);
  await expect(page.locator("svg.map g.enemy")).toHaveCount(onField.length);
  await expect(timeDisplay(page)).toHaveText(`${t.toFixed(1)} 秒`);
});

test("1-7: unchecking the selected enemy's row deselects it", async ({ page }) => {
  const level = siteLevel("main_01-07");
  const row = spawnTable(level).find((r) => r.waveTime > 0 && r.count > 1)!;
  const selection = page.locator("p.selection");

  await page.goto("#/level/main_01-07?v=normal");
  await orderCell(rowOf(page, row)).click();
  await expect(selection).toHaveAttribute("data-selected", `${actionKey(row)}-0`);
  const at = (await timeDisplay(page).textContent())!;

  await rowBox(page, row).click();

  await expect(selection).toHaveCount(0);
  await expect(page.locator(`g.path[data-path="${actionKey(row)}-0"]`)).toHaveCount(0);
  await expect(enemyOnMap(page, `${actionKey(row)}-0`)).toHaveCount(0);
  await expect(timeDisplay(page)).toHaveText(at);
});

test("1-7: a row's box is named after its enemy and toggles from the keyboard", async ({
  page,
}) => {
  const row = spawnTable(siteLevel("main_01-07")).find((r) => r.waveTime > 0)!;

  await page.goto("#/level/main_01-07?v=normal");
  const box = rowOf(page, row).getByRole("checkbox", { name: row.enemy!.name });
  await expect(box).toBeChecked();

  await box.focus();
  await page.keyboard.press("Space");

  await expect(box).not.toBeChecked();
  await expect(stowedHint(page)).toHaveAttribute("data-stowed-count", String(row.count));
  await expect(timeDisplay(page)).toHaveText("0.0 秒");
  await expect(page.locator("p.selection")).toHaveCount(0);

  await page.keyboard.press("Space");

  await expect(box).toBeChecked();
});

test("ro2_n_2_6: only rows that spawn have a box; a stowed row stays stowed across 切換", async ({
  page,
}) => {
  const rows = spawnTable(siteLevel("ro2_n_2_6"));
  const spawning = rows.filter((r) => r.firstOrder !== null);
  const silent = rows.filter((r) => r.firstOrder === null);
  const defaultNothing = silent.find((r) => r.random?.picked && r.enemyId === "");
  expect(defaultNothing, "a 隨機出兵組 picks its 不出兵 candidate by default").toBeDefined();
  const nothing = defaultNothing!;
  const row = silent.find((r) => r.random?.group === nothing.random!.group && !r.random.picked)!;
  const columns = page.locator("table thead th");

  await page.goto("#/level/ro2_n_2_6?v=normal");

  await expect(page.locator("tr[data-action] input[type=checkbox]")).toHaveCount(spawning.length);
  for (const r of silent) await expect(rowBox(page, r)).toHaveCount(0);
  const heads = await page.locator("tr.wave-head th").all();
  expect(heads.length, "several 波次").toBeGreaterThan(1);
  for (const head of heads) {
    await expect(head).toHaveAttribute("colspan", String(await columns.count()));
  }

  await rowOf(page, row).locator("button.pick").click();
  await rowBox(page, row).click();
  await expect(rowBox(page, row)).not.toBeChecked();
  await rowOf(page, nothing).locator("button.pick").click();
  await expect(rowBox(page, row)).toHaveCount(0);
  await rowOf(page, row).locator("button.pick").click();

  await expect(rowBox(page, row)).not.toBeChecked();
  await expect(rowOf(page, row)).toHaveAttribute("data-stow", "stowed");
});

test.describe("on a phone", () => {
  test.use({ viewport: phoneWindow });

  test("1-7: a box in the drawer's spawn table stows its row and leaves the drawer open", async ({
    page,
  }) => {
    const row = spawnTable(siteLevel("main_01-07")).find((r) => r.waveTime > 0)!;

    await page.goto("#/level/main_01-07?v=normal");
    await drawerButton(page).click();
    await expect(spawnTableRegion(page)).toBeInViewport();

    await rowBox(page, row).click();

    await expect(rowBox(page, row)).not.toBeChecked();
    await expect(stowedHint(page)).toHaveAttribute("data-stowed-count", String(row.count));
    await expect(timeDisplay(page)).toHaveText("0.0 秒");
    await expect(drawerButton(page)).toHaveAttribute("aria-expanded", "true");
  });
});

const headerBox = (page: Page) =>
  spawnTableRegion(page).locator("thead").getByRole("checkbox", { name: "顯示列出的所有列" });

test("ro4_b_5: with no 端點篩選 the header box stows and shows every 波次's rows", async ({
  page,
}) => {
  const rows = spawnTable(siteLevel("ro4_b_5")).filter((r) => r.firstOrder !== null);
  expect(new Set(rows.map((r) => r.waveIndex)).size, "several 波次").toBeGreaterThan(1);
  const selected = rows.find((r) => r.waveIndex === 0)!;
  const selection = page.locator("p.selection");

  await page.goto("#/level/ro4_b_5?v=normal");
  await orderCell(rowOf(page, selected)).click();
  await expect(selection).toHaveAttribute("data-selected", `${actionKey(selected)}-0`);
  await expect(headerBox(page)).toBeChecked();

  await headerBox(page).click();

  await expect(headerBox(page)).not.toBeChecked();
  for (const r of rows) await expect(rowBox(page, r)).not.toBeChecked();
  await expect(selection).toHaveCount(0);

  await rowBox(page, selected).click();
  await expect(headerBox(page)).toBeChecked({ indeterminate: true });

  await headerBox(page).click();

  await expect(headerBox(page)).toBeChecked();
  for (const r of rows) await expect(rowBox(page, r)).toBeChecked();
  await expect(stowedHint(page)).toHaveCount(0);

  await headerBox(page).focus();
  await page.keyboard.press("Space");

  await expect(headerBox(page)).not.toBeChecked();
  for (const r of rows) await expect(rowBox(page, r)).not.toBeChecked();
});

test("15-13: under a 端點篩選 the header box stows only the rows from that 出生點", async ({
  page,
}) => {
  const level = siteLevel("main_15-12");
  const rows = spawnTable(level).filter((r) => r.firstOrder !== null);
  const [spawn, listed] = routeEndpoints(buildTimeline(level))
    .filter((e) => e.kind === "spawn")
    .map((e) => [e, endpointRows(rows, 0, e)] as const)
    .find(([, listed]) => listed.length > 0 && listed.length < rows.length)!;
  const others = rows.filter((r) => !listed.includes(r));

  await page.goto("#/level/main_15-12?v=normal");
  await endpointDot(page, spawn).click();
  await expect(filterCaption(page)).toBeVisible();

  await headerBox(page).click();

  await expect(headerBox(page)).not.toBeChecked();
  for (const r of listed) await expect(rowBox(page, r)).not.toBeChecked();

  await filterCaption(page).getByRole("button").click();

  await expect(headerBox(page)).toBeChecked({ indeterminate: true });
  for (const r of listed) await expect(rowBox(page, r)).not.toBeChecked();
  for (const r of others) await expect(rowBox(page, r)).toBeChecked();
});

test("VS-1: with no row to stow the header box is disabled", async ({ page }) => {
  expect(spawnTable(siteLevel("act1enemyduel_01a")), "VS-1 lists no row").toEqual([]);

  await page.goto("#/level/act1enemyduel_01a?v=normal");

  await expect(headerBox(page)).toBeDisabled();
});

test("1-7: everything stowed with the header box, then one row checked: only its enemies show", async ({
  page,
}) => {
  const level = siteLevel("main_01-07");
  const { t, individual, onField } = aloneOnField(
    buildTimeline(level),
    (i, onField) => withActionMate(i, onField) && onField.some((e) => !sameAction(e.individual, i)),
  );
  const row = spawnTable(level).find((r) => r.waveIndex === 0 && sameAction(r, individual))!;
  const ofRow = onField.filter((e) => sameAction(e.individual, row));

  await page.goto("#/level/main_01-07?v=normal");
  await seek(page, t);
  await headerBox(page).click();
  await expect(page.locator("svg.map g.enemy")).toHaveCount(0);

  await rowBox(page, row).click();

  await expect(page.locator("svg.map g.enemy")).toHaveCount(ofRow.length);
  for (const e of ofRow) await expect(enemyOnMap(page, e.individual.id)).toHaveCount(1);
  await expect(headerBox(page)).toBeChecked({ indeterminate: true });
});

// Smoke test: 收起 takes enemy individuals off the map, nothing else; the counts, the URL and the
// endpoint dots stay as they are. Expected values come from 基準時間軸 run on the same data the
// site ships.
import { expect, test, type Page } from "@playwright/test";
import {
  actionKey,
  buildTimeline,
  matchesEndpoint,
  routeEndpoints,
  sameAction,
  spawnTable,
  takeSnapshot,
  timelineEnd,
  type Individual,
  type Snapshot,
  type Timeline,
} from "../src/timeline/index.ts";
import { ceilTenth } from "../src/ui/playback.ts";
import {
  endpointDot,
  enemyOnMap,
  filterCaption,
  readSiteLevel,
  seek,
  selectWave,
  siteLevel,
  siteStage,
  timeDisplay,
  wideWindow,
} from "./levelPage.ts";

test.use({ viewport: wideWindow });

type OnField = Snapshot["onField"];

/**
 * The first whole second at which an individual that `fits` is on field with no other within
 * reach of its icon, so a click at its centre lands on it and nothing else.
 */
function aloneOnField(timeline: Timeline, fits: (i: Individual, onField: OnField) => boolean) {
  for (let t = 0; t <= Math.ceil(timelineEnd(timeline)); t++) {
    const onField = takeSnapshot(timeline, t).onField;
    const alone = onField.find(
      ({ individual, position }) =>
        fits(individual, onField) &&
        onField.every(
          (other) =>
            other.individual === individual ||
            Math.hypot(other.position.x - position.x, other.position.y - position.y) > 1,
        ),
    );
    if (alone) return { t, individual: alone.individual, onField };
  }
  throw new Error("no individual that fits stands alone at any whole second");
}

/** Another individual of the same action is on field too. */
const withActionMate = (i: Individual, onField: OnField) =>
  onField.some((e) => e.individual !== i && actionKey(e.individual) === actionKey(i));

const counts = (page: Page) =>
  Promise.all(
    ["pending", "onField", "leaked"].map((c) => page.locator(`[data-count="${c}"]`).textContent()),
  );
const stowedHint = (page: Page) => page.locator("[data-stowed-count]");

/** Whether the last `contextmenu` event on the page had its browser menu cancelled. */
async function watchContextMenu(page: Page) {
  await page.evaluate(() => {
    addEventListener("contextmenu", (e) => {
      document.body.dataset.menuCancelled = String(e.defaultPrevented);
    });
  });
  return () => page.evaluate(() => document.body.dataset.menuCancelled);
}

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
  const menuCancelled = await watchContextMenu(page);
  const before = await counts(page);
  const url = page.url();
  await expect(stowedHint(page)).toHaveCount(0);

  await enemyOnMap(page, individual.id).click({ button: "right" });

  await expect(enemyOnMap(page, individual.id)).toHaveCount(0);
  expect(await menuCancelled()).toBe("true");
  await expect(page.locator("svg.map g.enemy")).toHaveCount(onField.length - 1);
  for (const e of mates) await expect(enemyOnMap(page, e.individual.id)).toHaveCount(1);
  expect(await counts(page)).toEqual(before);
  await expect(stowedHint(page)).toHaveAttribute("data-stowed-count", "1");
  await expect(stowedHint(page)).toContainText("已收起 1 隻");
  expect(page.url()).toBe(url);

  // Anywhere else on the map the browser's own menu stays.
  await page.locator("svg.map rect.tile").first().click({ button: "right" });
  expect(await menuCancelled()).toBe("false");
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

  // Its row still jumps to its spawn and selects it, drawn with its 路徑 though stowed.
  await page.locator(`tr[data-wave="0"][data-action="${actionKey(row)}"] button.enemy`).click();

  await expect(timeDisplay(page)).toHaveText(`${ceilTenth(row.waveTime).toFixed(1)} 秒`);
  await expect(selection).toHaveAttribute("data-selected", individual.id);
  await expect(enemyOnMap(page, individual.id)).toHaveCount(1);
  await expect(path).toBeVisible();
  await expect(stowedHint(page)).toHaveAttribute("data-stowed-count", "1");

  // A right-click on it now shows it again and keeps it selected.
  await seek(page, t);
  await enemyOnMap(page, individual.id).click({ button: "right" });

  await expect(stowedHint(page)).toHaveCount(0);
  await expect(selection).toHaveAttribute("data-selected", individual.id);
  await page.getByRole("button", { name: "取消選取" }).click();
  await expect(enemyOnMap(page, individual.id)).toHaveCount(1);
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

  // The other 波次 keeps its own.
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
  const random = page.locator('select[data-random-group="0"]');

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

test("11-6: another variant, even on the same level file, or a reload shows every enemy again", async ({
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

  // Back on 普通 they stay shown.
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

// Smoke test against the built site (dist/), served under a sub-path like GitHub Pages.
// The expected count comes from 基準時間軸 run on the same data the site ships.
import { expect, test } from "@playwright/test";
import {
  buildTimeline,
  matchesEndpoint,
  routeEndpoints,
  spawnTable,
  takeSnapshot,
  timelineEnd,
} from "../src/timeline/index.ts";
import { ceilTenth, playbackStop, roundTenth } from "../src/ui/playback.ts";
import {
  conditionalSwitch,
  endpointDot,
  enemyOnMap,
  expectDefaultSwitches,
  expectVariantShown,
  readSiteLevel,
  seek,
  selectWave,
  shownOpacity,
  siteLevel,
  siteStage,
  timeDisplay,
  wideWindow,
} from "./levelPage.ts";

test("1-7 at 35 s shows as many enemy individuals as the timeline has on field", async ({
  page,
}) => {
  const level = siteLevel("main_01-07");
  const expected = takeSnapshot(buildTimeline(level), 35).counts.onField;
  expect(expected, "1-7 has enemies on field at 35 s").toBeGreaterThan(0);

  await page.goto("#/level/main_01-07?v=normal");
  await seek(page, 35);

  await expect(page.locator("svg.map g.enemy")).toHaveCount(expected);
});

test("RM-2: a patrol selected long after its first lap shows the 路徑 left of the lap it is on", async ({
  page,
}) => {
  const timeline = buildTimeline(
    readSiteLevel(siteStage("act1halfidle_02").variants[0]!.levelFile),
  );
  // RM-2's patrols open each lap with a wait.
  const patrol = timeline.individuals.find(
    (i) => i.leakTime === null && i.route.checkpoints[0]?.type === "WAIT_FOR_SECONDS",
  );
  expect(patrol, "RM-2 has a patrol whose first checkpoint is a wait").toBeDefined();
  const firstLapEnd = patrol!.remainingPathAt(patrol!.spawnTime).at(-1)!.end;
  const t = Math.ceil(timelineEnd(timeline));
  expect(t, "the time slider reaches past the patrol's first lap").toBeGreaterThan(firstLapEnd);
  const walks = patrol!.remainingPathAt(t).filter((leg) => leg.kind === "move").length;
  const path = page.locator(`g.path[data-path="${patrol!.id}"]`);

  await page.goto("#/level/act1halfidle_02?v=normal");
  await seek(page, t);
  // Other enemies stand on top of it by then; Enter selects it as a click does.
  await page.locator(`svg.map g.enemy[data-individual="${patrol!.id}"]`).press("Enter");

  await expect(path).toBeVisible();
  await expect(path.locator("polyline.walk")).toHaveCount(walks);
});

test("4-10: an enemy standing still has a shrinking bar over it, gone once it moves on", async ({
  page,
}) => {
  const timeline = buildTimeline(siteLevel("main_04-10"));
  // The first whole second at which some individual is in a visible stay, a second into it.
  const t = Array.from({ length: 300 }, (_, i) => i).find((s) =>
    takeSnapshot(timeline, s).onField.some((e) => e.stay && e.stay.start <= s - 1),
  );
  expect(t, "4-10 has an enemy standing still").toBeDefined();
  const { individual, stay } = takeSnapshot(timeline, t!).onField.find(
    (e) => e.stay && e.stay.start <= t! - 1,
  )!;
  const bar = enemyOnMap(page, individual.id).locator(".stay-bar");

  await page.goto("#/level/main_04-10?v=normal");
  await seek(page, t!);

  await expect(bar).toHaveCount(1);
  const remaining = (stay!.end - t!) / (stay!.end - stay!.start);
  expect(Number(await bar.getAttribute("data-remaining"))).toBeCloseTo(remaining, 2);

  await seek(page, Math.ceil(stay!.end));

  await expect(bar).toHaveCount(0);
});

test("4-10: every enemy standing still shows the seconds left above its bar, gone once it moves on", async ({
  page,
}) => {
  const timeline = buildTimeline(siteLevel("main_04-10"));
  // The first whole second at which some individual is in a visible stay, a second into it.
  const t = Array.from({ length: 300 }, (_, i) => i).find((s) =>
    takeSnapshot(timeline, s).onField.some((e) => e.stay && e.stay.start <= s - 1),
  );
  expect(t, "4-10 has an enemy standing still").toBeDefined();
  const staying = takeSnapshot(timeline, t!).onField.filter((e) => e.stay);
  const { individual, stay } = staying.find((e) => e.stay!.start <= t! - 1)!;
  const seconds = enemyOnMap(page, individual.id).locator(".stay-seconds");
  const bar = enemyOnMap(page, individual.id).locator(".stay-track");

  await page.goto("#/level/main_04-10?v=normal");
  await seek(page, t!);

  await expect(page.locator("svg.map .stay-seconds")).toHaveCount(staying.length);
  for (const e of staying) {
    await expect(enemyOnMap(page, e.individual.id).locator(".stay-seconds")).toHaveText(
      (e.stay!.end - t!).toFixed(1),
    );
  }
  // Above the bar and flush with its right end, in the tilted view and the flat one alike.
  // The browser's own box of the text: Playwright's box of SVG text runs past its glyphs.
  const box = (l: typeof bar) => l.evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);
  for (const view of ["tilted", "flat"]) {
    const secondsBox = await box(seconds);
    const barBox = await box(bar);
    expect(secondsBox.bottom, `${view}: above the bar`).toBeLessThanOrEqual(barBox.top + 0.5);
    expect(Math.abs(secondsBox.right - barBox.right), `${view}: right ends line up`).toBeLessThan(
      2,
    );
    if (view === "tilted") await page.locator("button.view-toggle").click();
  }

  await seek(page, Math.ceil(stay!.end));

  await expect(seconds).toHaveCount(0);
});

test("4-10: 霜星 is drawn at 0.7 opacity while 隱形", async ({ page }) => {
  const timeline = buildTimeline(siteLevel("main_04-10"));
  // The first whole second at which 霜星 is 隱形.
  const t = Array.from({ length: 400 }, (_, i) => i).find((s) =>
    takeSnapshot(timeline, s).onField.some(
      (e) => e.invisible && e.individual.enemy.name === "霜星",
    ),
  );
  expect(t, "4-10's 霜星 goes 隱形").toBeDefined();
  const { individual } = takeSnapshot(timeline, t!).onField.find(
    (e) => e.invisible && e.individual.enemy.name === "霜星",
  )!;
  const enemy = enemyOnMap(page, individual.id);

  await page.goto("#/level/main_04-10?v=normal");
  await seek(page, t!);

  await expect(enemy).toHaveClass(/\binvisible\b/);
  expect(await shownOpacity(enemy.locator(".enemy-bg"))).toBeCloseTo(0.7, 2);

  // Filtered out as well, the two fades multiply.
  const elsewhere = routeEndpoints(timeline).find((e) => !matchesEndpoint(individual, e))!;
  await endpointDot(page, elsewhere).click();

  await expect(enemy).toHaveAttribute("data-filtered-out");
  expect(await shownOpacity(enemy.locator(".enemy-bg"))).toBeCloseTo(0.28, 2);
});

test("4-4 challenge runs its 難度修正 move speed and lists its modifiers", async ({ page }) => {
  const level = siteLevel("main_04-04");
  const normal = buildTimeline(level);
  const challenge = buildTimeline(level, { difficulty: "FOUR_STAR" });
  // The first whole second at which the two variants have different counts on field.
  const onField = (timeline: typeof normal, t: number) => takeSnapshot(timeline, t).counts.onField;
  const t = Array.from({ length: 300 }, (_, i) => i).find(
    (s) => onField(normal, s) !== onField(challenge, s),
  );
  expect(t, "challenge and normal differ at some second").toBeDefined();

  await page.goto("#/level/main_04-04?v=challenge");
  await seek(page, t!);

  await expect(page.locator("svg.map g.enemy")).toHaveCount(onField(challenge, t!));
  const moveModifier = page.locator('[data-modifier="ebuff_attribute"]');
  await expect(moveModifier).toContainText("移速");
  await expect(moveModifier).toContainText("計入移速");
  await expect(page.locator(".level-info dd")).toHaveCount(4);
});

test("playback leaves the URL alone", async ({ page }) => {
  await page.goto("#/level/main_01-07?v=normal");
  await expect(page.locator("svg.map")).toBeVisible();
  const url = page.url();

  await page.getByRole("button", { name: "播放", exact: true }).click();

  await expect(timeDisplay(page)).not.toHaveText(/^0\.0 /);
  expect(page.url()).toBe(url);
});

test("8x playback runs on from 第 1 波 into 第 2 波 and stops at the end of the last 波次", async ({
  page,
}) => {
  const variant = siteStage("ro4_b_5").variants.find((v) => v.id === "normal")!;
  const level = readSiteLevel(variant.levelFile);
  const stops = level.waves.map((_, waveIndex) =>
    playbackStop(buildTimeline(level, { waveIndex, difficulty: variant.difficulty })),
  );
  expect(stops, "ro4_b_5 has 2 波次").toHaveLength(2);
  expect(stops[1], "第 2 波 runs past 4 s").toBeGreaterThan(4);
  const playButton = page.getByRole("button", { name: "播放", exact: true });
  const speed8 = page.getByRole("radio", { name: "8x" });

  await page.goto("#/level/ro4_b_5?v=normal");
  await expect(page.locator("svg.map")).toBeVisible();
  const url = page.url();
  await speed8.click();
  await seek(page, roundTenth(stops[0]! - 4));
  await playButton.click();

  await expect(page.getByRole("radio", { name: "第 2 波" })).toBeChecked();
  await expect(timeDisplay(page)).not.toHaveText(/^0\.0 /);
  await expect(page.getByRole("button", { name: "暫停", exact: true })).toBeVisible();
  await expect(speed8).toBeChecked();
  expect(page.url()).toBe(url);

  await seek(page, roundTenth(stops[1]! - 4));
  await playButton.click();

  await expect(timeDisplay(page)).toHaveText(`${stops[1]!.toFixed(1)} 秒`);
  await expect(playButton).toBeVisible();
  await expect(page.getByRole("radio", { name: "第 2 波" })).toBeChecked();
});

test.describe("wide window", () => {
  test.use({ viewport: wideWindow });

  test("seeking, picking a 波次 and jumping from the spawn table leave the URL alone", async ({
    page,
  }) => {
    const level = siteLevel("ro2_n_2_6");
    const firstRow = spawnTable(level).find((r) => r.waveIndex === 0)!;
    await page.goto("#/level/ro2_n_2_6?v=normal");
    await expect(page.locator("svg.map")).toBeVisible();
    const url = page.url();

    await seek(page, 5);
    await selectWave(page, 1);
    await expect(timeDisplay(page)).toHaveText("0.0 秒");
    await page.locator('tr[data-wave="0"] button.enemy').first().click();

    await expect(page.getByRole("radio", { name: "第 1 波" })).toBeChecked();
    const jumpedTo = ceilTenth(firstRow.waveTime);
    await expect(timeDisplay(page)).toHaveText(`${jumpedTo.toFixed(1)} 秒`);
    expect(page.url()).toBe(url);
  });
});

test("switching to a variant with its own level file keeps the time and resets the switches", async ({
  page,
}) => {
  const variants = siteStage("main_11-06").variants;
  const tough = variants.find((v) => v.id === "tough")!;
  expect(tough.levelFile, "磨難 has its own level file").not.toBe(variants[0]!.levelFile);
  expect(readSiteLevel(tough.levelFile).branches, "磨難 has a 條件出兵").not.toHaveLength(0);
  await page.goto("#/level/main_11-06?v=normal");
  await seek(page, 30);
  const conditional = conditionalSwitch(page, 0);
  await conditional.check();

  await page.locator('button[data-variant="tough"]').click();

  await expect(page).toHaveURL(/#\/level\/main_11-06\?v=tough$/);
  await expectVariantShown(page, "tough");
  await expect(timeDisplay(page)).toHaveText("30.0 秒");
  // 條件出兵 are off by default in every variant.
  await expect(conditional).not.toBeChecked();
});

test("switching between variants that share a level file resets the switches", async ({ page }) => {
  await page.goto("#/level/main_11-06?v=normal");
  await seek(page, 30);
  const conditional = conditionalSwitch(page, 0);
  await conditional.check();

  await page.locator('button[data-variant="easy"]').click();

  await expect(page).toHaveURL(/#\/level\/main_11-06\?v=easy$/);
  await expect(timeDisplay(page)).toHaveText("30.0 秒");
  await expect(conditional).not.toBeChecked();
});

test("an old link's 波次 and seconds are ignored", async ({ page }) => {
  const variant = siteStage("ro2_n_2_6").variants[0]!;
  const level = readSiteLevel(variant.levelFile);
  const atStart = takeSnapshot(buildTimeline(level, { difficulty: variant.difficulty }), 0);

  await page.goto("#/level/ro2_n_2_6?v=normal&w=1&t=5");

  await expect(page.locator("svg.map")).toBeVisible();
  await expect(page.getByRole("radio", { name: "第 1 波" })).toBeChecked();
  await expect(timeDisplay(page)).toHaveText("0.0 秒");
  await expectDefaultSwitches(page, level, variant.difficulty);
  await expect(page.locator("svg.map g.enemy")).toHaveCount(atStart.counts.onField);
  await expect(page).toHaveURL(/#\/level\/ro2_n_2_6\?v=normal&w=1&t=5$/);
});

test("entering a stage starts at 第 1 波, 0 s; changing only the variant keeps the time", async ({
  page,
}) => {
  await page.goto("#/level/main_11-06?v=normal");
  await seek(page, 30);

  // Back to the stage list and into the same stage again.
  await page.locator("nav a").click();
  await page.locator('a[data-stage="main_11-06"]').click();
  await expect(timeDisplay(page)).toHaveText("0.0 秒");

  // Editing the URL to another variant keeps the time; to another stage starts over.
  await seek(page, 30);
  await page.evaluate(() => (location.hash = "#/level/main_11-06?v=easy"));
  await expectVariantShown(page, "easy");
  await expect(timeDisplay(page)).toHaveText("30.0 秒");
  await page.evaluate(() => (location.hash = "#/level/main_01-07?v=normal"));
  await expect(page.locator("h2")).toContainText("1-7");
  await expect(timeDisplay(page)).toHaveText("0.0 秒");

  // The browser's back button to 11-6 starts over too.
  await seek(page, 30);
  await page.goBack();
  await expectVariantShown(page, "easy");
  await expect(timeDisplay(page)).toHaveText("0.0 秒");
});

test("a variant without the 波次 on screen shows 第 1 波; switching back returns to that 波次", async ({
  page,
}) => {
  const variants = siteStage("ro4_b_5").variants;
  const view = (id: string) => {
    const variant = variants.find((v) => v.id === id)!;
    const level = readSiteLevel(variant.levelFile);
    const timelines = level.waves.map((_, waveIndex) =>
      buildTimeline(level, { waveIndex, difficulty: variant.difficulty }),
    );
    return {
      waves: level.waves.length,
      onField: (waveIndex: number, t: number) =>
        takeSnapshot(timelines[waveIndex]!, t).counts.onField,
    };
  };
  const normal = view("normal");
  const replace = view("replace1");
  expect(normal.waves, "the base map has 2 波次").toBe(2);
  expect(replace.waves, "the 替換地圖 has 3 波次").toBe(3);
  // The 替換地圖's third 波次 spawns nothing by default, so its time slider ends at 0 s; the
  // seconds move on the base map's first 波次 instead. The two 波次 differ at 0 s and at `t`, so
  // each count says which one is shown.
  const t = 30;
  for (const s of [0, t]) {
    expect(normal.onField(0, s), `the two 波次 differ at ${s} s`).not.toBe(replace.onField(2, s));
  }

  await page.goto("#/level/ro4_b_5?v=replace1");
  await selectWave(page, 2);
  await expect(page.locator("svg.map g.enemy")).toHaveCount(replace.onField(2, 0));

  await page.locator('button[data-variant="normal"]').click();

  await expectVariantShown(page, "normal");
  await expect(page.getByRole("radio", { name: "第 1 波" })).toBeChecked();
  await expect(timeDisplay(page)).toHaveText("0.0 秒");
  await expect(page.locator("svg.map g.enemy")).toHaveCount(normal.onField(0, 0));
  await seek(page, t);
  await expect(page.locator("svg.map g.enemy")).toHaveCount(normal.onField(0, t));

  await page.locator('button[data-variant="replace1"]').click();

  await expectVariantShown(page, "replace1");
  await expect(page.getByRole("radio", { name: "第 3 波" })).toBeChecked();
  await expect(timeDisplay(page)).toHaveText(`${t.toFixed(1)} 秒`);
  await expect(page.locator("svg.map g.enemy")).toHaveCount(replace.onField(2, t));
});

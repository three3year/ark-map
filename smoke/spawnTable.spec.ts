// Expected seconds come from the level's spawn table on the same data the site ships.
import { expect, test, type Page } from "@playwright/test";
import {
  actionKey,
  buildTimeline,
  endpointRows,
  routeEndpoints,
  sameAction,
  spawnTable,
  type SpawnRow,
  type SwitchMark,
} from "../src/timeline/index.ts";
import { ceilTenth } from "../src/ui/playback.ts";
import {
  cellUnder,
  endpointDot,
  filterCaption,
  orderCell,
  pickButton,
  rowOf,
  seek,
  shownOpacity,
  siteLevel,
  spawnTableRegion,
  timeDisplay,
  wideWindow,
} from "./levelPage.ts";

test.use({ viewport: wideWindow });

const siteRows = (stageId: string): SpawnRow[] => spawnTable(siteLevel(stageId));

const firstIndividual = (row: SpawnRow) => `${actionKey(row)}-0`;

test("1-7: clicking a row away from the name jumps to its spawn and shows the route", async ({
  page,
}) => {
  const row = siteRows("main_01-07").find((r) => r.waveTime > 0 && r.count > 1)!;
  await page.goto("#/level/main_01-07?v=normal");
  await expect(page.locator("svg.map")).toBeVisible();

  await orderCell(rowOf(page, row)).click();

  await expect(timeDisplay(page)).toHaveText(`${ceilTenth(row.waveTime).toFixed(1)} 秒`);
  await expect(page.locator("p.selection")).toHaveAttribute("data-selected", firstIndividual(row));
  await expect(page.locator(`g.path[data-path="${firstIndividual(row)}"]`)).toBeVisible();
  await expect(rowOf(page, row).locator("button.enemy")).toHaveAttribute("aria-pressed", "true");
});

test("1-7: the 路徑 hides before the selected individual spawns and comes back once it is on the field", async ({
  page,
}) => {
  const row = siteRows("main_01-07").find((r) => r.waveTime >= 1)!;
  const individual = firstIndividual(row);
  const path = page.locator(`g.path[data-path="${individual}"]`);
  const legend = page.getByRole("list", { name: "圖例" });
  await page.goto("#/level/main_01-07?v=normal");
  await orderCell(rowOf(page, row)).click();

  await seek(page, 0);

  await expect(path).toHaveCount(0);
  await expect(page.locator("p.selection")).toHaveAttribute("data-selected", individual);
  await expect(page.locator("p.selection")).toContainText("未出現");
  await expect(legend.getByText("路徑", { exact: true })).toBeVisible();

  await seek(page, Math.ceil(row.waveTime) + 0.5);

  await expect(path).toBeVisible();
});

test("1-7: Enter on a row's enemy name jumps to its spawn", async ({ page }) => {
  const row = siteRows("main_01-07").find((r) => r.waveTime > 0)!;
  await page.goto("#/level/main_01-07?v=normal");

  await rowOf(page, row).locator("button.enemy").press("Enter");

  await expect(timeDisplay(page)).toHaveText(`${ceilTenth(row.waveTime).toFixed(1)} 秒`);
  await expect(page.locator("p.selection")).toHaveAttribute("data-selected", firstIndividual(row));
});

test("ro2_n_2_6: 切換 switches the candidate and keeps the selection and the time", async ({
  page,
}) => {
  const rows = siteRows("ro2_n_2_6");
  const selectedRow = rows.find((r) => r.waveIndex === 0 && r.waveTime > 0)!;
  const candidate = rows.find((r) => r.random && !r.random.picked)!;
  const at = `${ceilTenth(selectedRow.waveTime).toFixed(1)} 秒`;
  await page.goto("#/level/ro2_n_2_6?v=normal");
  await orderCell(rowOf(page, selectedRow)).click();
  await expect(timeDisplay(page)).toHaveText(at);

  await pickButton(rowOf(page, candidate)).click();

  await expect(rowOf(page, candidate)).toHaveAttribute("data-picked", "true");
  await expect(timeDisplay(page)).toHaveText(at);
  await expect(page.getByRole("radio", { name: "第 1 波" })).toBeChecked();
  await expect(page.locator("p.selection")).toHaveAttribute(
    "data-selected",
    firstIndividual(selectedRow),
  );
});

const headings = (page: Page) =>
  spawnTableRegion(page)
    .locator("thead th")
    .allInnerTexts()
    .then((ts) => ts.map((t) => t.trim()));

test("ro2_n_2_6: 切換 has its own column between 敵人 and 次序, every button lined up", async ({
  page,
}) => {
  const unpicked = siteRows("ro2_n_2_6").filter((r) => r.random && !r.random.picked);
  expect(unpicked.length, "candidate rows that are not picked").toBeGreaterThan(1);
  await page.goto("#/level/ro2_n_2_6?v=normal");
  const picks = spawnTableRegion(page).getByRole("button", { name: "切換" });
  await expect(picks).toHaveCount(unpicked.length);

  const heads = await headings(page);
  const enemy = heads.indexOf("敵人");
  expect(heads.slice(enemy, enemy + 3)).toEqual(["敵人", "", "次序"]);
  const lefts = new Set<number>();
  for (const pick of await picks.all()) {
    expect(await pick.evaluate((b) => b.closest("td")!.cellIndex)).toBe(enemy + 1);
    lefts.add((await pick.boundingBox())!.x);
  }
  expect([...lefts]).toHaveLength(1);
  const row = rowOf(page, unpicked[0]!);
  await expect(cellUnder(row, "標記")).toContainText("隨機出兵組");
});

test("1-7: a level without 隨機出兵組 has no 切換 column", async ({ page }) => {
  expect(siteRows("main_01-07").some((r) => r.random)).toBe(false);
  await page.goto("#/level/main_01-07?v=normal");
  await expect(spawnTableRegion(page).locator("tr[data-action]").first()).toBeVisible();

  const heads = await headings(page);
  const enemy = heads.indexOf("敵人");
  expect(heads[enemy + 1]).toBe("次序");
});

test("ro2_n_2_6: a 端點篩選 listing no 切換 row keeps the column", async ({ page }) => {
  const level = siteLevel("ro2_n_2_6");
  const rows = spawnTable(level);
  const spawn = routeEndpoints(buildTimeline(level)).find((e) => {
    const listed = endpointRows(rows, 0, e);
    return listed.length > 0 && !listed.some((r) => r.random && !r.random.picked);
  });
  expect(spawn, "an endpoint of 第 1 波 lists no candidate row that is not picked").toBeDefined();
  await page.goto("#/level/ro2_n_2_6?v=normal");

  await endpointDot(page, spawn!).click();

  await expect(filterCaption(page)).toBeVisible();
  await expect(spawnTableRegion(page).getByRole("button", { name: "切換" })).toHaveCount(0);
  const heads = await headings(page);
  const enemy = heads.indexOf("敵人");
  expect(heads.slice(enemy, enemy + 3)).toEqual(["敵人", "", "次序"]);
});

test("ISW-DF ro5_b_4: an action in two 隨機出兵組 dims each group's badge by that group's pick", async ({
  page,
}) => {
  const level = siteLevel("ro5_b_4");
  const inTwo = spawnTable(level).find(
    (r) => r.marks.filter((m) => m.kind === "random").length === 2,
  )!;
  const [first, second] = inTwo.marks.filter((m) => m.kind === "random");
  const otherCandidate = first!.candidate === 0 ? 1 : 0;
  const switches = { picks: { [first!.group]: otherCandidate } };
  const after = spawnTable(level, { switches }).find(
    (r) => r.waveIndex === inTwo.waveIndex && sameAction(r, inTwo),
  )!;
  expect(after.picked, "the second group still picks the action: it spawns").toBe(true);
  const badgeOf = (mark: SwitchMark) =>
    rowOf(page, inTwo)
      .locator(`[data-switch-mark="random"][data-switch-mark-number="${mark.number}"]`)
      .locator("..");
  await page.goto("#/level/ro5_b_4?v=normal");
  await page
    .locator(`select[data-random-group="${first!.group}"]`)
    .selectOption(String(otherCandidate));

  await expect(orderCell(rowOf(page, inTwo))).toHaveText(`${after.firstOrder}`);
  expect(await shownOpacity(orderCell(rowOf(page, inTwo)))).toBe(1);
  expect(await shownOpacity(badgeOf(first!))).toBeLessThan(1);
  expect(await shownOpacity(badgeOf(second!))).toBe(1);
});

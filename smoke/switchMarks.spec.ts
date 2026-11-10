// Smoke test: a spawn-table row's 開關標記 match the 開關面板's marks for the same 開關.
// Expected rows come from the same data the site ships.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { spawnTable, type SwitchMark } from "../src/timeline/index.ts";
import { conditionalSwitch, rowOf, siteLevel, siteStage, wideWindow } from "./levelPage.ts";

test.use({ viewport: wideWindow });

/** The kind and number of each 開關標記 inside `scope`, in page order. */
const marksIn = (scope: Locator) =>
  scope
    .locator("[data-switch-mark]")
    .evaluateAll((marks) =>
      marks.map((m) => `${m.getAttribute("data-switch-mark")} ${m.dataset.switchMarkNumber}`),
    );

const switchPanel = (page: Page) => page.getByRole("region", { name: "開關" });

/** The 開關面板 item of the 開關 `mark` stands for. */
function panelItem(page: Page, mark: SwitchMark): Locator {
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

test("DS-2: each row's marks are the 開關面板's marks for the same 開關; a 純機關 has none", async ({
  page,
}) => {
  // act1dp_s02: 條件出兵 0, 2 and 3 spawn, branch 1 is a 純機關; the spawning branches' actions
  // are in 隱藏組 "random" (off by default) and a 隨機出兵組.
  const id = "act1dp_s02";
  const level = siteLevel(id);
  const difficulty = siteStage(id).variants[0]!.difficulty;
  const spawning = level.branches.flatMap((b, i) => (b.deviceOnly ? [] : [i]));
  const conditional = Object.fromEntries(spawning.map((i) => [i, { wave: 0, t: 0 }]));
  const rows = spawnTable(level, { difficulty, switches: { conditional, hiddenOn: ["random"] } });
  const marks = rows.flatMap((r) => r.marks);
  expect(new Set(marks.map((m) => m.kind))).toEqual(
    new Set(["conditional", "hiddenGroup", "random"]),
  );
  // Numbered among the 條件出兵 that spawn: a branch after the 純機關 is not its index + 1.
  expect(marks.some((m) => m.kind === "conditional" && m.number !== m.branchIndex + 1)).toBe(true);

  await page.goto(`#/level/${id}?v=normal`);
  await page.locator('input[data-hidden-group="random"]').check();
  for (const branch of spawning) await conditionalSwitch(page, branch).check();
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

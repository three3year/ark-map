import { expect, test, type Page } from "@playwright/test";
import {
  buildTimeline,
  matchesEndpoint,
  routeEndpoints,
  takeSnapshot,
  timelineEnd,
} from "../src/timeline/index.ts";
import {
  drawnAt,
  endpointDot,
  enemyOnMap,
  seek,
  selectWave,
  shownOpacity,
  siteLevel,
  wideWindow,
} from "./levelPage.ts";

test.use({ viewport: wideWindow });

const level = siteLevel("main_04-04");

/** The first `enemyId` visible on the field for two whole seconds or more, and those seconds. */
function visibleForTwoSeconds(enemyId: string) {
  for (const waveIndex of level.waves.keys()) {
    const timeline = buildTimeline(level, { waveIndex });
    for (const individual of timeline.individuals) {
      if (individual.enemy.id !== enemyId) continue;
      const seconds: number[] = [];
      for (let t = 0; t <= Math.ceil(timelineEnd(timeline)); t++) {
        const entry = takeSnapshot(timeline, t).onField.find((e) => e.individual === individual);
        if (entry && !entry.invisible) seconds.push(t);
      }
      if (seconds.length >= 2) return { waveIndex, individual, seconds };
    }
  }
  throw new Error(`no ${enemyId} on the field for two whole seconds`);
}

const attackRange = (page: Page) => page.locator("svg.map circle.attack-range");
const legendItem = (page: Page) =>
  page.getByRole("list", { name: "圖例" }).getByText("攻擊範圍", { exact: true });

async function centre(page: Page): Promise<{ x: number; y: number }> {
  const [cx, cy] = await Promise.all(
    ["cx", "cy"].map(async (a) => Number(await attackRange(page).getAttribute(a))),
  );
  return { x: cx!, y: level.map.height - 1 - cy! };
}

test("4-4: a selected crossbowman's 攻擊範圍 is drawn around it and follows it", async ({
  page,
}) => {
  const { waveIndex, individual, seconds } = visibleForTwoSeconds("enemy_1012_dcross");
  const first = seconds[0]!;
  const later = seconds.at(-1)!;

  await page.goto("#/level/main_04-04?v=normal");
  await selectWave(page, waveIndex);
  await seek(page, first);
  await enemyOnMap(page, individual.id).press("Enter");

  await expect(attackRange(page)).toHaveCount(1);
  await expect(legendItem(page)).toBeVisible();
  const before = await drawnAt(page, level, individual.id);
  expect(await centre(page)).toEqual(before);

  await seek(page, later);

  const after = await drawnAt(page, level, individual.id);
  expect(after, "it walked between the two seconds").not.toEqual(before);
  expect(await centre(page)).toEqual(after);
});

test("4-4: a selected soldier has no 攻擊範圍 and the legend does not list one", async ({
  page,
}) => {
  const { waveIndex, individual, seconds } = visibleForTwoSeconds("enemy_1002_nsabr");

  await page.goto("#/level/main_04-04?v=normal");
  await selectWave(page, waveIndex);
  await seek(page, seconds[0]!);
  await enemyOnMap(page, individual.id).press("Enter");

  await expect(enemyOnMap(page, individual.id)).toHaveAttribute("aria-pressed", "true");
  await expect(attackRange(page)).toHaveCount(0);
  await expect(legendItem(page)).toHaveCount(0);
});

test("4-4: the 攻擊範圍 fades with its crossbowman outside the 端點篩選", async ({ page }) => {
  const { waveIndex, individual, seconds } = visibleForTwoSeconds("enemy_1012_dcross");
  const elsewhere = routeEndpoints(buildTimeline(level, { waveIndex })).find(
    (e) => !matchesEndpoint(individual, e),
  )!;

  await page.goto("#/level/main_04-04?v=normal");
  await selectWave(page, waveIndex);
  await seek(page, seconds[0]!);
  await enemyOnMap(page, individual.id).press("Enter");
  expect(await shownOpacity(attackRange(page))).toBeCloseTo(1, 2);

  await endpointDot(page, elsewhere).click();

  await expect(enemyOnMap(page, individual.id)).toHaveAttribute("data-filtered-out");
  expect(await shownOpacity(attackRange(page))).toBeCloseTo(0.4, 2);
});

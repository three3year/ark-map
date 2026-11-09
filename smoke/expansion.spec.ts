import { expect, test, type Page } from "@playwright/test";
import type { Difficulty } from "../src/level/index.ts";
import { spawnPlan } from "../src/timeline/index.ts";
import {
  expectDefaultSwitches,
  expectVariantShown,
  phoneWindow,
  readSiteLevel,
  seek,
  selectWave,
  siteStage,
  timeDisplay,
} from "./levelPage.ts";

const expansionSwitch = (page: Page) => page.getByRole("group", { name: "內容拓展" });
const expansionButton = (page: Page, name: string) =>
  expansionSwitch(page).getByRole("button", { name, exact: true });
const nodeLink = (page: Page, id: string) => page.locator(`a[data-stage="${id}"]`);

function expansionFile(id: string, n: number): string {
  const file = siteStage(id).expansions?.find((x) => x.number === n)?.levelFile;
  expect(file, `${id} has 內容拓展 ${n}`).toBeDefined();
  return file!;
}

async function expectFileShown(page: Page, file: string, difficulty: Difficulty = "NORMAL") {
  const names = spawnPlan(readSiteLevel(file), difficulty).groups.hidden.map((g) => g.name);
  await expect
    .poll(() =>
      page
        .locator("input[data-hidden-group]")
        .evaluateAll((boxes) => boxes.map((b) => b.getAttribute("data-hidden-group")).sort()),
    )
    .toEqual([...names].sort());
}

async function expectExpansionLit(page: Page, label: string) {
  await expect(expansionSwitch(page).locator('button[aria-pressed="true"]')).toHaveText([label]);
}

test("the switch sits right of the site title on a theme-4 node", async ({ page }) => {
  await page.goto("#/level/ro4_n_1_1");

  await expect(page.locator("svg.map")).toBeVisible();
  await expect(expansionSwitch(page)).toBeVisible();
  const title = (await page.locator("h1").boundingBox())!;
  const group = (await expansionSwitch(page).boundingBox())!;
  expect(group.x, "right of the title").toBeGreaterThanOrEqual(title.x + title.width);
  expect(group.y, "on the title's row").toBeLessThan(title.y + title.height);
  expect(group.y + group.height, "on the title's row").toBeGreaterThan(title.y);
});

for (const theme of ["rogue_4", "rogue_5"]) {
  test(`the ${theme} list offers 原版 and every 內容拓展 of the theme, 原版 lit`, async ({
    page,
  }) => {
    await page.goto(`#/area/${theme}`);

    await expect(expansionSwitch(page).getByRole("button")).toHaveText([
      "原版",
      "內容拓展 1",
      "內容拓展 2",
    ]);
    await expectExpansionLit(page, "原版");
  });
}

test("choosing 內容拓展 2 on the list keeps the URL; a node opened from it shows 內容拓展 2", async ({
  page,
}) => {
  await page.goto("#/area/rogue_4");
  await expect(nodeLink(page, "ro4_n_1_1")).toHaveAttribute("href", "#/level/ro4_n_1_1?v=normal");

  await expansionButton(page, "內容拓展 2").click();

  await expectExpansionLit(page, "內容拓展 2");
  await expect(page).toHaveURL(/#\/area\/rogue_4$/);
  await nodeLink(page, "ro4_n_1_1").click();
  await expect(page).toHaveURL(/#\/level\/ro4_n_1_1\?v=normal&x=2$/);
  await expectExpansionLit(page, "內容拓展 2");
  await expectFileShown(page, expansionFile("ro4_n_1_1", 2));
});

test("the list's choice is in memory only: reloading the list brings back 原版", async ({
  page,
}) => {
  await page.goto("#/area/rogue_4");
  await expansionButton(page, "內容拓展 2").click();

  await page.reload();

  await expectExpansionLit(page, "原版");
  await expect(nodeLink(page, "ro4_n_1_1")).toHaveAttribute("href", "#/level/ro4_n_1_1?v=normal");
});

test("a node's fallback keeps the choice: after a node with 內容拓展 1 only, the next shows 2", async ({
  page,
}) => {
  await page.goto("#/area/rogue_4");
  await expansionButton(page, "內容拓展 2").click();
  await nodeLink(page, "ro4_t_2").click();
  await expectExpansionLit(page, "內容拓展 1");
  await expect(page).toHaveURL(/#\/level\/ro4_t_2\?v=normal&x=2$/);

  await page.goBack();

  await expectExpansionLit(page, "內容拓展 2");
  await nodeLink(page, "ro4_n_1_1").click();
  await expect(page).toHaveURL(/#\/level\/ro4_n_1_1\?v=normal&x=2$/);
  await expectFileShown(page, expansionFile("ro4_n_1_1", 2));
});

test("opening a node link sets the choice to its x, none being 原版", async ({ page }) => {
  await page.goto("#/level/ro4_n_1_1?x=1");
  await expectExpansionLit(page, "內容拓展 1");
  await page.goto("#/area/rogue_4");
  await expectExpansionLit(page, "內容拓展 1");

  await page.goto("#/level/ro4_n_1_2");
  await expectExpansionLit(page, "原版");
  await page.goto("#/area/rogue_4");
  await expectExpansionLit(page, "原版");
});

test("going back to a node sets the choice to its x", async ({ page }) => {
  await page.goto("#/level/ro4_n_1_1?x=2");
  await expectExpansionLit(page, "內容拓展 2");
  await page.goto("#/level/ro4_n_1_2");
  await expectExpansionLit(page, "原版");

  await page.goBack();

  await expect(page).toHaveURL(/#\/level\/ro4_n_1_1\?x=2$/);
  await expectExpansionLit(page, "內容拓展 2");
  await page.goto("#/area/rogue_4");
  await expectExpansionLit(page, "內容拓展 2");
});

test("pressing the switch on a node changes the choice", async ({ page }) => {
  await page.goto("#/level/ro4_n_1_1");

  await expansionButton(page, "內容拓展 2").click();

  await expect(page).toHaveURL(/#\/level\/ro4_n_1_1\?x=2$/);
  await page.goto("#/area/rogue_4");
  await expectExpansionLit(page, "內容拓展 2");
});

test("a mainline stage between leaves the choice: back on theme 4, a node shows 內容拓展 2", async ({
  page,
}) => {
  await page.goto("#/area/rogue_4");
  await expansionButton(page, "內容拓展 2").click();
  await page.goto("#/level/main_01-07");
  await expect(page.locator("svg.map")).toBeVisible();
  await expect(page).toHaveURL(/#\/level\/main_01-07$/);

  await page.goto("#/area/rogue_4");

  await expectExpansionLit(page, "內容拓展 2");
  await nodeLink(page, "ro4_n_1_1").click();
  await expect(page).toHaveURL(/#\/level\/ro4_n_1_1\?v=normal&x=2$/);
  await expectFileShown(page, expansionFile("ro4_n_1_1", 2));
});

test("the choice carries across themes; lists without 內容拓展 link without x", async ({
  page,
}) => {
  await page.goto("#/area/rogue_4");
  await expansionButton(page, "內容拓展 2").click();

  await page.goto("#/area/rogue_1");
  await expect(nodeLink(page, "ro1_n_1_1")).toHaveAttribute("href", "#/level/ro1_n_1_1?v=normal");
  await page.goto("#/area/rogue_5");

  await expectExpansionLit(page, "內容拓展 2");
  await expect(nodeLink(page, "ro5_n_7_1")).toHaveAttribute(
    "href",
    "#/level/ro5_n_7_1?v=normal&x=2",
  );
});

test.describe("on a phone", () => {
  test.use({ viewport: phoneWindow });

  for (const [where, hash] of [
    ["the theme-4 list", "#/area/rogue_4"],
    ["a theme-4 node", "#/level/ro4_n_1_1"],
  ] as const) {
    test(`on ${where} the switch wraps below the title, at its left, without horizontal scroll`, async ({
      page,
    }) => {
      await page.goto(hash);
      if (hash.startsWith("#/level/")) await expect(page.locator("svg.map")).toBeVisible();
      await expect(expansionSwitch(page).getByRole("button")).toHaveCount(3);

      const title = (await page.locator("h1").boundingBox())!;
      const group = (await expansionSwitch(page).boundingBox())!;
      expect(group.y, "below the title").toBeGreaterThanOrEqual(title.y + title.height);
      expect(group.x, "at the title's left").toBeCloseTo(title.x, 0);
      expect(group.x + group.width, "inside the window").toBeLessThanOrEqual(phoneWindow.width);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, "no horizontal scroll").toBeLessThanOrEqual(0);
    });
  }
});

for (const [where, hash] of [
  ["the home page", "#/"],
  ["a mainline list", "#/area/main_1"],
  ["a mainline stage", "#/level/main_01-07"],
  ["the theme-1 list", "#/area/rogue_1"],
  ["a theme-1 node", "#/level/ro1_n_1_1"],
] as const) {
  test(`no switch on ${where}`, async ({ page }) => {
    await page.goto(hash);

    await expect(page.locator("h1")).toBeVisible();
    if (hash.startsWith("#/level/")) await expect(page.locator("svg.map")).toBeVisible();
    await expect(expansionSwitch(page)).toHaveCount(0);
  });
}

for (const [id, labels] of [
  ["ro5_n_1_1", ["原版", "內容拓展 1"]],
  ["ro5_n_7_1", ["原版", "內容拓展 2"]],
  ["ro5_n_1_5", ["原版"]],
] as const) {
  test(`${id} offers ${labels.join("|")}, 原版 lit`, async ({ page }) => {
    expect(siteStage(id).expansions?.map((x) => `內容拓展 ${x.number}`) ?? []).toEqual(
      labels.slice(1),
    );
    await page.goto(`#/level/${id}`);

    await expect(expansionSwitch(page).getByRole("button")).toHaveText([...labels]);
    await expectExpansionLit(page, "原版");
  });
}

test("x=2 on a node with 內容拓展 1 only shows and lights 內容拓展 1, keeping x=2", async ({
  page,
}) => {
  expect(siteStage("ro4_t_2").expansions?.map((x) => x.number)).toEqual([1]);
  await page.goto("#/level/ro4_t_2?x=2");

  await expectFileShown(page, expansionFile("ro4_t_2", 1));
  await expectExpansionLit(page, "內容拓展 1");
  await expect(page).toHaveURL(/#\/level\/ro4_t_2\?x=2$/);
});

test("緊急作戰 on a 內容拓展: the 內容拓展's file at the 緊急作戰's difficulty", async ({
  page,
}) => {
  await page.goto("#/level/ro4_t_2?v=emergency&x=1");

  await expectVariantShown(page, "emergency");
  await expectExpansionLit(page, "內容拓展 1");
  const file = expansionFile("ro4_t_2", 1);
  await expectFileShown(page, file, "FOUR_STAR");
  await expectDefaultSwitches(page, readSiteLevel(file), "FOUR_STAR");
});

test("switching 內容拓展 keeps the 波次 and seconds, resets the switches, adds no history", async ({
  page,
}) => {
  const base = siteStage("ro4_t_2").variants[0]!.levelFile;
  const expansion = expansionFile("ro4_t_2", 1);
  const group = spawnPlan(readSiteLevel(base), "NORMAL").groups.hidden.find((g) => !g.defaultOn)!;
  expect(group, "ro4_t_2 has a 隱藏組 off in 普通").toBeDefined();
  await page.goto("#/");
  await page.goto("#/level/ro4_t_2?v=normal");
  await selectWave(page, 1);
  await seek(page, 40);
  await page.locator(`input[data-hidden-group="${group.name}"]`).check();

  await expansionButton(page, "內容拓展 1").click();

  await expect(page).toHaveURL(/#\/level\/ro4_t_2\?v=normal&x=1$/);
  await expectExpansionLit(page, "內容拓展 1");
  await expectFileShown(page, expansion);
  await expect(page.getByRole("radio", { name: "第 2 波" })).toBeChecked();
  await expect(timeDisplay(page)).toHaveText("40.0 秒");
  await expectDefaultSwitches(page, readSiteLevel(expansion), "NORMAL");

  await page.locator(`input[data-hidden-group="${group.name}"]`).check();
  await expansionButton(page, "原版").click();

  await expect(page).toHaveURL(/#\/level\/ro4_t_2\?v=normal$/);
  await expectExpansionLit(page, "原版");
  await expectFileShown(page, base);
  await expect(page.getByRole("radio", { name: "第 2 波" })).toBeChecked();
  await expect(timeDisplay(page)).toHaveText("40.0 秒");
  await expectDefaultSwitches(page, readSiteLevel(base), "NORMAL");

  await page.goBack();
  await expect(page).toHaveURL(/#\/$/);
});

for (const x of ["0", "-1", "1.5", "abc"]) {
  test(`x=${x} is no 拓展編號: 原版 shows`, async ({ page }) => {
    await page.goto(`#/level/ro4_n_1_1?x=${x}`);

    await expectFileShown(page, siteStage("ro4_n_1_1").variants[0]!.levelFile);
    await expectExpansionLit(page, "原版");
  });
}

for (const [from, to] of [
  ["ro4_n_1_1?v=replace1", "ro4_n_1_1?x=1"],
  ["ro5_n_7_1?v=replace1", "ro5_n_7_1?x=2"],
  ["ro4_e_1_1?v=replace2", "ro4_n_1_1?v=emergency&x=2"],
  ["ro4_e_1_1?x=1", "ro4_n_1_1?v=emergency&x=1"],
  ["ro4_n_1_1?v=replace1&x=2", "ro4_n_1_1?x=1"],
  ["ro4_n_1_1?v=replace3", "ro4_n_1_1"],
] as const) {
  test(`the old link ${from} opens ${to}, leaving no history entry behind`, async ({ page }) => {
    await page.goto("#/");
    await page.goto(`#/level/${from}`);

    await expect(page).toHaveURL(new RegExp(`#/level/${to.replace(/\?/g, "\\?")}$`));
    await expect(page.locator("svg.map")).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/#\/$/);
  });
}

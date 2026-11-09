import { expect, test, type Locator, type Page } from "@playwright/test";
import { readSiteJson, siteStage } from "./levelPage.ts";
import type { StageIndex } from "../src/level/index.ts";

const variantGroup = (page: Page) => page.getByRole("group", { name: "關卡變體" });

const look = (button: Locator) =>
  button.evaluate((el) => {
    const s = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return {
      left: box.left,
      right: box.right,
      borderLeft: parseFloat(s.borderLeftWidth),
      borderRight: parseFloat(s.borderRightWidth),
      leftRadius: [s.borderTopLeftRadius, s.borderBottomLeftRadius].map(parseFloat),
      rightRadius: [s.borderTopRightRadius, s.borderBottomRightRadius].map(parseFloat),
      background: s.backgroundColor,
    };
  });

const resolved = (page: Page, cssColor: string) =>
  page.evaluate((c) => {
    const probe = document.createElement("div");
    probe.style.backgroundColor = c;
    document.body.append(probe);
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return color;
  }, cssColor);

for (const [id, pressed] of [
  ["main_01-07", "normal"],
  ["main_11-06", "tough"],
] as const) {
  test(`${id}: the variant buttons join into one Segmented Button as wide as its buttons`, async ({
    page,
  }) => {
    const variants = siteStage(id).variants.map((v) => v.id);
    expect(variants.length, `${id} has more than one variant`).toBeGreaterThan(1);
    await page.goto(`#/level/${id}?v=${pressed}`);
    const group = variantGroup(page);
    const buttons = group.getByRole("button");
    await expect(buttons).toHaveCount(variants.length);
    const looks = await Promise.all((await buttons.all()).map(look));

    for (const [i, next] of looks.slice(1).entries()) {
      const prev = looks[i]!;
      const between = next.left + next.borderLeft - (prev.right - prev.borderRight);
      expect(between, `one border between buttons ${i} and ${i + 1}`).toBeCloseTo(
        Math.max(prev.borderRight, next.borderLeft),
        1,
      );
    }
    const first = looks[0]!;
    const last = looks.at(-1)!;
    for (const [i, b] of looks.entries()) {
      const outerLeft = b === first;
      const outerRight = b === last;
      for (const r of b.leftRadius) expect(r > 0, `button ${i} left corners`).toBe(outerLeft);
      for (const r of b.rightRadius) expect(r > 0, `button ${i} right corners`).toBe(outerRight);
    }
    const groupBox = (await group.boundingBox())!;
    expect(groupBox.width).toBeCloseTo(last.right - first.left, 0);
    const rowWidth = await group.evaluate((g) => g.parentElement!.clientWidth);
    expect(groupBox.width).toBeLessThan(rowWidth / 2);

    const accent = await resolved(page, "var(--accent)");
    const panel = await resolved(page, "var(--panel)");
    for (const [i, v] of variants.entries()) {
      await expect(buttons.nth(i)).toHaveAttribute("aria-pressed", String(v === pressed));
      expect(looks[i]!.background, `${v}'s fill`).toBe(v === pressed ? accent : panel);
    }
  });
}

test("a stage with a single variant shows no variant buttons", async ({ page }) => {
  const single = readSiteJson<StageIndex>("data/index.json")
    .areas.flatMap((a) => a.sections.flatMap((s) => s.stages))
    .find((s) => s.id.startsWith("main_") && s.variants.length === 1);
  expect(single, "some main stage has one variant").toBeDefined();
  await page.goto(`#/level/${single!.id}`);
  await expect(page.locator("svg.map")).toBeVisible();

  await expect(variantGroup(page)).toHaveCount(0);
});

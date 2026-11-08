// Smoke test: 集成戰略 stages in the built site (dist/), against the index the site ships.
import { expect, test } from "@playwright/test";
import { expectVariantShown, siteStage } from "./levelPage.ts";

test("a theme lists emergency operations apart, with their condition text", async ({ page }) => {
  const emergency = siteStage("ro1_e_1_1");
  await page.goto("#/");
  await page.locator('a[data-area="rogue_1"]').click();

  await expect(page.locator("h3", { hasText: "・緊急作戰" }).first()).toBeVisible();
  const row = page.locator('a[data-stage="ro1_e_1_1"]');
  await expect(row).toContainText(emergency.emergencyCondition!);

  await row.click();
  await expect(page).toHaveURL(/#\/level\/ro1_e_1_1\?v=emergency$/);
  await expect(page.locator("[data-emergency-condition]")).toHaveText(
    emergency.emergencyCondition!,
  );
  await expect(page.locator("svg.map")).toBeVisible();
});

test("a theme-4 node switches to its 替換地圖", async ({ page }) => {
  expect(siteStage("ro4_n_1_1").variants.map((v) => v.id)).toContain("replace1");
  await page.goto("#/level/ro4_n_1_1");

  await page.locator('button[data-variant="replace1"]').click();

  await expect(page).toHaveURL(/#\/level\/ro4_n_1_1\?v=replace1$/);
  await expectVariantShown(page, "replace1");
  await expect(page.locator("svg.map")).toBeVisible();
});

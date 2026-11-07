// Level page controls as a player uses them: 播放位置 lives on the page, not in the URL.
import { expect, type Page } from "@playwright/test";

/** Open `hash` in a fresh page load, as pasting a link into a new tab does. */
export async function openLink(page: Page, hash: string) {
  await page.goto("about:blank");
  await page.goto(hash);
}

export const timeDisplay = (page: Page) => page.locator(".controls output");

/** Drag the time slider to `t` seconds. */
export async function seek(page: Page, t: number) {
  await page.getByRole("slider", { name: "時間軸" }).fill(String(t));
  await expect(timeDisplay(page)).toHaveText(`${t.toFixed(1)} 秒`);
}

/** Press the button of the 0-based `wave`. */
export async function selectWave(page: Page, wave: number) {
  await page.getByRole("radio", { name: `第 ${wave + 1} 波` }).click();
}

/** The on/off switch of 條件出兵 `branch` (0-based, level-file order). */
export const conditionalSwitch = (page: Page, branch: number) =>
  page.locator(`[data-conditional="${branch}"] input[type="checkbox"]`);

/** Type `seconds` as the trigger second of 條件出兵 `branch`, already switched on. */
export async function setConditionalSecond(page: Page, branch: number, seconds: number) {
  const second = page.locator(`[data-conditional="${branch}"] input[type="number"]`);
  await second.fill(String(seconds));
  await second.press("Enter");
}

/** The variant buttons show `variant` as the one on screen. */
export async function expectVariantShown(page: Page, variant: string) {
  await expect(page.locator(`button[data-variant="${variant}"]`)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
}

// Level page controls as a player uses them: 播放位置 lives on the page, not in the URL.
import { expect, type Page } from "@playwright/test";

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

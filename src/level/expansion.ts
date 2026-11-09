// 內容拓展: which one a 內容拓展選擇 shows, and so which level file is on screen.
import type { Area, StageEntry, Variant } from "./types.ts";

/**
 * The 內容拓展 `choice` shows among `expansions`: the latest numbered no higher than `choice`.
 * Undefined for 原版: when `choice` is null or every 內容拓展 is numbered higher.
 */
export function shownExpansion<T extends { number: number }>(
  expansions: readonly T[] | undefined,
  choice: number | null,
): T | undefined {
  if (choice === null) return undefined;
  return (expansions ?? []).filter((x) => x.number <= choice).at(-1);
}

/**
 * 實際顯示的關卡檔 of `variant` under `choice`: the shown 內容拓展's file, else the variant's own.
 * The difficulty stays the variant's either way.
 */
export function shownLevelFile(stage: StageEntry, variant: Variant, choice: number | null): string {
  return shownExpansion(stage.expansions, choice)?.levelFile ?? variant.levelFile;
}

/**
 * The 拓展編號 a 集成戰略 theme offers, ascending: the union of its stages' 內容拓展. Empty for
 * any other area and for a theme without 內容拓展.
 */
export function themeExpansions(area: Area): number[] {
  if (area.kind !== "ROGUELIKE") return [];
  const numbers = area.sections.flatMap((s) => s.stages.flatMap((x) => x.expansions ?? []));
  return [...new Set(numbers.map((x) => x.number))].sort((a, b) => a - b);
}

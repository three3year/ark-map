import type { Area, StageEntry, Variant } from "./types.ts";

/** 內容拓展選擇: a 拓展編號, or null for 原版. */
export type ExpansionChoice = number | null;

/** The largest of `numbers` not above `choice`; null, 原版, when there is none. */
export function shownExpansion(
  numbers: readonly number[],
  choice: ExpansionChoice,
): ExpansionChoice {
  if (choice === null) return null;
  const fitting = numbers.filter((n) => n <= choice);
  return fitting.length > 0 ? Math.max(...fitting) : null;
}

/** 實際顯示的關卡檔. */
export function shownLevelFile(
  stage: StageEntry,
  variant: Variant,
  choice: ExpansionChoice,
): string {
  const expansions = stage.expansions ?? [];
  const shown = shownExpansion(
    expansions.map((x) => x.number),
    choice,
  );
  return expansions.find((x) => x.number === shown)?.levelFile ?? variant.levelFile;
}

/** The stage's variants that show `file`: every one for a 內容拓展's file, else those it is the own file of. */
export function variantsShowing(stage: StageEntry, file: string): Variant[] {
  const expansion = (stage.expansions ?? []).some((x) => x.levelFile === file);
  return stage.variants.filter((v) => expansion || v.levelFile === file);
}

export function themeExpansions(area: Area): number[] {
  if (area.kind !== "ROGUELIKE") return [];
  const numbers = area.sections.flatMap((s) => s.stages.flatMap((x) => x.expansions ?? []));
  return [...new Set(numbers.map((x) => x.number))].sort((a, b) => a - b);
}

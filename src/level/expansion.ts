import type { Area, StageEntry, Variant } from "./types.ts";

export function shownExpansion<T extends { number: number }>(
  expansions: readonly T[] | undefined,
  choice: number | null,
): T | undefined {
  if (choice === null) return undefined;
  return (expansions ?? []).filter((x) => x.number <= choice).at(-1);
}

export function shownLevelFile(stage: StageEntry, variant: Variant, choice: number | null): string {
  return shownExpansion(stage.expansions, choice)?.levelFile ?? variant.levelFile;
}

export function themeExpansions(area: Area): number[] {
  if (area.kind !== "ROGUELIKE") return [];
  const numbers = area.sections.flatMap((s) => s.stages.flatMap((x) => x.expansions ?? []));
  return [...new Set(numbers.map((x) => x.number))].sort((a, b) => a - b);
}

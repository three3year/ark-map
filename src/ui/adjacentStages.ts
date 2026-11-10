import type { ExpansionChoice, StageEntry, StageIndex, VariantId } from "../level/index.ts";
import { formatHash } from "./route.ts";

/** A link to 上一關 or 下一關. */
export interface StageLink {
  stage: StageEntry;
  href: string;
}

export interface AdjacentStages {
  prev: StageLink | null;
  next: StageLink | null;
}

/** The stage, variant and 內容拓展 choice on screen. */
export interface ShownStage {
  stageId: string;
  variant: VariantId;
  expansion: ExpansionChoice;
}

/**
 * The stages before and after the one on screen in its 區域, its sections' stages run together.
 * Neither wraps round nor leaves the area; a stage no area lists has neither. A link opens on the
 * variant on screen when the stage has it, else on the stage's base variant, and keeps the
 * 內容拓展 choice.
 */
export function adjacentStages(
  index: StageIndex,
  { stageId, variant, expansion }: ShownStage,
): AdjacentStages {
  for (const area of index.areas) {
    const stages = area.sections.flatMap((s) => s.stages);
    const at = stages.findIndex((s) => s.id === stageId);
    if (at < 0) continue;
    const link = (stage: StageEntry | undefined): StageLink | null =>
      stage
        ? {
            stage,
            href: formatHash({
              page: "level",
              stageId: stage.id,
              variant: stage.variants.some((v) => v.id === variant)
                ? variant
                : stage.variants[0]!.id,
              expansion,
            }),
          }
        : null;
    return { prev: link(stages[at - 1]), next: link(stages[at + 1]) };
  }
  return { prev: null, next: null };
}

// 上一關／下一關: the stages beside one in its 區域, in the stage list's order.
import type { StageEntry, StageIndex, VariantId } from "../level/index.ts";

export interface AdjacentStage {
  stage: StageEntry;
  /** The variant on screen when the stage has it, else the stage's base variant. */
  variant: VariantId;
}

/** A link to an adjacent stage. */
export interface StageLink {
  stage: StageEntry;
  /** Its 關卡連結. */
  href: string;
}

export interface AdjacentStages {
  prev: AdjacentStage | null;
  next: AdjacentStage | null;
}

/**
 * The stages before and after `stageId` in its 區域, its sections' stages run together. Neither
 * wraps round nor leaves the area; a stage no area lists has neither.
 */
export function adjacentStages(
  index: StageIndex,
  stageId: string,
  variant: VariantId,
): AdjacentStages {
  for (const area of index.areas) {
    const stages = area.sections.flatMap((s) => s.stages);
    const at = stages.findIndex((s) => s.id === stageId);
    if (at < 0) continue;
    const adjacent = (stage: StageEntry | undefined): AdjacentStage | null =>
      stage
        ? {
            stage,
            variant: stage.variants.some((v) => v.id === variant) ? variant : stage.variants[0]!.id,
          }
        : null;
    return { prev: adjacent(stages[at - 1]), next: adjacent(stages[at + 1]) };
  }
  return { prev: null, next: null };
}

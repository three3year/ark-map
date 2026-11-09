// Links from before 緊急作戰 became its node's variant and `replaceN` variants became 內容拓展.
import type { StageEntry } from "../level/index.ts";
import type { LevelRoute } from "./route.ts";

/**
 * Where an old link now points, or null when it is no old link: an old 緊急作戰 stage id opens its
 * node's variant, and `v=replaceN` becomes the N-th of the node's 內容拓展.
 */
export function legacyRedirect(
  route: LevelRoute,
  stages: readonly StageEntry[],
): LevelRoute | null {
  const replaced = /^replace([1-9]\d*)$/.exec(route.variant ?? "");
  const nthExpansion = (stage: StageEntry) =>
    replaced ? (stage.expansions?.[Number(replaced[1]) - 1]?.number ?? null) : route.expansion;

  const current = stages.find((s) => s.id === route.stageId);
  if (current) {
    return replaced ? { ...route, variant: null, expansion: nthExpansion(current) } : null;
  }
  for (const stage of stages) {
    const moved = stage.variants.find((v) => v.sourceStageId === route.stageId);
    if (!moved) continue;
    // The old stage's own base variant had the id it has now.
    const known = route.variant === null || route.variant === moved.id || replaced;
    return {
      page: "level",
      stageId: stage.id,
      variant: known ? moved.id : route.variant,
      expansion: nthExpansion(stage),
    };
  }
  return null;
}

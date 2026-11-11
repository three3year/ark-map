import type { Area, AreaKind, StageIndex } from "../level/index.ts";

const homeKinds: AreaKind[] = ["ROGUELIKE", "MAINLINE", "ACTIVITY", "CAMPAIGN"];

/** 區域 by kind in the home page's order, each kind's in the index's order; empty kinds left out. */
export function homeGroups(index: StageIndex): [AreaKind, Area[]][] {
  return homeKinds
    .map((kind): [AreaKind, Area[]] => [kind, index.areas.filter((a) => a.kind === kind)])
    .filter(([, areas]) => areas.length > 0);
}

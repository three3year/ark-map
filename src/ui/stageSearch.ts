import type { Area, StageEntry, StageIndex } from "../level/index.ts";
import { homeGroups } from "./homeGroups.ts";

export interface StageHit {
  area: Area;
  stage: StageEntry;
}

/**
 * 關卡 whose code or name contains `query`, ignoring case and the spaces around it, in the home
 * page's area order and each area's stage list order. null when there is nothing to search for,
 * which is not the same as finding nothing.
 */
export function searchStages(index: StageIndex, query: string): StageHit[] | null {
  const key = query.trim().toLowerCase();
  if (key === "") return null;
  const matches = (text: string) => text.toLowerCase().includes(key);
  return homeGroups(index).flatMap(([, areas]) =>
    areas.flatMap((area) =>
      area.sections.flatMap((s) =>
        s.stages
          .filter((stage) => matches(stage.code) || matches(stage.name))
          .map((stage) => ({ area, stage })),
      ),
    ),
  );
}

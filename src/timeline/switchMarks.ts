// 開關標記: which 開關 (隱藏組, 條件出兵, 隨機出兵組) put a spawn action on the field, each
// numbered from 1 per kind in the order the 開關面板 lists them.
import type { Level } from "../level/index.ts";
import { actionAt, type ActionRef, type SpawnPlan } from "./switches.ts";
import type { Timeline } from "./types.ts";

/** `branchIndex` indexes `Level.branches`; `key` is the branch's. */
type ConditionalMark = { kind: "conditional"; branchIndex: number; key: string };
type HiddenGroupMark = { kind: "hiddenGroup"; name: string };
/** `group` indexes `SpawnPlan.groups.random`; the weight is that of the action's candidate. */
type RandomMark = {
  kind: "random";
  group: number;
  candidate: number;
  weight: number;
  share: number;
};

/** One 開關標記: its kind, its number (from 1 per kind), and what names its 開關. */
export type SwitchMark = { number: number } & (ConditionalMark | HiddenGroupMark | RandomMark);

export type SwitchMarkKind = SwitchMark["kind"];

/**
 * The marks of a spawn action, 條件出兵 first, then 隱藏組, then one per 隨機出兵組 it is a
 * member of (picked or not). A 條件出兵 is numbered among those that spawn: a 純機關 has no mark.
 * 隱藏組 and 隨機出兵組 count every group, those that only move devices included.
 */
export function switchMarks(level: Level, plan: SpawnPlan, ref: ActionRef): SwitchMark[] {
  const marks: SwitchMark[] = [];
  if (ref.branchIndex !== null) {
    const branch = level.branches[ref.branchIndex]!;
    if (!branch.deviceOnly) {
      const number = level.branches
        .slice(0, ref.branchIndex + 1)
        .filter((b) => !b.deviceOnly).length;
      marks.push({ kind: "conditional", number, branchIndex: ref.branchIndex, key: branch.key });
    }
  }
  const { hiddenGroup } = actionAt(level, ref);
  const hidden = plan.groups.hidden.findIndex((g) => g.name === hiddenGroup);
  if (hiddenGroup !== null && hidden >= 0) {
    marks.push({ kind: "hiddenGroup", number: hidden + 1, name: hiddenGroup });
  }
  for (const { group, candidate } of plan.memberships(ref)) {
    const { weight, share } = plan.groups.random[group]!.candidates[candidate]!;
    marks.push({ kind: "random", number: group + 1, group, candidate, weight, share });
  }
  return marks;
}

const kindOrder: SwitchMarkKind[] = ["conditional", "hiddenGroup", "random"];

/**
 * The kinds of 開關標記 the wave's 敵人個體 carry, in mark order: what the legend lists. The whole
 * 基準時間軸 counts, not the enemies on field, so the list holds still during playback.
 */
export function switchMarkKinds(timeline: Timeline): SwitchMarkKind[] {
  const kinds = new Set(timeline.individuals.flatMap((i) => i.marks.map((m) => m.kind)));
  return kindOrder.filter((kind) => kinds.has(kind));
}

import type { Branch, Level } from "../level/index.ts";
import {
  actionAt,
  type ActionRef,
  type HiddenGroup,
  type RandomGroup,
  type SpawnPlan,
} from "./switches.ts";
import type { Timeline } from "./types.ts";

/** `branchIndex` indexes `Level.branches`; `key` is the branch's. */
type ConditionalMark = { kind: "conditional"; branchIndex: number; key: string };
type HiddenGroupMark = { kind: "hiddenGroup"; name: string };
/**
 * `group` indexes `SpawnPlan.groups.random`; the weight is that of the action's candidate, and
 * `picked` says whether this group picks it.
 */
type RandomMark = {
  kind: "random";
  group: number;
  candidate: number;
  weight: number;
  share: number;
  picked: boolean;
};

/** One 開關標記: its kind, its number (from 1 per kind), and what names its 開關. */
export type SwitchMark = { number: number } & (ConditionalMark | HiddenGroupMark | RandomMark);

export type SwitchMarkKind = SwitchMark["kind"];

/**
 * Every 開關 with a 開關標記, each kind in the 開關面板's order and numbered from 1 in it. A
 * 條件出兵 is numbered among those that spawn: a 純機關 has no mark. 隱藏組 and 隨機出兵組 count
 * every group, those that only move devices included.
 */
export interface MarkedSwitches {
  conditional: { branch: Branch; branchIndex: number; number: number }[];
  hidden: { group: HiddenGroup; number: number }[];
  /** `group` indexes `SpawnPlan.groups.random`. */
  random: { group: RandomGroup; index: number; number: number }[];
}

export function markedSwitches(level: Level, plan: SpawnPlan): MarkedSwitches {
  return {
    conditional: level.branches
      .map((branch, branchIndex) => ({ branch, branchIndex }))
      .filter(({ branch }) => !branch.deviceOnly)
      .map((b, i) => ({ ...b, number: i + 1 })),
    hidden: plan.groups.hidden.map((group, i) => ({ group, number: i + 1 })),
    random: plan.groups.random.map((group, index) => ({ group, index, number: index + 1 })),
  };
}

/**
 * The marks of a spawn action, 條件出兵 first, then 隱藏組, then one per 隨機出兵組 it is a
 * member of (picked or not), numbered as {@link markedSwitches} says.
 */
export function switchMarks(level: Level, plan: SpawnPlan, ref: ActionRef): SwitchMark[] {
  const marked = markedSwitches(level, plan);
  const marks: SwitchMark[] = [];
  const conditional = marked.conditional.find((c) => c.branchIndex === ref.branchIndex);
  if (conditional) {
    const { branch, branchIndex, number } = conditional;
    marks.push({ kind: "conditional", number, branchIndex, key: branch.key });
  }
  const { hiddenGroup } = actionAt(level, ref);
  const hidden = marked.hidden.find(({ group }) => group.name === hiddenGroup);
  if (hidden) marks.push({ kind: "hiddenGroup", number: hidden.number, name: hidden.group.name });
  for (const { group, candidate } of plan.memberships(ref)) {
    const { weight, share } = plan.groups.random[group]!.candidates[candidate]!;
    const picked = plan.picks[group] === candidate;
    const { number } = marked.random[group]!;
    marks.push({ kind: "random", number, group, candidate, weight, share, picked });
  }
  return marks;
}

/** Where each kind's marks go among an action's: the order {@link switchMarks} gives them in. */
const kindRank: Record<SwitchMarkKind, number> = { conditional: 0, hiddenGroup: 1, random: 2 };

/**
 * The kinds of 開關標記 the wave's 敵人個體 carry, in mark order: what the legend lists. The whole
 * 基準時間軸 counts, not the enemies on field, so the list holds still during playback.
 */
export function switchMarkKinds(timeline: Timeline): SwitchMarkKind[] {
  const kinds = new Set(timeline.individuals.flatMap((i) => i.marks.map((m) => m.kind)));
  return [...kinds].sort((a, b) => kindRank[a] - kindRank[b]);
}

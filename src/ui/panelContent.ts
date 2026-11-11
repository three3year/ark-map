// 顯示內容: the text the panels under the map show, worked out from the 關卡模型 and the 名稱表.
// The Svelte components only lay it out.
import {
  deviceActionKind,
  isKnownModifierKey,
  isSpawn,
  type Action,
  type BlackboardEntry,
  type Branch,
  type EnemyRef,
  type Level,
  type Modifier,
} from "../level/index.ts";
import { actionAt, type RandomCandidate } from "../timeline/index.ts";
import { strings } from "./strings.ts";

function deviceName(level: Level, alias: string): string {
  return level.devices.find((d) => d.alias === alias)?.name ?? alias.replace(/#\d+$/, "");
}

/**
 * What actions put on the field: enemies × count, devices, or nothing. Repeated entries show
 * once, so a branch activating ten ballistae (`trap_007_ballis#1` … `#10`) stays short.
 */
function actionsLabel(level: Level, actions: Action[]): string {
  const parts = actions.flatMap((action) => {
    if (!isSpawn(action)) {
      const kind = deviceActionKind(action);
      if (kind === null || !action.key) return [];
      const name = deviceName(level, action.key);
      return [kind === "withdraw" ? strings.withdrawDevice(name) : strings.device(name)];
    }
    if (!action.key) return [];
    return [`${level.enemies[action.key]?.name ?? action.key} × ${action.count}`];
  });
  return parts.length > 0 ? [...new Set(parts)].join("、") : strings.noSpawn;
}

/** A 隨機出兵組 candidate by what it puts on the field. */
export const candidateLabel = (level: Level, candidate: RandomCandidate): string =>
  actionsLabel(
    level,
    candidate.actions.map((ref) => actionAt(level, ref)),
  );

/** A 條件出兵 or 純機關 by what all its phases put on the field. */
export const branchLabel = (level: Level, branch: Branch): string =>
  actionsLabel(
    level,
    branch.phases.flatMap((p) => p.actions),
  );

/** One 難度修正 as the 關卡資訊 lists it: its name and its blackboard entries. */
export interface ModifierText {
  name: string;
  params: { label: string; value: string }[];
}

/** Multiplier modifiers' numbers read "×2"; enemy lists ("a|b") read as names. */
function entryValue(
  modifierKey: string,
  { key, value, valueStr }: BlackboardEntry,
  enemies: Record<string, EnemyRef>,
): string {
  if (valueStr === null) {
    const multiplies = modifierKey === "ebuff_attribute" || modifierKey.endsWith("_mul");
    return multiplies ? `×${value}` : String(value);
  }
  if (key === "enemy" || key === "enemy_exclude") {
    return valueStr
      .split("|")
      .map((id) => enemies[id]?.name ?? id)
      .join("、");
  }
  return valueStr;
}

export function modifierText(modifier: Modifier, enemies: Record<string, EnemyRef>): ModifierText {
  return {
    name: isKnownModifierKey(modifier.key)
      ? strings.modifierKeys[modifier.key]
      : strings.modifierUnknown,
    params: modifier.blackboard.map((entry) => ({
      label: strings.blackboardKeys[entry.key] ?? entry.key,
      value: entryValue(modifier.key, entry, enemies),
    })),
  };
}

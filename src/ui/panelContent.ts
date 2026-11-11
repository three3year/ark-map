// 顯示內容: the text the panels under the map show, worked out from the 關卡模型 and the 名稱表.
// The Svelte components only lay it out.
import { deviceActionKind, isSpawn, type Action, type Branch, type Level } from "../level/index.ts";
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

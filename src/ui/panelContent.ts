// 顯示內容: the text the panels under the map show, worked out from the 關卡模型 and the 名稱表.
// The Svelte components only lay it out.
import {
  affectsMovement,
  deviceActionKind,
  isKnownModifierKey,
  isSpawn,
  type Action,
  type BlackboardEntry,
  type Branch,
  type Difficulty,
  type EnemyRef,
  type Level,
  type LevelOptions,
  type Modifier,
  type VariantId,
} from "../level/index.ts";
import { actionAt, allActions, levelGroups, type RandomCandidate } from "../timeline/index.ts";
import { strings, variantLabel } from "./strings.ts";

/** The device an action's key names: by alias, else (an alias-less device) by its kind. */
function deviceName(level: Level, alias: string): string {
  const kind = alias.replace(/#\d+$/, "");
  const device =
    level.devices.find((d) => d.alias === alias) ?? level.devices.find((d) => d.key === kind);
  return device?.name ?? kind;
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

/** A 條件出兵 or 純機關 where its key used to show: the 開關面板 and a 隨機出兵組 in it. */
export interface ConditionalText {
  /** "裝置 {名稱}" when its key is the alias of one of the level's devices; null otherwise. */
  device: string | null;
  /** Its key in the level file, for the mouse-over hint. */
  hint: string;
  /** Where a 隨機出兵組 inside it sits: 條件出兵, plus the device when there is one. */
  source: string;
}

export function conditionalText(level: Level, branch: Branch): ConditionalText {
  const named = level.devices.find((d) => d.alias === branch.key);
  const device = named ? strings.device(named.name) : null;
  return { device, hint: branch.key, source: strings.conditionalSource(device) };
}

/** A 關卡變體 that shows the same level file: its 難度修正 decide which 隱藏組 start on. */
export interface SiblingVariant {
  id: VariantId;
  difficulty: Difficulty;
}

/** A 隱藏組 as the 開關面板 and the 出兵表 show it. */
export interface HiddenGroupText {
  /** What all its actions put on the field. */
  name: string;
  /** Its tag in the level file, for the mouse-over hint. */
  hint: string;
  /** 變體說明: the variants that switch it on by default; null when none does. */
  note: string | null;
  /** The 出兵表's badge. */
  badge: string;
}

/** 變體說明 of 隱藏組 `name` among `variants`, the level file's variants in stage order. */
function variantNote(
  level: Level,
  name: string,
  variants: readonly SiblingVariant[],
): string | null {
  const on = variants.filter(
    (v) => levelGroups(level, v.difficulty).hidden.find((g) => g.name === name)?.defaultOn,
  );
  if (on.length === 0) return null;
  if (on.length === variants.length) return strings.onInEveryVariant;
  return strings.onInVariants(on.map((v) => variantLabel(v.id)));
}

export function hiddenGroupText(
  level: Level,
  name: string,
  variants: readonly SiblingVariant[],
): HiddenGroupText {
  const actions = [...allActions(level)].flatMap(({ action }) =>
    action.hiddenGroup === name ? [action] : [],
  );
  const note = variantNote(level, name, variants);
  return {
    name: actionsLabel(level, actions),
    hint: name,
    note,
    badge: strings.hiddenGroupBadge(note),
  };
}

/** One 難度修正 parameter: "移速 ×2". `hint` is its mouse-over text. */
export interface ModifierParam {
  label: string;
  value: string;
  hint: string | null;
}

/**
 * One line of the 關卡資訊's 難度修正 list: "名稱 — 參數、參數", or "名稱 值" when all that is
 * left is a lone `value`.
 */
export interface ModifierLine {
  /** The modifier's raw key. */
  key: string;
  name: string;
  /** The name's mouse-over text: the raw key. */
  hint: string;
  /** The lone `value` that reads straight after the name; `params` is then empty. */
  value: string | null;
  params: ModifierParam[];
}

const multiplies = (modifierKey: string) =>
  modifierKey === "ebuff_attribute" || modifierKey.endsWith("_mul");

/** A multiplier at 1 or an addition of 0 changes nothing. */
function hasEffect(modifierKey: string, { value, valueStr }: BlackboardEntry): boolean {
  if (valueStr !== null) return true;
  if (multiplies(modifierKey)) return value !== 1;
  if (modifierKey.endsWith("_add")) return value !== 0;
  return true;
}

/** Parameters naming whom a modifier applies to; alone, they change nothing. */
const targetKeys = new Set(["enemy", "enemy_exclude", "char"]);

/** Multiplier modifiers' numbers read "×2"; enemy lists ("a|b") read as names. */
function entryValue(
  modifierKey: string,
  { key, value, valueStr }: BlackboardEntry,
  enemies: Record<string, EnemyRef>,
): string {
  if (valueStr === null) return multiplies(modifierKey) ? `×${value}` : String(value);
  if (key === "enemy" || key === "enemy_exclude") {
    return valueStr
      .split("|")
      .map((id) => enemies[id]?.name ?? id)
      .join("、");
  }
  return valueStr;
}

function modifierLine(level: Level, modifier: Modifier): ModifierLine | null {
  const entries = modifier.blackboard.filter((entry) => hasEffect(modifier.key, entry));
  if (entries.every((entry) => targetKeys.has(entry.key))) return null;
  const name = isKnownModifierKey(modifier.key)
    ? strings.modifierKeys[modifier.key]
    : strings.modifierUnknown;
  const line = { key: modifier.key, name, hint: modifier.key };
  const [first] = entries;
  if (entries.length === 1 && first?.key === "value") {
    return { ...line, value: entryValue(modifier.key, first, level.enemies), params: [] };
  }
  const moves = affectsMovement(modifier);
  return {
    ...line,
    value: null,
    params: entries.map((entry) => ({
      label: strings.blackboardKeys[entry.key] ?? entry.key,
      value: entryValue(modifier.key, entry, level.enemies),
      hint: moves && entry.key === "move_speed" ? strings.modifierMovesEnemies : null,
    })),
  };
}

/** The 難度修正 list: one line per modifier that changes something. */
export const modifierLines = (level: Level, modifiers: Modifier[]): ModifierLine[] =>
  modifiers.flatMap((modifier) => modifierLine(level, modifier) ?? []);

/** The 關卡資訊's numbers as one line: "可部署人數 8 · 生命值 3 · 初始費用 10 · 費用上限 99". */
export const levelNumbers = (options: LevelOptions): string =>
  [
    `${strings.characterLimit} ${options.characterLimit}`,
    `${strings.maxLifePoint} ${options.maxLifePoint}`,
    `${strings.initialCost} ${options.initialCost}`,
    `${strings.maxCost} ${options.maxCost}`,
  ].join(" · ");

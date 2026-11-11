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
  type EnemyRef,
  type Level,
  type LevelOptions,
  type Modifier,
  type NameTable,
} from "../level/index.ts";
import {
  actionAt,
  markedSwitches,
  type RandomCandidate,
  type SpawnPlan,
} from "../timeline/index.ts";
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
  /** The name's mouse-over text: the raw key, and an 環境機制's target. */
  hint: string;
  /** The lone `value` that reads straight after the name; `params` is then empty. */
  value: string | null;
  /** The 隱藏組 the modifier opens or closes, drawn as their 開關標記 after the name. */
  hiddenGroups: HiddenGroupMark[];
  params: ModifierParam[];
}

/** A 隱藏組 by its 開關標記's number, which the 開關面板 gives it. */
export interface HiddenGroupMark {
  name: string;
  number: number;
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

/** Parameters the game reads for its own bookkeeping (UI plugins, aliases, ...): never shown. */
const internalKeys = new Set([
  "rune_alias",
  "ui_plugin_name",
  "ui_plugin_path",
  "ui_plugin_position",
  "camera_plugin_name",
  "extra_load_bgm",
  "disable_ui_hub",
  "disable_click_character_info",
  "at_root",
  "include_predefined",
]);

/** 環境機制 and 環境全域效果: their `key` names the mechanism, shown only in the name's hint. */
const environmentKeys = new Set(["env_system_new", "env_gbuff_new", "env_gbuff_new_with_verify"]);

const hiddenGroupKeys = new Set(["level_hidden_group_enable", "level_hidden_group_disable"]);

/** Parameters naming whom a modifier applies to; alone, they change nothing. */
const targetKeys = new Set(["enemy", "enemy_exclude", "char"]);

/**
 * Multiplier modifiers' numbers read "×2". Text lists ("a|b") read as names, each once: enemy
 * ids as enemies, `tile`'s keys as 地形; cells keep their order and repeats.
 */
function entryValue(
  level: Level,
  modifierKey: string,
  { key, value, valueStr }: BlackboardEntry,
  { names }: ModifierContext,
): string {
  if (valueStr === null) return multiplies(modifierKey) ? `×${value}` : String(value);
  const parts = valueStr.split("|");
  if (key === "location") return parts.join("、");
  const shown = parts.map((part) => {
    if (key === "tile") return names.terrain[part]?.name ?? part;
    if (key === "enemy" || key === "enemy_exclude") return level.enemies[part]?.name ?? part;
    return part;
  });
  return [...new Set(shown)].join("、");
}

/** What 難度修正 lines are worked out against besides the level. */
export interface ModifierContext {
  /** Names of the 地形, enemies and device kinds the level itself does not have. */
  names: NameTable;
  /** The variant's spawn plan: 隱藏組 marks number as the 開關面板 does. */
  plan: SpawnPlan;
}

/** The 隱藏組 "a|b" names; one with no action in the level is left out, as switching it is moot. */
function hiddenGroupMarks(level: Level, names: string, plan: SpawnPlan): HiddenGroupMark[] {
  const marked = markedSwitches(level, plan).hidden;
  return names.split("|").flatMap((name) => {
    const number = marked.find(({ group }) => group.name === name)?.number;
    return number === undefined ? [] : [{ name, number }];
  });
}

/**
 * `level_predefines_enable`'s entries, one per device alias: "名稱 開", or "名稱 × N 開" for N
 * devices of the same name and state.
 */
function presetDeviceParams(
  level: Level,
  entries: BlackboardEntry[],
  { names }: ModifierContext,
): ModifierParam[] {
  const counts = new Map<string, { name: string; on: boolean; count: number }>();
  for (const { key, value } of entries) {
    const kind = key.replace(/#\d+$/, "");
    const name =
      level.devices.find((d) => d.alias === key)?.name ?? names.devices[kind]?.name ?? key;
    const on = value !== 0;
    const id = `${on}:${name}`;
    const seen = counts.get(id);
    if (seen) seen.count++;
    else counts.set(id, { name, on, count: 1 });
  }
  return [...counts.values()].map(({ name, on, count }) => ({
    label: name,
    value: `${count > 1 ? `× ${count} ` : ""}${on ? strings.deviceOn : strings.deviceOff}`,
    hint: null,
  }));
}

function modifierLine(
  level: Level,
  modifier: Modifier,
  context: ModifierContext,
): ModifierLine | null {
  const environment = environmentKeys.has(modifier.key);
  const opensGroups = hiddenGroupKeys.has(modifier.key);
  // An 環境機制's or 隱藏組 modifier's `key` names its target: no parameter of its own.
  const ownsKey = environment || opensGroups;
  const target = ownsKey
    ? (modifier.blackboard.find((entry) => entry.key === "key")?.valueStr ?? null)
    : null;
  const entries = modifier.blackboard.filter(
    (entry) =>
      !internalKeys.has(entry.key) &&
      !(ownsKey && entry.key === "key") &&
      hasEffect(modifier.key, entry),
  );
  const hiddenGroups =
    opensGroups && target !== null ? hiddenGroupMarks(level, target, context.plan) : [];
  if (hiddenGroups.length === 0 && entries.every((entry) => targetKeys.has(entry.key))) {
    return null;
  }
  const name = isKnownModifierKey(modifier.key)
    ? strings.modifierKeys[modifier.key]
    : strings.modifierUnknown;
  const hint = environment && target !== null ? `${modifier.key} · ${target}` : modifier.key;
  const line = { key: modifier.key, name, hint, hiddenGroups };
  const [first] = entries;
  if (entries.length === 1 && first?.key === "value") {
    return { ...line, value: entryValue(level, modifier.key, first, context), params: [] };
  }
  if (modifier.key === "level_predefines_enable") {
    return { ...line, value: null, params: presetDeviceParams(level, entries, context) };
  }
  const moves = affectsMovement(modifier);
  return {
    ...line,
    value: null,
    params: entries.map((entry) => ({
      label: strings.blackboardKeys[entry.key] ?? entry.key,
      value: entryValue(level, modifier.key, entry, context),
      hint: moves && entry.key === "move_speed" ? strings.modifierMovesEnemies : null,
    })),
  };
}

/** The 難度修正 list: one line per modifier that changes something. */
export const modifierLines = (
  level: Level,
  modifiers: Modifier[],
  context: ModifierContext,
): ModifierLine[] => modifiers.flatMap((modifier) => modifierLine(level, modifier, context) ?? []);

/** The 關卡資訊's numbers as one line: "可部署人數 8 · 生命值 3 · 初始費用 10 · 費用上限 99". */
export const levelNumbers = (options: LevelOptions): string =>
  [
    `${strings.characterLimit} ${options.characterLimit}`,
    `${strings.maxLifePoint} ${options.maxLifePoint}`,
    `${strings.initialCost} ${options.initialCost}`,
    `${strings.maxCost} ${options.maxCost}`,
  ].join(" · ");

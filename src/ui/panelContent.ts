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
  type NameTable,
  type VariantId,
  targetsEnemy,
} from "../level/index.ts";
import {
  actionAt,
  allActions,
  levelGroups,
  markedSwitches,
  type RandomCandidate,
  type SpawnPlan,
} from "../timeline/index.ts";
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

/** The 10 敵人屬性, as `EnemyRef` fields, in the order the selection card lists them. */
export const enemyAttributeKeys = [
  "maxHp",
  "atk",
  "def",
  "magicResistance",
  "baseAttackTime",
  "attackSpeed",
  "rangeRadius",
  "moveSpeed",
  "massLevel",
  "lifePointReduce",
] as const satisfies readonly (keyof EnemyRef)[];

export type EnemyAttributeKey = (typeof enemyAttributeKeys)[number];

/** Rounded to whole numbers; the rest to two decimals. */
const wholeAttributes: ReadonlySet<EnemyAttributeKey> = new Set([
  "maxHp",
  "atk",
  "def",
  "lifePointReduce",
]);

/** The attribute an 敵人屬性倍率 or 敵人屬性加值 blackboard key changes, by lower-case key. */
const blackboardAttributes: Record<string, EnemyAttributeKey> = {
  max_hp: "maxHp",
  hp_max: "maxHp",
  atk: "atk",
  def: "def",
  magic_resistance: "magicResistance",
  attack_speed: "attackSpeed",
  move_speed: "moveSpeed",
  mass_level: "massLevel",
  map_hp: "lifePointReduce",
};

interface AttributeChange {
  attribute: EnemyAttributeKey;
  kind: "multiply" | "add";
  value: number;
}

/** What one modifier's blackboard does to the 敵人屬性, before narrowing to its enemies. */
function attributeChanges({ key, blackboard }: Modifier): AttributeChange[] {
  const changes = (
    kind: AttributeChange["kind"],
    attributeOf: (entryKey: string) => EnemyAttributeKey | undefined,
  ) =>
    blackboard.flatMap(({ key: entryKey, value, valueStr }): AttributeChange[] => {
      const attribute = valueStr === null ? attributeOf(entryKey) : undefined;
      return attribute ? [{ attribute, kind, value }] : [];
    });
  const byTable = (entryKey: string) => blackboardAttributes[entryKey.toLowerCase()];
  switch (key) {
    case "ebuff_attribute":
    case "enemy_attribute_mul":
      return changes("multiply", byTable);
    case "enemy_attribute_add":
      return changes("add", byTable);
    case "enemy_attackradius_mul":
    case "ebuff_attack_radius":
      return changes("multiply", (k) =>
        k === "scale" || k === "range_scale" ? "rangeRadius" : undefined,
      );
    case "enemy_weight_add":
    case "ebuff_weight":
      return changes("add", (k) => (k === "value" ? "massLevel" : undefined));
    default:
      return [];
  }
}

/** One 敵人屬性 as the selection card shows it. */
export interface EnemyAttribute {
  key: EnemyAttributeKey;
  label: string;
  /** After the variant's 難度修正, rounded. */
  value: number;
  /** The enemy's own value: its level, with the level's overwrites. */
  base: number;
  /** Every multiplier the variant's 難度修正 give this enemy here, in modifier order. */
  multipliers: number[];
  /** Every addition, in modifier order. */
  additions: number[];
  /** The value differs from the base. */
  modified: boolean;
  text: string;
  /** "基礎 420 ×1.2 +50" for a modified value; null otherwise. */
  tooltip: string | null;
}

const round = (value: number, digits: number) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

/**
 * The 敵人屬性 of `enemy` under `modifiers` (the variant's 難度修正): base × the product of the
 * multipliers, rounded, plus the additions. 移速 stays in the enemy data's unit (屬性移速), not
 * multiplied by the level's move-speed multiplier.
 */
export function enemyAttributes(enemy: EnemyRef, modifiers: Modifier[]): EnemyAttribute[] {
  const changes = modifiers.flatMap((m) => (targetsEnemy(m, enemy.id) ? attributeChanges(m) : []));
  return enemyAttributeKeys.map((key) => {
    const digits = wholeAttributes.has(key) ? 0 : 2;
    const format = (n: number) => strings.enemyAttributeValue(key, round(n, digits));
    const own = changes.filter((c) => c.attribute === key);
    const multipliers = own.filter((c) => c.kind === "multiply").map((c) => c.value);
    const additions = own.filter((c) => c.kind === "add").map((c) => c.value);
    const product = multipliers.reduce((p, m) => p * m, 1);
    const sum = additions.reduce((s, a) => s + a, 0);
    const base = enemy[key];
    const value = round(round(base * product, digits) + sum, digits);
    const modified = value !== base;
    return {
      key,
      label: strings.enemyAttributes[key],
      value,
      base,
      multipliers,
      additions,
      modified,
      text: format(value),
      tooltip: modified ? strings.attributeTooltip(format(base), round(product, 4), sum) : null,
    };
  });
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
 * Multiplier modifiers' numbers read "×2". Text lists ("a|b") read as names, each once: `tile`'s
 * keys as 地形, any other part as the enemy or device kind it names, else as is. Cells keep their
 * order and repeats.
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
  const shown = parts.map((part) =>
    key === "tile"
      ? (names.terrain[part]?.name ?? part)
      : (level.enemies[part]?.name ??
        names.enemies[part] ??
        level.devices.find((d) => d.key === part)?.name ??
        names.devices[part]?.name ??
        part),
  );
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

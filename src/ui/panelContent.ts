import {
  affectsMovement,
  deviceActionKind,
  hiddenGroupSwitch,
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

const aliasedDevice = (level: Level, alias: string) => level.devices.find((d) => d.alias === alias);

/**
 * A device by its alias: the level's device with that alias, else the 名稱表's name for its kind
 * (the alias without `#n`), else the alias as is.
 */
function deviceName(level: Level, names: NameTable, alias: string): string {
  return (
    aliasedDevice(level, alias)?.name ?? names.devices[alias.replace(/#\d+$/, "")]?.name ?? alias
  );
}

function actionsLabel(level: Level, names: NameTable, actions: Action[]): string {
  const parts = actions.flatMap((action) => {
    if (!isSpawn(action)) {
      const kind = deviceActionKind(action);
      if (kind === null || !action.key) return [];
      const name = deviceName(level, names, action.key);
      return [kind === "withdraw" ? strings.withdrawDevice(name) : strings.device(name)];
    }
    if (!action.key) return [];
    return [strings.enemyCount(level.enemies[action.key]?.name ?? action.key, action.count)];
  });
  return parts.length > 0 ? strings.list([...new Set(parts)]) : strings.noSpawn;
}

export const candidateLabel = (
  level: Level,
  names: NameTable,
  candidate: RandomCandidate,
): string =>
  actionsLabel(
    level,
    names,
    candidate.actions.map((ref) => actionAt(level, ref)),
  );

export const branchLabel = (level: Level, names: NameTable, branch: Branch): string =>
  actionsLabel(
    level,
    names,
    branch.phases.flatMap((p) => p.actions),
  );

export interface ConditionalText {
  /** "裝置 {名稱}" when its key is the alias of one of the level's devices; null otherwise. */
  device: string | null;
  /** Its key in the level file, for the mouse-over hint. */
  hint: string;
  /** Where a 隨機出兵組 inside it sits: 條件出兵, plus the device when there is one. */
  source: string;
}

export function conditionalText(level: Level, branch: Branch): ConditionalText {
  const named = aliasedDevice(level, branch.key);
  const device = named ? strings.device(named.name) : null;
  return { device, hint: branch.key, source: strings.conditionalSource(device) };
}

/** A 關卡變體 showing the level file on display (`variantsShowing`). */
export interface FileVariant {
  id: VariantId;
  difficulty: Difficulty;
}

export interface HiddenGroupText {
  /** What its actions put on the field, e.g. "源石蟲 × 3、裝置 碎石". */
  content: string;
  /** Its tag in the level file, for the mouse-over hint. */
  hint: string;
  /** 說明: its 隱藏組來源, then its 變體說明; null when it has neither. */
  note: string | null;
  badge: string;
}

function variantNote(
  level: Level,
  name: string,
  fileVariants: readonly FileVariant[],
): string | null {
  if (fileVariants.length < 2) return null;
  const on = fileVariants.filter(
    (v) => levelGroups(level, v.difficulty).hidden.find((g) => g.name === name)?.defaultOn,
  );
  if (on.length === 0) return null;
  if (on.length === fileVariants.length) return strings.onInEveryVariant;
  return strings.onInVariants(on.map((v) => variantLabel(v.id)));
}

export function hiddenGroupText(
  level: Level,
  names: NameTable,
  name: string,
  fileVariants: readonly FileVariant[],
): HiddenGroupText {
  const actions = [...allActions(level)].flatMap(({ action }) =>
    action.hiddenGroup === name ? [action] : [],
  );
  const sources = level.hiddenGroupSources[name] ?? [];
  const sourceTexts = unique(
    sources.map((s) => strings.hiddenGroupSource(s.kind, s.name, s.opens)),
  );
  const variant = variantNote(level, name, fileVariants);
  const parts = [
    ...(sourceTexts.length > 0 ? [strings.hiddenGroupSources(sourceTexts)] : []),
    ...(variant ? [variant] : []),
  ];
  const openers = unique(sources.filter((s) => s.opens).map((s) => s.name));
  return {
    content: actionsLabel(level, names, actions),
    hint: name,
    note: parts.length > 0 ? strings.hiddenGroupNote(parts) : null,
    badge: strings.hiddenGroupBadge(openers.length > 0 ? strings.list(openers) : variant),
  };
}

const unique = (texts: string[]) => [...new Set(texts)];

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

const wholeAttributes: ReadonlySet<EnemyAttributeKey> = new Set([
  "maxHp",
  "atk",
  "def",
  "lifePointReduce",
]);

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

type ModifierKind = "multiply" | "add";

/** The `ebuff_` modifiers whose kind their key's ending does not tell. */
const ebuffKinds: ReadonlyMap<string, ModifierKind> = new Map([
  ["ebuff_attribute", "multiply"],
  ["ebuff_attack_radius", "multiply"],
  ["ebuff_weight", "add"],
]);

/**
 * Whether a modifier's numbers multiply (written "×n", no effect at 1) or add (no effect at 0),
 * by its key alone; null for any other.
 */
function modifierKind(modifierKey: string): ModifierKind | null {
  const ebuff = ebuffKinds.get(modifierKey);
  if (ebuff) return ebuff;
  if (modifierKey.endsWith("_mul")) return "multiply";
  if (modifierKey.endsWith("_add")) return "add";
  return null;
}

/** The 敵人屬性 a modifier's blackboard entry changes, by the modifier's key. */
function changedAttribute(modifierKey: string, entryKey: string): EnemyAttributeKey | undefined {
  switch (modifierKey) {
    case "ebuff_attribute":
    case "enemy_attribute_mul":
    case "enemy_attribute_add":
      return blackboardAttributes[entryKey.toLowerCase()];
    case "enemy_attackradius_mul":
    case "ebuff_attack_radius":
      return entryKey === "scale" || entryKey === "range_scale" ? "rangeRadius" : undefined;
    case "enemy_weight_add":
    case "ebuff_weight":
      return entryKey === "value" ? "massLevel" : undefined;
    default:
      return undefined;
  }
}

interface AttributeChange {
  attribute: EnemyAttributeKey;
  kind: ModifierKind;
  value: number;
}

function attributeChanges({ key, blackboard }: Modifier): AttributeChange[] {
  const kind = modifierKind(key);
  if (kind === null) return [];
  return blackboard.flatMap(({ key: entryKey, value, valueStr }): AttributeChange[] => {
    const attribute = valueStr === null ? changedAttribute(key, entryKey) : undefined;
    return attribute ? [{ attribute, kind, value }] : [];
  });
}

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

/**
 * The radius of the 攻擊範圍 the map draws around `enemy`: its 攻擊範圍 屬性 under
 * `modifiers`, the number the selection card shows. Null (not drawn) unless it attacks RANGED
 * or ALL and the radius is above 0.
 */
export function attackRadius(enemy: EnemyRef, modifiers: Modifier[]): number | null {
  if (enemy.applyWay !== "RANGED" && enemy.applyWay !== "ALL") return null;
  const radius = enemyAttributes(enemy, modifiers).find((a) => a.key === "rangeRadius")!.value;
  return radius > 0 ? radius : null;
}

export interface ModifierParam {
  label: string;
  value: string;
  hint: string | null;
}

interface ModifierLineHead {
  key: string;
  name: string;
  /** The name's mouse-over text: the raw key, and an 環境機制's target. */
  hint: string;
  hiddenGroups: HiddenGroupMark[];
}

/** "名稱 值": all that is left is a lone `value`. */
export interface ValueModifierLine extends ModifierLineHead {
  value: string;
}

/** "名稱 — 參數、參數". */
export interface ParamsModifierLine extends ModifierLineHead {
  params: ModifierParam[];
}

/** One line of the 關卡資訊's 難度修正 list. */
export type ModifierLine = ValueModifierLine | ParamsModifierLine;

/** A 隱藏組 by its 開關標記's number, which the 開關面板 gives it. */
export interface HiddenGroupMark {
  name: string;
  number: number;
}

function hasEffect(modifierKey: string, { value, valueStr }: BlackboardEntry): boolean {
  if (valueStr !== null) return true;
  switch (modifierKind(modifierKey)) {
    case "multiply":
      return value !== 1;
    case "add":
      return value !== 0;
    case null:
      return true;
  }
}

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

const environmentKeys = new Set(["env_system_new", "env_gbuff_new", "env_gbuff_new_with_verify"]);

const targetKeys = new Set(["enemy", "enemy_exclude", "char"]);

function entryValue(
  level: Level,
  modifierKey: string,
  { key, value, valueStr }: BlackboardEntry,
  { names }: ModifierContext,
): string {
  if (valueStr === null) {
    return modifierKind(modifierKey) === "multiply" ? strings.multiplier(value) : String(value);
  }
  const parts = valueStr.split("|");
  if (key === "location") return strings.list(parts);
  return strings.list(
    parts.map((part) =>
      key === "tile"
        ? (names.terrain[part]?.name ?? part)
        : (level.enemies[part]?.name ?? names.enemies[part] ?? names.devices[part]?.name ?? part),
    ),
  );
}

export interface ModifierContext {
  names: NameTable;
  /** The variant's spawn plan: 隱藏組 marks number as the 開關面板 does. */
  plan: SpawnPlan;
}

function hiddenGroupMarks(level: Level, names: string, plan: SpawnPlan): HiddenGroupMark[] {
  const marked = markedSwitches(level, plan).hidden;
  return names.split("|").flatMap((name) => {
    const number = marked.find(({ group }) => group.name === name)?.number;
    return number === undefined ? [] : [{ name, number }];
  });
}

function presetDeviceParams(
  level: Level,
  entries: BlackboardEntry[],
  { names }: ModifierContext,
): ModifierParam[] {
  const counts = new Map<string, { name: string; on: boolean; count: number }>();
  for (const { key, value } of entries) {
    const name = deviceName(level, names, key);
    const on = value !== 0;
    const id = `${on}:${name}`;
    const seen = counts.get(id);
    if (seen) seen.count++;
    else counts.set(id, { name, on, count: 1 });
  }
  return [...counts.values()].map(({ name, on, count }) => ({
    label: name,
    value: strings.presetDeviceState(count, on),
    hint: null,
  }));
}

function modifierLine(
  level: Level,
  modifier: Modifier,
  context: ModifierContext,
): ModifierLine | null {
  const environment = environmentKeys.has(modifier.key);
  const switchesGroups = hiddenGroupSwitch(modifier.key) !== null;
  const keyNamesTarget = environment || switchesGroups;
  const target = keyNamesTarget
    ? (modifier.blackboard.find((entry) => entry.key === "key")?.valueStr ?? null)
    : null;
  const entries = modifier.blackboard.filter(
    (entry) =>
      !internalKeys.has(entry.key) &&
      !(keyNamesTarget && entry.key === "key") &&
      hasEffect(modifier.key, entry),
  );
  const hiddenGroups =
    switchesGroups && target !== null ? hiddenGroupMarks(level, target, context.plan) : [];
  if (hiddenGroups.length === 0 && entries.every((entry) => targetKeys.has(entry.key))) {
    return null;
  }
  const name = isKnownModifierKey(modifier.key)
    ? strings.modifierKeys[modifier.key]
    : strings.modifierUnknown;
  const hint =
    environment && target !== null ? strings.environmentHint(modifier.key, target) : modifier.key;
  const line = { key: modifier.key, name, hint, hiddenGroups };
  const [first] = entries;
  if (entries.length === 1 && first?.key === "value") {
    return { ...line, value: entryValue(level, modifier.key, first, context) };
  }
  if (modifier.key === "level_predefines_enable") {
    return { ...line, params: presetDeviceParams(level, entries, context) };
  }
  const moves = affectsMovement(modifier);
  return {
    ...line,
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

export const levelNumbers = (options: LevelOptions): string =>
  strings.levelNumbers([
    [strings.characterLimit, options.characterLimit],
    [strings.maxLifePoint, options.maxLifePoint],
    [strings.initialCost, options.initialCost],
    [strings.maxCost, options.maxCost],
  ]);

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
  targetsEnemy,
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

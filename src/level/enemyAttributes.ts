import type { EnemyRef } from "./types.ts";

/** The `EnemyRef` numbers the 9 敵人屬性 are read from: 攻擊間隔 from two of them, with 攻速. */
export const enemyAttributeFields = [
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

export type EnemyAttributeField = (typeof enemyAttributeFields)[number];

export type EnemyAttributeFields = Pick<EnemyRef, EnemyAttributeField>;

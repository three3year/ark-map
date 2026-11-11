// A hand-built 敵人 for tests that build their level by hand.
import type { EnemyRef } from "../src/level/index.ts";

/** `enemy_test`: a walking enemy at 1 cell/s that does nothing else, with `overrides` on top. */
export function testEnemy(overrides: Partial<EnemyRef> = {}): EnemyRef {
  return {
    id: "enemy_test",
    level: 0,
    name: "測試",
    code: null,
    moveSpeed: 1,
    motion: "WALK",
    levelType: "NORMAL",
    maxHp: 1,
    atk: 0,
    def: 0,
    magicResistance: 0,
    baseAttackTime: 0,
    attackSpeed: 100,
    rangeRadius: 0,
    applyWay: "NONE",
    massLevel: 0,
    lifePointReduce: 1,
    notCountInTotal: false,
    avatar: null,
    ...overrides,
  };
}

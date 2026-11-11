import { describe, expect, it } from "vitest";
import { loadFixtureLevel } from "../../test-fixtures/load.ts";
import { spawnPlan } from "../timeline/index.ts";
import { variantModifiers } from "../level/index.ts";
import {
  branchLabel,
  candidateLabel,
  enemyAttributes,
  modifierText,
  type EnemyAttribute,
} from "./panelContent.ts";

describe("隨機出兵組 candidates: 公害 (ro4_n_1_2)", () => {
  const level = loadFixtureLevel("level_rogue4_1-2");
  const plan = spawnPlan(level, "NORMAL");
  const labels = (key: string) =>
    plan.groups.random.find((g) => g.key === key)!.candidates.map((c) => candidateLabel(level, c));

  it("names a device candidate by its device, and the empty one 不出兵", () => {
    expect(labels("t1")).toEqual(["不出兵", "裝置 寶箱", "裝置 停滯巧械", "裝置 垂死羽獸"]);
  });

  it("names an enemy candidate by enemy × count", () => {
    expect(labels("d1")).toEqual([
      "不出兵",
      "圓仔 × 1",
      "流淚小子 × 1",
      "鴨爵 × 1",
      "高普尼克 × 1",
    ]);
  });
});

describe("純機關: 5-10", () => {
  const level = loadFixtureLevel("level_main_05-10");

  it("names ten ballistae once", () => {
    const branch = level.branches.find((b) => b.key === "faust_ballis")!;
    expect(branchLabel(level, branch)).toBe("裝置 弩炮");
  });
});

describe("敵人屬性", () => {
  /** The 敵人屬性 of `enemyId` in the challenge (突襲) variant of a fixture level. */
  const challengeAttributes = (name: string, enemyId: string) => {
    const level = loadFixtureLevel(name);
    const modifiers = variantModifiers(level.modifiers, "FOUR_STAR");
    return enemyAttributes(level.enemies[enemyId]!, modifiers);
  };
  const attribute = (attributes: EnemyAttribute[], label: string) =>
    attributes.find((a) => a.label === label)!;

  it("act10mini 4 突襲: ×1.1 for all and ×2 for one enemy multiply to its HP ×2.2", () => {
    const leader = attribute(
      challengeAttributes("level_act10mini_04", "enemy_1045_hammer_2"),
      "生命值",
    );
    expect(leader).toMatchObject({ text: "44000", modified: true, tooltip: "基礎 20000 ×2.2" });
    const member = attribute(
      challengeAttributes("level_act10mini_04", "enemy_1045_hammer"),
      "生命值",
    );
    expect(member).toMatchObject({ text: "11000", modified: true, tooltip: "基礎 10000 ×1.1" });
  });

  it("4-4 突襲: the soldier's 10 屬性 in order; 移速 ×2 is modified, 攻擊 ×1 is not", () => {
    const attributes = challengeAttributes("level_main_04-04", "enemy_1002_nsabr");
    expect(attributes.map((a) => [a.label, a.text])).toEqual([
      ["生命值", "2200"],
      ["攻擊", "200"],
      ["防禦", "100"],
      ["法術抗性", "0"],
      ["攻擊間隔", "2秒"],
      ["攻速", "100"],
      ["攻擊範圍", "0"],
      ["移速", "2.2"],
      ["重量", "1"],
      ["關卡生命", "1"],
    ]);
    expect(attribute(attributes, "移速")).toMatchObject({ modified: true, tooltip: "基礎 1.1 ×2" });
    expect(attribute(attributes, "攻擊")).toMatchObject({ modified: false, tooltip: null });
  });

  it("act20side EX-1 突襲: the enemy the multiplier excludes keeps its base", () => {
    const car = challengeAttributes("level_act20side_ex01", "enemy_1265_durcar");
    expect(attribute(car, "生命值")).toMatchObject({ text: "100", modified: false });
    const member = challengeAttributes("level_act20side_ex01", "enemy_1258_durman_2");
    expect(attribute(member, "生命值")).toMatchObject({ text: "4320", modified: true });
  });

  it("act16mini 3 突襲: 攻擊 ×1.2, rounded, then +300 for the one enemy the addition names", () => {
    const scorpion = challengeAttributes("level_act16mini_03", "enemy_1100_scorpn");
    // 380 × 1.2 = 456, + 300.
    expect(attribute(scorpion, "攻擊")).toMatchObject({
      text: "756",
      multipliers: [1.2],
      additions: [300],
      tooltip: "基礎 380 ×1.2 +300",
    });
    const warrior = challengeAttributes("level_act16mini_03", "enemy_1093_ccsbr");
    // 290 × 1.2 = 348.
    expect(attribute(warrior, "攻擊")).toMatchObject({ text: "348", tooltip: "基礎 290 ×1.2" });
  });

  it("act50side EX-1 突襲: hp_max counts as 生命值", () => {
    const boss = challengeAttributes("level_act50side_ex01", "enemy_10132_pyceat_2");
    // 14500 × 1.2 × 1.5.
    expect(attribute(boss, "生命值")).toMatchObject({ text: "26100", tooltip: "基礎 14500 ×1.8" });
  });

  it("重量 additions: act25side 10's −5 for all, 2-8 突襲's ebuff_weight +2", () => {
    const level = loadFixtureLevel("level_act25side_10");
    const dog = enemyAttributes(
      level.enemies["enemy_1325_cbgpro"]!,
      variantModifiers(level.modifiers, "NORMAL"),
    );
    expect(attribute(dog, "重量")).toMatchObject({ text: "-4", tooltip: "基礎 1 -5" });
    const soldier = challengeAttributes("level_main_02-08", "enemy_1002_nsabr");
    expect(attribute(soldier, "重量")).toMatchObject({ text: "3", tooltip: "基礎 1 +2" });
  });

  it("rounds the two-decimal 屬性 and drops trailing zeros", () => {
    const level = loadFixtureLevel("level_main_04-04");
    const soldier = level.enemies["enemy_1002_nsabr"]!;
    const slow = {
      key: "enemy_attribute_mul",
      difficulties: [],
      blackboard: [{ key: "move_speed", value: 1.234, valueStr: null }],
    };
    // 1.1 × 1.234 = 1.3574.
    expect(attribute(enemyAttributes(soldier, [slow]), "移速").text).toBe("1.36");
  });
});

describe("難度修正 text", () => {
  const challenge = (name: string) => {
    const level = loadFixtureLevel(name);
    return { level, modifiers: variantModifiers(level.modifiers, "FOUR_STAR") };
  };

  it("4-4 突襲: names each modifier; multiplier numbers read ×", () => {
    const { level, modifiers } = challenge("level_main_04-04");
    expect(modifiers.map((m) => modifierText(m, level.enemies))).toEqual([
      { name: "關卡生命值", params: [{ label: "數值", value: "1" }] },
      {
        name: "敵人屬性倍率",
        params: [
          { label: "攻擊", value: "×1" },
          { label: "防禦", value: "×1" },
          { label: "map_hp", value: "×1" },
          { label: "移速", value: "×2" },
        ],
      },
    ]);
  });

  it("5-10 突襲: 指定敵人 reads as the enemy's name", () => {
    const { level, modifiers } = challenge("level_main_05-10");
    const params = modifiers.flatMap((m) => modifierText(m, level.enemies).params);
    expect(params).toContainEqual({ label: "指定敵人", value: "梅菲斯特" });
  });

  it("names a key it does not know 未知修正", () => {
    const unknown = { key: "made_up_modifier", difficulties: [], blackboard: [] };
    expect(modifierText(unknown, {}).name).toBe("未知修正");
  });
});

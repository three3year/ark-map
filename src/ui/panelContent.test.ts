import { describe, expect, it } from "vitest";
import { loadFixtureLevel } from "../../test-fixtures/load.ts";
import { spawnPlan } from "../timeline/index.ts";
import { variantModifiers } from "../level/index.ts";
import {
  branchLabel,
  candidateLabel,
  conditionalText,
  hiddenGroupText,
  levelNumbers,
  modifierLines,
  enemyAttributes,
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

describe("隱藏組", () => {
  it("17-04's raid: on by default in 六星 only", () => {
    const level = loadFixtureLevel("level_main_17-04");
    const variants = [
      { id: "normal", difficulty: "NORMAL" },
      { id: "sixStar", difficulty: "SIX_STAR" },
    ] as const;
    const text = hiddenGroupText(level, "raid", variants);
    expect(text.note).toBe("六星時開");
    expect(text.badge).toBe("隱藏組・六星時開");
  });

  it("is named by what all its actions put on the field; its tag is the hint", () => {
    const level = loadFixtureLevel("level_main_17-04");
    const text = hiddenGroupText(level, "raid", []);
    expect(text.name).toBe("實驗樣本A-000 × 1、破石草 × 1");
    expect(text.hint).toBe("raid");
  });

  it("公害's calamity is named by the device it activates", () => {
    const level = loadFixtureLevel("level_rogue4_1-2");
    expect(hiddenGroupText(level, "calamity", []).name).toBe("裝置 年代之刺");
  });

  it("on in every variant that shows the file: 各變體都開", () => {
    const level = loadFixtureLevel("level_main_17-04");
    const text = hiddenGroupText(level, "raid", [{ id: "sixStar", difficulty: "SIX_STAR" }]);
    expect(text.note).toBe("各變體都開");
  });

  it("公害's calamity: no variant switches it on, so no 說明 and a bare badge", () => {
    const level = loadFixtureLevel("level_rogue4_1-2");
    const text = hiddenGroupText(level, "calamity", [
      { id: "normal", difficulty: "NORMAL" },
      { id: "emergency", difficulty: "FOUR_STAR" },
    ]);
    expect(text.note).toBeNull();
    expect(text.badge).toBe("隱藏組");
  });

  it("公害's cargo: opened by the 收藏品 牧馱人的搖鈴, which also names its badge", () => {
    const level = loadFixtureLevel("level_rogue4_1-2");
    const text = hiddenGroupText(level, "cargo", []);
    expect(text.note).toBe("由收藏品「牧馱人的搖鈴」開啟");
    expect(text.badge).toBe("隱藏組・牧馱人的搖鈴");
  });

  it("level_rogue2_1-1's allydonq: one 收藏品 opens it and another closes it", () => {
    const level = loadFixtureLevel("level_rogue2_1-1");
    const text = hiddenGroupText(level, "allydonq", []);
    expect(text.note).toBe("由收藏品「海潮的氣息」開啟、收藏品「退行的羅辛南特」關閉");
    expect(text.badge).toBe("隱藏組・海潮的氣息");
  });

  it("level_rogue2_1-1's allydonq activates an alias-less device, named by its kind", () => {
    const level = loadFixtureLevel("level_rogue2_1-1");
    expect(hiddenGroupText(level, "allydonq", []).name).toBe("裝置 獵潮的騎士");
  });
});

describe("條件出兵", () => {
  const branch = (name: string, key: string) => {
    const level = loadFixtureLevel(name);
    return conditionalText(
      level,
      level.branches.find((b) => b.key === key)!,
    );
  };

  it("level_rogue2_1-1's trap_068_badbox#1, a device's alias, reads as that device", () => {
    expect(branch("level_rogue2_1-1", "trap_068_badbox#1")).toEqual({
      device: "裝置 箱形恐魚",
      hint: "trap_068_badbox#1",
      source: "條件出兵 裝置 箱形恐魚",
    });
  });

  it("公害's mbx1, not a device's alias, shows no key, only the hint has it", () => {
    expect(branch("level_rogue4_1-2", "mbx1")).toEqual({
      device: null,
      hint: "mbx1",
      source: "條件出兵",
    });
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

describe("難度修正 lines", () => {
  const challenge = (name: string) => {
    const level = loadFixtureLevel(name);
    return modifierLines(level, variantModifiers(level.modifiers, "FOUR_STAR"));
  };

  it("4-4 突襲: a lone value reads after the name; ×1 is dropped; move speed has its hint", () => {
    expect(challenge("level_main_04-04")).toEqual([
      {
        key: "gbuff_lifepoint",
        name: "關卡生命值",
        hint: "gbuff_lifepoint",
        value: "1",
        params: [],
      },
      {
        key: "ebuff_attribute",
        name: "敵人屬性倍率",
        hint: "ebuff_attribute",
        value: null,
        params: [{ label: "移速", value: "×2", hint: "已套用到地圖上的移動" }],
      },
    ]);
  });

  it("5-7 突襲: a modifier whose every parameter is ×1 has no line, nor one without parameters", () => {
    expect(challenge("level_main_05-07").map((line) => line.key)).not.toContain("ebuff_attribute");
    expect(challenge("level_main_05-07").map((line) => line.key)).not.toContain("cbuff_excluded");
  });

  it("act15side_ex04 突襲: a modifier left with only 指定敵人 has no line", () => {
    expect(challenge("level_act15side_ex04").map((line) => line.name)).toEqual([
      "關卡生命值",
      "干員屬性倍率",
    ]);
  });

  it("drops an addition of 0", () => {
    const add = {
      key: "enemy_attribute_add",
      difficulties: [],
      blackboard: [
        { key: "atk", value: 0, valueStr: null },
        { key: "def", value: 50, valueStr: null },
      ],
    };
    expect(modifierLines(loadFixtureLevel("level_main_04-04"), [add])[0]?.params).toEqual([
      { label: "防禦", value: "50", hint: null },
    ]);
  });

  it("5-10 突襲: 指定敵人 reads as the enemy's name", () => {
    const params = challenge("level_main_05-10").flatMap((line) => line.params);
    expect(params).toContainEqual({ label: "指定敵人", value: "梅菲斯特", hint: null });
  });

  it("names a key it does not know 未知修正", () => {
    const unknown = {
      key: "made_up_modifier",
      difficulties: [],
      blackboard: [{ key: "value", value: 2, valueStr: null }],
    };
    expect(modifierLines(loadFixtureLevel("level_main_04-04"), [unknown])[0]?.name).toBe(
      "未知修正",
    );
  });
});

describe("關卡資訊's numbers", () => {
  it("4-4: the four numbers on one line", () => {
    expect(levelNumbers(loadFixtureLevel("level_main_04-04").options)).toBe(
      "可部署人數 9 · 生命值 3 · 初始費用 10 · 費用上限 99",
    );
  });
});

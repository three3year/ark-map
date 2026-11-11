import { describe, expect, it } from "vitest";
import { loadFixtureLevel } from "../../test-fixtures/load.ts";
import { spawnPlan } from "../timeline/index.ts";
import { variantModifiers } from "../level/index.ts";
import { branchLabel, candidateLabel, levelNumbers, modifierLines } from "./panelContent.ts";

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

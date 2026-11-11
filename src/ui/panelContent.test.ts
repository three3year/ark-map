import { describe, expect, it } from "vitest";
import { loadFixtureLevel } from "../../test-fixtures/load.ts";
import { spawnPlan } from "../timeline/index.ts";
import { variantModifiers } from "../level/index.ts";
import { branchLabel, candidateLabel, hiddenGroupText, modifierText } from "./panelContent.ts";

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
});

describe("純機關: 5-10", () => {
  const level = loadFixtureLevel("level_main_05-10");

  it("names ten ballistae once", () => {
    const branch = level.branches.find((b) => b.key === "faust_ballis")!;
    expect(branchLabel(level, branch)).toBe("裝置 弩炮");
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

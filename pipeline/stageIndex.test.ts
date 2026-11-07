// Seam 2: raw game data -> level model (the stage index).
import { describe, expect, it } from "vitest";
import type { StageEntry, StageIndex } from "../src/level/index.ts";
import { rawFixture, rawTables } from "../test-fixtures/load.ts";
import { buildStageIndex, indexedLevelPaths, levelFacts, type LevelFacts } from "./stageIndex.ts";

const tables = rawTables();

/** Every level file the index asks for exists and has no difficulty modifiers. */
function allFilesPresent(): Map<string, LevelFacts> {
  return new Map(indexedLevelPaths(tables).map((p) => [p, { difficulties: [] }]));
}

function build(facts = allFilesPresent()): StageIndex {
  return buildStageIndex(tables, facts).index;
}

function stageByCode(index: StageIndex, areaId: string, code: string): StageEntry {
  const area = index.areas.find((a) => a.id === areaId);
  const stage = area?.sections.flatMap((s) => s.stages).find((s) => s.code === code);
  if (!stage) throw new Error(`no ${code} in ${areaId}`);
  return stage;
}

describe("stage index", () => {
  it("6-16 points at level_main_06-14 (stage ids drift from codes from chapter 6 on)", () => {
    const stage = stageByCode(build(), "main_6", "6-16");
    expect(stage.id).toBe("main_06-14");
    expect(stage.variants[0]).toMatchObject({
      id: "normal",
      difficulty: "NORMAL",
      levelFile: "data/levels/obt/main/level_main_06-14.json",
    });
  });

  it("the challenge variant shares the normal variant's level JSON at FOUR_STAR", () => {
    const [normal, challenge, ...rest] = stageByCode(build(), "main_6", "6-16").variants;
    expect(rest).toEqual([]);
    expect(challenge).toMatchObject({
      id: "challenge",
      sourceStageId: "main_06-14#f#",
      difficulty: "FOUR_STAR",
    });
    expect(challenge!.levelFile).toBe(normal!.levelFile);
  });

  it("lists each stage once: no story stages, no easy_ entries, no #f# entries", () => {
    const ids = build().areas.flatMap((a) => a.sections.flatMap((s) => s.stages.map((x) => x.id)));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain("st_06-03"); // 6-18, story only
    expect(ids.filter((id) => /^(st|easy|tough)_|#/.test(id))).toEqual([]);
    expect(ids).toContain("main_10-01");
  });

  describe("10-2: easy and tough", () => {
    it("lists easy on the normal file at EASY when that file has EASY modifiers; tough has its own file", () => {
      const facts = allFilesPresent();
      facts.set("obt/main/level_main_10-01", { difficulties: ["EASY"] });
      const variants = stageByCode(build(facts), "main_10", "10-2").variants;
      expect(variants.map((v) => [v.id, v.difficulty, v.levelFile])).toEqual([
        ["normal", "NORMAL", "data/levels/obt/main/level_main_10-01.json"],
        ["easy", "EASY", "data/levels/obt/main/level_main_10-01.json"],
        ["tough", "NORMAL", "data/levels/obt/main/level_tough_10-01.json"],
      ]);
    });

    it("reads which difficulties a level file has modifiers for", () => {
      expect(levelFacts(rawFixture("level_main_10-01")).difficulties).toEqual(["EASY"]);
      expect(levelFacts(rawFixture("level_main_04-04")).difficulties).toEqual(["FOUR_STAR"]);
    });

    it("reads the numeric masks of older activity files (1 NORMAL, 2 FOUR_STAR, 3 both)", () => {
      const raw = rawFixture("level_main_04-04");
      raw.runes = [
        { difficultyMask: 2, key: "ebuff_attribute" },
        { difficultyMask: 3, key: "gbuff_lifepoint" },
      ];
      expect(levelFacts(raw).difficulties.sort()).toEqual(["FOUR_STAR", "NORMAL"]);
    });

    it("omits easy when the normal file has no EASY modifiers", () => {
      const ids = stageByCode(build(), "main_10", "10-2").variants.map((v) => v.id);
      expect(ids).toEqual(["normal", "tough"]);
    });

    it("never asks for the easy_ level files, which do not exist upstream", () => {
      const paths = indexedLevelPaths(tables);
      expect(paths).toContain("obt/main/level_tough_10-01");
      expect(paths.filter((p) => p.includes("easy"))).toEqual([]);
    });
  });

  it("lists mainline chapters in order, then activities newest first, then campaign regions", () => {
    expect(build().areas.map((a) => [a.kind, a.id, a.code, a.name])).toEqual([
      ["MAINLINE", "main_1", "第一章", "黑暗時代·下"],
      ["MAINLINE", "main_2", "第二章", "異卵同生"],
      ["MAINLINE", "main_6", "第六章", "局部壞死"],
      ["MAINLINE", "main_10", "第十章", "破碎日冕"],
      ["MAINLINE", "act4mainss_zone1", "第十七章", "相變臨界"],
      // An activity's code is the letters its stage codes start with (YW-1 -> YW).
      // Neither of these two is in the TW tables yet: CN names.
      ["ACTIVITY", "act52side", "YW", "昨日海"],
      ["ACTIVITY", "act24sre", "CF", "落叶逐火·复刻"],
      // Stage codes start TB-, LK- and FIN-: no single code.
      ["ACTIVITY", "act1lock", null, "荷謨伊智境"],
      ["CAMPAIGN", "camp_zone_1", null, "炎國龍門"],
      ["CAMPAIGN", "camp_zone_3", null, "烏薩斯"],
      ["ROGUELIKE", "rogue_1", null, "傀影與猩紅孤鑽"],
      ["ROGUELIKE", "rogue_2", null, "水月與深藍之樹"],
      ["ROGUELIKE", "rogue_3", null, "探索者的銀淞止境"],
      ["ROGUELIKE", "rogue_4", null, "薩卡茲的無終奇語"],
      ["ROGUELIKE", "rogue_5", null, "歲的界園志異"],
      // The TW tables have no sixth theme yet: CN name.
      ["ROGUELIKE", "rogue_6", null, "沉沦者的黑流树海"],
    ]);
  });

  it("names stages in TW, falling back to CN where TW lacks the stage", () => {
    const index = build();
    expect(stageByCode(index, "main_2", "SA-1").name).toBe("捷徑");
    expect(stageByCode(index, "main_6", "6-16").name).toBe("黑兔子,白兔子");
    expect(stageByCode(index, "act52side", "YW-1").name).toBe("互助会");
    expect(stageByCode(index, "camp_zone_3", "烏薩斯").name).toBe("切爾諾伯格");
  });

  it("splits an activity with several zones into named sections", () => {
    const area = build().areas.find((a) => a.id === "act24sre")!;
    expect(area.sections.map((s) => s.name)).toEqual(["苍暮山地", "艾露猫的委托柜台"]);
  });

  it("keeps early activity stages filed under a mainline chapter (SA-1 in chapter 2)", () => {
    const stage = stageByCode(build(), "main_2", "SA-1");
    expect(stage.variants.map((v) => v.id)).toEqual(["normal", "challenge"]);
  });

  it("skips stages whose level file is missing and reports them", () => {
    const facts = allFilesPresent();
    facts.delete("activities/act4d0/level_act4d0_02");
    const { index, skipped } = buildStageIndex(tables, facts);
    const ids = index.areas.flatMap((a) => a.sections.flatMap((s) => s.stages.map((x) => x.id)));
    expect(ids).not.toContain("act4d0_02");
    expect(skipped).toContainEqual({
      stageId: "act4d0_02",
      levelPath: "activities/act4d0/level_act4d0_02",
    });
  });

  it("leaves out multiplayer and Garrison Protocol activities", () => {
    const ids = build().areas.map((a) => a.id);
    expect(ids).not.toContain("act1multi");
    expect(ids).not.toContain("act1vautochess");
    expect(indexedLevelPaths(tables).filter((p) => /multi|autochess/.test(p))).toEqual([]);
  });

  it("17-2 has a six-star variant on the same file", () => {
    const variants = stageByCode(build(), "act4mainss_zone1", "17-2").variants;
    expect(variants.map((v) => [v.id, v.difficulty, v.levelFile])).toEqual([
      ["normal", "NORMAL", "data/levels/obt/main/level_main_17-01.json"],
      ["sixStar", "SIX_STAR", "data/levels/obt/main/level_main_17-01.json"],
    ]);
  });
});

describe("stage index: 集成戰略", () => {
  function stageById(index: StageIndex, id: string): StageEntry {
    const stage = index.areas
      .flatMap((a) => a.sections.flatMap((s) => s.stages))
      .find((s) => s.id === id);
    if (!stage) throw new Error(`no ${id}`);
    return stage;
  }

  it("ro1_n_1_1 points at level_rogue1_1-1", () => {
    const stage = stageById(build(), "ro1_n_1_1");
    expect([stage.code, stage.name]).toEqual(["ISW-NO", "與蟲為伴"]);
    expect(stage.variants).toEqual([
      {
        id: "normal",
        sourceStageId: "ro1_n_1_1",
        levelFile: "data/levels/obt/roguelike/ro1/level_rogue1_1-1.json",
        difficulty: "NORMAL",
      },
    ]);
  });

  it("ro1_e_1_1 is listed apart from ro1_n_1_1 but shares its level JSON, at FOUR_STAR", () => {
    const index = build();
    const normal = stageById(index, "ro1_n_1_1");
    const emergency = stageById(index, "ro1_e_1_1");
    expect(emergency.variants).toEqual([
      {
        id: "emergency",
        sourceStageId: "ro1_e_1_1",
        levelFile: normal.variants[0]!.levelFile,
        difficulty: "FOUR_STAR",
      },
    ]);
    expect(emergency.emergencyCondition).toBe("附加條件：敵人的攻擊力、防禦力和生命值大幅度提升");
    expect(normal.emergencyCondition).toBeUndefined();
  });

  it("lists each zone's normal nodes, then its emergency operations; zoneless stages last", () => {
    const area = build().areas.find((a) => a.id === "rogue_1")!;
    expect(
      area.sections.map((s) => [s.name, s.emergency ?? false, s.stages.map((x) => x.id)]),
    ).toEqual([
      ["迷霧歧途", false, ["ro1_n_1_1"]],
      ["迷霧歧途", true, ["ro1_e_1_1"]],
      ["落陽庭院", false, ["ro1_n_2_1"]],
      [null, false, ["ro1_b_1"]],
    ]);
  });

  it("files an emergency operation under its linked stage's zone (none for ro4_t_2)", () => {
    const area = build().areas.find((a) => a.id === "rogue_4")!;
    expect(
      area.sections.map((s) => [s.name, s.emergency ?? false, s.stages.map((x) => x.id)]),
    ).toEqual([
      ["熔魂之始", false, ["ro4_n_1_1"]],
      ["熔魂之始", true, ["ro4_e_1_1"]],
      [null, false, ["ro4_t_2"]],
      [null, true, ["ro4_e_t_2"]],
    ]);
  });

  it("lists each 替換地圖 of a theme-4 node as a variant on its own file", () => {
    const index = build();
    const rows = (id: string) =>
      stageById(index, id).variants.map((v) => [v.id, v.difficulty, v.levelFile]);
    expect(rows("ro4_n_1_1")).toEqual([
      ["normal", "NORMAL", "data/levels/obt/roguelike/ro4/level_rogue4_1-1.json"],
      [
        "replace1",
        "NORMAL",
        "data/levels/obt/roguelike/ro4/levelreplacers/level_rogue4_1-1_r1.json",
      ],
      [
        "replace2",
        "NORMAL",
        "data/levels/obt/roguelike/ro4/levelreplacers/level_rogue4_1-1_r2.json",
      ],
    ]);
    expect(rows("ro4_e_1_1")).toEqual([
      ["emergency", "FOUR_STAR", "data/levels/obt/roguelike/ro4/level_rogue4_1-1.json"],
      [
        "replace1",
        "FOUR_STAR",
        "data/levels/obt/roguelike/ro4/levelreplacers/level_rogue4_1-1_r1.json",
      ],
      [
        "replace2",
        "FOUR_STAR",
        "data/levels/obt/roguelike/ro4/levelreplacers/level_rogue4_1-1_r2.json",
      ],
    ]);
  });

  it("fetches every theme's files: DLC stages and 替換地圖 included", () => {
    const paths = indexedLevelPaths(tables);
    expect(paths).toEqual(
      expect.arrayContaining([
        "obt/roguelike/ro1/level_rogue1_1-1",
        "obt/roguelike/ro4/levelreplacers/level_rogue4_1-1_r2",
        "obt/roguelike/ro5/dlc1/level_rogue5_1-1_dlc1",
        "obt/roguelike/ro6/dlc1/level_rogue6_3-1_dlc1",
      ]),
    );
  });

  it("drops a 替換地圖 whose file is missing and reports it", () => {
    const facts = allFilesPresent();
    facts.delete("obt/roguelike/ro4/levelreplacers/level_rogue4_1-1_r1");
    const { index, skipped } = buildStageIndex(tables, facts);
    expect(stageById(index, "ro4_n_1_1").variants.map((v) => v.id)).toEqual(["normal", "replace2"]);
    expect(skipped).toContainEqual({
      stageId: "ro4_n_1_1",
      levelPath: "obt/roguelike/ro4/levelreplacers/level_rogue4_1-1_r1",
    });
  });

  it("names theme 6, which TW lacks, in CN; its DLC nodes join the numbered zone", () => {
    const area = build().areas.find((a) => a.id === "rogue_6")!;
    expect(
      area.sections.map((s) => [s.name, s.emergency ?? false, s.stages.map((x) => x.id)]),
    ).toEqual([
      ["玻利瓦尔肤层", false, ["ro6_n_1_1"]],
      ["血色空脉", false, ["ro6_n_3_1_dlc1"]],
      ["血色空脉", true, ["ro6_e_3_1_dlc1"]],
    ]);
    expect(stageById(build(), "ro6_e_3_1_dlc1").emergencyCondition).toBe(
      "敌人的攻击力、防御力和生命值提升，部分敌人有所不同",
    );
  });
});

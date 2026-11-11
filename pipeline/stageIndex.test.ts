// Seam 2: raw game data -> level model (the stage index).
import { describe, expect, it } from "vitest";
import type { StageEntry, StageIndex } from "../src/level/index.ts";
import { rawFixture, rawTables } from "../test-fixtures/load.ts";
import { buildStageIndex, indexedLevelPaths, levelFacts, type LevelFacts } from "./stageIndex.ts";

const tables = rawTables();

type Index = Omit<StageIndex, "versions">;

/** Every level file the index asks for exists and has no difficulty modifiers. */
function allFilesPresent(): Map<string, LevelFacts> {
  return new Map(indexedLevelPaths(tables).map((p) => [p, { difficulties: [] }]));
}

function build(facts = allFilesPresent()): Index {
  return buildStageIndex(tables, facts).index;
}

function allStages(index: Index): StageEntry[] {
  return index.areas.flatMap((a) => a.sections.flatMap((s) => s.stages));
}

const stageIds = (index: Index) => allStages(index).map((s) => s.id);

function stageByCode(index: Index, areaId: string, code: string): StageEntry {
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
    const ids = stageIds(build());
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
      // An activity's 區域代號 is the letters its stage codes start with (YW-1 -> YW).
      // Not in the TW tables yet: CN name.
      ["ACTIVITY", "act52side", "YW", "昨日海"],
      // Not a 復刻, though its stages are act17d7_*: its own name and date.
      ["ACTIVITY", "act7fun", "LTTB", "Rhodes Island Epic 黑色博士坠落"],
      // A 復刻 is listed as its original act24side (TW name), at the original's date.
      ["ACTIVITY", "act24sre", "CF", "落葉逐火"],
      ["ACTIVITY", "act10mini", "TB", "陰雲火花"],
      // A 復刻 whose name lacks 復刻: still at its original act12side's date.
      ["ACTIVITY", "act12sre", "DH", "多索雷斯假日"],
      // Stage codes start TB-, LK- and FIN-: no single code.
      ["ACTIVITY", "act1lock", null, "荷謨伊智境"],
      // A 復刻 of a001, which the activity table lacks: its own name and date.
      ["ACTIVITY", "act13d2", "GT", "騎兵與獵人·復刻"],
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

  it("treats a blank TW name as missing and falls back to CN", () => {
    const blank = rawTables();
    blank.tw.stage.stages["act7d5_01"]!.name = " ";
    const index = buildStageIndex(blank, allFilesPresent()).index;
    expect(stageByCode(index, "main_2", "SA-1").name).toBe("捷径");
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
    const ids = stageIds(index);
    expect(ids).not.toContain("act4d0_02");
    expect(skipped).toContainEqual({
      stageId: "act4d0_02",
      levelPath: "activities/act4d0/level_act4d0_02",
      reason: "missingFile",
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
  function stageById(index: Index, id: string): StageEntry {
    const stage = allStages(index).find((s) => s.id === id);
    if (!stage) throw new Error(`no ${id}`);
    return stage;
  }

  it("ro1_e_1_1 is ro1_n_1_1's emergency variant: the node's file at FOUR_STAR", () => {
    const node = stageById(build(), "ro1_n_1_1");
    expect([node.code, node.name]).toEqual(["ISW-NO", "與蟲為伴"]);
    expect(node.variants).toEqual([
      {
        id: "normal",
        sourceStageId: "ro1_n_1_1",
        levelFile: "data/levels/obt/roguelike/ro1/level_rogue1_1-1.json",
        difficulty: "NORMAL",
      },
      {
        id: "emergency",
        sourceStageId: "ro1_e_1_1",
        levelFile: "data/levels/obt/roguelike/ro1/level_rogue1_1-1.json",
        difficulty: "FOUR_STAR",
      },
    ]);
  });

  it("ro4_e_t_2 is ro4_t_2's emergency variant", () => {
    const node = stageById(build(), "ro4_t_2");
    expect([node.code, node.name]).toEqual(["ISW-SP", "訊號燈"]);
    expect(node.variants.slice(0, 2)).toEqual([
      {
        id: "normal",
        sourceStageId: "ro4_t_2",
        levelFile: "data/levels/obt/roguelike/ro4/level_rogue4_t-2.json",
        difficulty: "NORMAL",
      },
      {
        id: "emergency",
        sourceStageId: "ro4_e_t_2",
        levelFile: "data/levels/obt/roguelike/ro4/level_rogue4_t-2.json",
        difficulty: "FOUR_STAR",
      },
    ]);
  });

  it("ro6_e_3_1_dlc1 is theme 6's _dlc1 node ro6_n_3_1_dlc1's emergency variant", () => {
    const node = stageById(build(), "ro6_n_3_1_dlc1");
    expect(node.variants).toEqual([
      {
        id: "normal",
        sourceStageId: "ro6_n_3_1_dlc1",
        levelFile: "data/levels/obt/roguelike/ro6/dlc1/level_rogue6_3-1_dlc1.json",
        difficulty: "NORMAL",
      },
      {
        id: "emergency",
        sourceStageId: "ro6_e_3_1_dlc1",
        levelFile: "data/levels/obt/roguelike/ro6/dlc1/level_rogue6_3-1_dlc1.json",
        difficulty: "FOUR_STAR",
      },
    ]);
  });

  it("merges an emergency operation listed before its node in the table", () => {
    const reordered = rawTables();
    const detail = reordered.cn.roguelike.details["rogue_1"]!;
    const { ro1_e_1_1, ...rest } = detail.stages;
    detail.stages = { ro1_e_1_1: ro1_e_1_1!, ...rest };
    const index = buildStageIndex(reordered, allFilesPresent()).index;
    expect(stageById(index, "ro1_n_1_1").variants.map((v) => [v.id, v.sourceStageId])).toEqual([
      ["normal", "ro1_n_1_1"],
      ["emergency", "ro1_e_1_1"],
    ]);
  });

  it("skips and reports an emergency operation that links to no node", () => {
    const unlinked = rawTables();
    unlinked.cn.roguelike.details["rogue_1"]!.stages["ro1_e_1_1"]!.linkedStageId = "ro1_n_9_9";
    const { index, skipped } = buildStageIndex(unlinked, allFilesPresent());
    const ids = stageIds(index);
    expect(ids).not.toContain("ro1_e_1_1");
    expect(stageById(index, "ro1_n_1_1").variants.map((v) => v.id)).toEqual(["normal"]);
    expect(skipped).toContainEqual({
      stageId: "ro1_e_1_1",
      levelPath: "obt/roguelike/ro1/level_rogue1_1-1",
      reason: "unlinkedEmergency",
    });
  });

  it('shows a node blank in both servers (ro4_b_9\'s " ") by its id, with no code', () => {
    const blank = rawTables();
    for (const t of [blank.cn, blank.tw]) {
      const s = t.roguelike.details["rogue_1"]!.stages["ro1_n_1_1"]!;
      s.code = " ";
      s.name = " ";
    }
    const stage = stageById(buildStageIndex(blank, allFilesPresent()).index, "ro1_n_1_1");
    expect([stage.code, stage.name]).toEqual(["", "ro1_n_1_1"]);
  });

  it("lists each zone's nodes, zoneless stages last; no emergency sections", () => {
    const sections = (areaId: string) =>
      build()
        .areas.find((a) => a.id === areaId)!
        .sections.map((s) => [s.name, "emergency" in s, s.stages.map((x) => x.id)]);
    expect(sections("rogue_1")).toEqual([
      ["迷霧歧途", false, ["ro1_n_1_1"]],
      ["落陽庭院", false, ["ro1_n_2_1"]],
      [null, false, ["ro1_b_1"]],
    ]);
    expect(sections("rogue_4")).toEqual([
      ["熔魂之始", false, ["ro4_n_1_1", "ro4_n_1_2"]],
      [null, false, ["ro4_t_2"]],
    ]);
  });

  it("orders zones by number: zone 10 after zone 2, zoneless stages still last", () => {
    const tenZones = rawTables();
    const detail = tenZones.cn.roguelike.details["rogue_1"]!;
    detail.stages["ro1_n_10_1"] = { ...detail.stages["ro1_n_2_1"]!, id: "ro1_n_10_1" };
    detail.zones["zone_10"] = { id: "zone_10", name: "第十層" };
    const area = buildStageIndex(tenZones, allFilesPresent()).index.areas.find(
      (a) => a.id === "rogue_1",
    )!;
    expect(area.sections.map((s) => [s.name, s.stages.map((x) => x.id)])).toEqual([
      ["迷霧歧途", ["ro1_n_1_1"]],
      ["落陽庭院", ["ro1_n_2_1"]],
      ["第十層", ["ro1_n_10_1"]],
      [null, ["ro1_b_1"]],
    ]);
  });

  it("numbers a theme-4 node's 內容拓展 by their _rN files; its 緊急作戰 is no 內容拓展", () => {
    const index = build();
    const node = stageById(index, "ro4_n_1_1");
    expect(node.variants.map((v) => [v.id, v.difficulty, v.levelFile])).toEqual([
      ["normal", "NORMAL", "data/levels/obt/roguelike/ro4/level_rogue4_1-1.json"],
      ["emergency", "FOUR_STAR", "data/levels/obt/roguelike/ro4/level_rogue4_1-1.json"],
    ]);
    expect(node.expansions).toEqual([
      {
        number: 1,
        levelFile: "data/levels/obt/roguelike/ro4/levelreplacers/level_rogue4_1-1_r1.json",
      },
      {
        number: 2,
        levelFile: "data/levels/obt/roguelike/ro4/levelreplacers/level_rogue4_1-1_r2.json",
      },
    ]);
    const ids = stageIds(index);
    expect(ids.filter((id) => /^ro\d+_e_/.test(id))).toEqual([]);
  });

  it("fetches every theme's files: theme 6's _dlc1 nodes and 內容拓展 included", () => {
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

  it("numbers a theme-5 node's 內容拓展 by their _dlcN files", () => {
    expect(stageById(build(), "ro5_n_1_1").expansions).toEqual([
      { number: 1, levelFile: "data/levels/obt/roguelike/ro5/dlc1/level_rogue5_1-1_dlc1.json" },
    ]);
  });

  it("numbers 7-1's only 內容拓展, its _dlc2 file, 2", () => {
    const node = stageById(build(), "ro5_n_7_1");
    expect(node.code).toBe("ISW-NO");
    expect(node.expansions).toEqual([
      { number: 2, levelFile: "data/levels/obt/roguelike/ro5/dlc2/level_rogue5_7-1_dlc2.json" },
    ]);
  });

  it("a node without 內容拓展 has no list of them, whatever its own id ends in", () => {
    const index = build();
    expect(stageById(index, "ro1_n_1_1").expansions).toBeUndefined();
    expect(stageById(index, "ro6_n_3_1_dlc1").expansions).toBeUndefined();
  });

  it("drops a 內容拓展 whose file is missing and reports it", () => {
    const facts = allFilesPresent();
    facts.delete("obt/roguelike/ro4/levelreplacers/level_rogue4_1-1_r1");
    const { index, skipped } = buildStageIndex(tables, facts);
    expect(stageById(index, "ro4_n_1_1").expansions?.map((x) => x.number)).toEqual([2]);
    expect(skipped).toContainEqual({
      stageId: "ro4_n_1_1",
      levelPath: "obt/roguelike/ro4/levelreplacers/level_rogue4_1-1_r1",
      reason: "missingFile",
    });
  });

  it("drops a 內容拓展 file named without a 拓展編號 and reports it", () => {
    const renamed = rawTables();
    const node = renamed.cn.roguelike.details["rogue_4"]!.stages["ro4_n_1_1"]!;
    node.levelReplaceIds[0] = "Obt/Roguelike/RO4/LevelReplacers/level_rogue4_1-1_new";
    const facts = allFilesPresent();
    facts.set("obt/roguelike/ro4/levelreplacers/level_rogue4_1-1_new", { difficulties: [] });
    const { index, skipped } = buildStageIndex(renamed, facts);
    expect(stageById(index, "ro4_n_1_1").expansions?.map((x) => x.number)).toEqual([2]);
    expect(skipped).toContainEqual({
      stageId: "ro4_n_1_1",
      levelPath: "obt/roguelike/ro4/levelreplacers/level_rogue4_1-1_new",
      reason: "unnumberedExpansion",
    });
  });

  it("names theme 6, which TW lacks, in CN; its _dlc1 nodes join the numbered zone", () => {
    const area = build().areas.find((a) => a.id === "rogue_6")!;
    expect(area.sections.map((s) => [s.name, s.stages.map((x) => x.id)])).toEqual([
      ["玻利瓦尔肤层", ["ro6_n_1_1"]],
      ["血色空脉", ["ro6_n_3_1_dlc1"]],
    ]);
  });
});

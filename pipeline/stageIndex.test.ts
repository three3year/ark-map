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
      // Neither activity is in the TW tables yet: CN names.
      ["ACTIVITY", "act52side", null, "昨日海"],
      ["ACTIVITY", "act24sre", null, "落叶逐火·复刻"],
      ["CAMPAIGN", "camp_zone_1", null, "炎國龍門"],
      ["CAMPAIGN", "camp_zone_3", null, "烏薩斯"],
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

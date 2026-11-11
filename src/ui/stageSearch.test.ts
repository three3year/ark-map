import { describe, expect, it } from "vitest";
import type { Area, AreaKind, StageEntry, StageIndex } from "../level/index.ts";
import { searchStages } from "./stageSearch.ts";

const stage = (id: string, code: string, name: string): StageEntry => ({
  id,
  code,
  name,
  variants: [{ id: "normal", sourceStageId: id, levelFile: `${id}.json`, difficulty: "NORMAL" }],
});

const area = (id: string, kind: AreaKind, sections: StageEntry[][]): Area => ({
  id,
  kind,
  code: null,
  name: id,
  sections: sections.map((stages) => ({ name: null, stages })),
});

const index: StageIndex = {
  areas: [
    area("main_6", "MAINLINE", [
      [stage("main_06-16", "6-16", "決戰"), stage("main_06-17", "6-17", "撤離")],
    ]),
    area("act_is", "ACTIVITY", [[stage("act_is_1", "IS-3", "決鬥場")]]),
    area("camp_r", "CAMPAIGN", [[stage("camp_r_1", "炎國", "決戰外環")]]),
    area("main_1", "MAINLINE", [[stage("main_01-06", "1-6", "陷落")]]),
    area("rogue_2", "ROGUELIKE", [
      [stage("ro2_n_1_1", "ISW-NO", "去路")],
      [stage("ro2_n_2_1", "ISW-NO", "決鬥")],
    ]),
  ],
  versions: {
    cn: { version: "79.2.0", checkedAt: "2026-11-11T06:30:00.000Z" },
    tw: { version: "52.0.0", checkedAt: "2026-11-11T06:30:00.000Z" },
  },
};

const found = (query: string) =>
  searchStages(index, query)?.map(({ area, stage }) => `${area.id}/${stage.id}`);

describe("searching the stages", () => {
  it("finds a stage by its code", () => {
    expect(found("6-16")).toEqual(["main_6/main_06-16"]);
  });

  it("finds a stage by part of its name", () => {
    expect(found("陷")).toEqual(["main_1/main_01-06"]);
  });

  it("ignores case", () => {
    expect(found("is-3")).toEqual(["act_is/act_is_1"]);
  });

  it("ignores spaces around the keyword", () => {
    expect(found("  6-16 ")).toEqual(["main_6/main_06-16"]);
  });

  it("does not search when the keyword is empty or only spaces", () => {
    expect(searchStages(index, "")).toBeNull();
    expect(searchStages(index, "   ")).toBeNull();
  });

  it("finds nothing when no stage matches", () => {
    expect(found("9-99")).toEqual([]);
  });

  it("lists 集成戰略, 主線, 活動, 剿滅作戰 in turn, each in the index's order, sections in turn", () => {
    expect(found("決")).toEqual([
      "rogue_2/ro2_n_2_1",
      "main_6/main_06-16",
      "act_is/act_is_1",
      "camp_r/camp_r_1",
    ]);
    expect(found("-")).toEqual([
      "rogue_2/ro2_n_1_1",
      "rogue_2/ro2_n_2_1",
      "main_6/main_06-16",
      "main_6/main_06-17",
      "main_1/main_01-06",
      "act_is/act_is_1",
    ]);
  });
});

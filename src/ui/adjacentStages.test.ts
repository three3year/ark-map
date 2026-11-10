import { describe, expect, it } from "vitest";
import type { Area, StageEntry, StageIndex, VariantId } from "../level/index.ts";
import { adjacentStages } from "./adjacentStages.ts";

const stage = (id: string, ...variants: VariantId[]): StageEntry => ({
  id,
  code: id.toUpperCase(),
  name: `name ${id}`,
  variants: (variants.length > 0 ? variants : (["normal"] as VariantId[])).map((v) => ({
    id: v,
    sourceStageId: id,
    levelFile: `${id}.json`,
    difficulty: "NORMAL",
  })),
});

const area = (id: string, ...sections: StageEntry[][]): Area => ({
  id,
  kind: "ACTIVITY",
  code: null,
  name: id,
  sections: sections.map((stages, i) => ({ name: sections.length > 1 ? `s${i}` : null, stages })),
});

const index: StageIndex = {
  areas: [
    area("ch1", [
      stage("a1"),
      stage("a2", "normal", "challenge"),
      stage("a3", "normal", "challenge"),
    ]),
    area(
      "theme",
      [stage("t1", "normal", "emergency")],
      [stage("t2"), stage("t3", "normal", "emergency")],
    ),
    area("lonely", [stage("only")]),
  ],
};

const ids = (stageId: string, variant: VariantId) => {
  const { prev, next } = adjacentStages(index, stageId, variant);
  return {
    prev: prev && { id: prev.stage.id, variant: prev.variant },
    next: next && { id: next.stage.id, variant: next.variant },
  };
};

describe("上一關／下一關", () => {
  it("a stage mid-area has the stages before and after it in the area", () => {
    expect(ids("a2", "normal")).toEqual({
      prev: { id: "a1", variant: "normal" },
      next: { id: "a3", variant: "normal" },
    });
  });

  it("the area's first stage has no 上一關 and its last no 下一關: no wrapping round", () => {
    expect(ids("a1", "normal")).toEqual({ prev: null, next: { id: "a2", variant: "normal" } });
    expect(ids("a3", "normal")).toEqual({ prev: { id: "a2", variant: "normal" }, next: null });
  });

  it("the areas beside never count: the last stage of one area leads nowhere", () => {
    expect(ids("t3", "normal").next).toBeNull();
    expect(ids("t1", "normal").prev).toBeNull();
  });

  it("an area of one stage has neither", () => {
    expect(ids("only", "normal")).toEqual({ prev: null, next: null });
  });

  it("the sections run together, as the stage list shows them", () => {
    expect(ids("t1", "normal").next).toEqual({ id: "t2", variant: "normal" });
    expect(ids("t2", "normal").prev).toEqual({ id: "t1", variant: "normal" });
  });

  it("a neighbour with the variant on screen opens on it", () => {
    expect(ids("a2", "challenge").next).toEqual({ id: "a3", variant: "challenge" });
    expect(ids("t2", "normal").next).toEqual({ id: "t3", variant: "normal" });
  });

  it("a neighbour without the variant on screen opens on its base variant", () => {
    expect(ids("a2", "challenge").prev).toEqual({ id: "a1", variant: "normal" });
    expect(ids("t3", "emergency").prev).toEqual({ id: "t2", variant: "normal" });
  });

  it("a stage no area lists has neither", () => {
    expect(ids("nowhere", "normal")).toEqual({ prev: null, next: null });
  });
});

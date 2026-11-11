import { describe, expect, it } from "vitest";
import { shownExpansion, shownLevelFile, variantsShowing } from "./expansion.ts";
import type { StageEntry, Variant } from "./types.ts";

describe("which 內容拓展 shows", () => {
  it("原版 shows 原版", () => {
    expect(shownExpansion([1, 2], null)).toBeNull();
  });

  it("the largest 拓展編號 not above the choice, in whatever order the list comes", () => {
    expect(shownExpansion([1, 2], 2)).toBe(2);
    expect(shownExpansion([2, 1], 2)).toBe(2);
    expect(shownExpansion([1], 2)).toBe(1);
  });

  it("none at or below the choice is 原版", () => {
    expect(shownExpansion([2], 1)).toBeNull();
    expect(shownExpansion([], 1)).toBeNull();
  });

  it("the shown file is the shown 內容拓展's, else the variant's own", () => {
    const emergency: Variant = {
      id: "emergency",
      sourceStageId: "ro5_e_7_1",
      levelFile: "base.json",
      difficulty: "FOUR_STAR",
    };
    const stage: StageEntry = {
      id: "ro5_n_7_1",
      code: "ISW-NO",
      name: "",
      variants: [emergency],
      expansions: [{ number: 2, levelFile: "dlc2.json" }],
    };
    expect(shownLevelFile(stage, emergency, 1)).toBe("base.json");
    expect(shownLevelFile(stage, emergency, 3)).toBe("dlc2.json");
  });
});

describe("the variants that show a level file", () => {
  const variant = (id: Variant["id"], levelFile: string): Variant => ({
    id,
    sourceStageId: id,
    levelFile,
    difficulty: "NORMAL",
  });
  const normal = variant("normal", "base.json");
  const challenge = variant("challenge", "base.json");
  const tough = variant("tough", "tough.json");
  const stage: StageEntry = {
    id: "s",
    code: "",
    name: "",
    variants: [normal, challenge, tough],
    expansions: [{ number: 1, levelFile: "dlc1.json" }],
  };

  it("a variant's own file: the variants sharing it", () => {
    expect(variantsShowing(stage, "base.json")).toEqual([normal, challenge]);
    expect(variantsShowing(stage, "tough.json")).toEqual([tough]);
  });

  it("a 內容拓展's file: every variant shows it", () => {
    expect(variantsShowing(stage, "dlc1.json")).toEqual([normal, challenge, tough]);
  });
});

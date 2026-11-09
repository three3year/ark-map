import { describe, expect, it } from "vitest";
import { shownExpansion, shownLevelFile } from "./expansion.ts";
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

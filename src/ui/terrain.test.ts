// 地形 marks: which tiles get a hand-drawn icon or a first-letter glyph, and how the legend names them.
import { describe, expect, it } from "vitest";
import { terrainMark } from "./terrain.ts";

describe("地形 marks", () => {
  it("draws a hand-drawn tile's icon even when the 地形表 has neither it nor its row's first key", () => {
    expect(terrainMark("tile_fence", {})).toEqual({
      kind: "icon",
      icon: "fence",
      name: "圍欄",
      description: null,
    });
  });
});

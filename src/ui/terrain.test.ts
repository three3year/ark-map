// 地形 marks: which tiles get a hand-drawn icon or a first-letter glyph, and how the legend names them.
import { describe, expect, it } from "vitest";
import { keepsFloorStripes, terrainMark } from "./terrain.ts";

describe("地形 marks", () => {
  it("draws a hand-drawn tile's icon even when the 地形表 has neither it nor its row's first key", () => {
    expect(terrainMark("tile_fence", {})).toEqual({
      kind: "icon",
      icon: "fence",
      name: "圍欄",
      description: null,
    });
  });

  it("drops a 不可放置 cell's stripes only under a mark that is never deployable", () => {
    const mark = (tileKey: string) => terrainMark(tileKey, {});
    const undeployable = ["tile_start", "tile_flystart", "tile_end", "tile_telin", "tile_telout"];
    for (const key of [...undeployable, "tile_hole"]) {
      expect(keepsFloorStripes(mark(key)), key).toBe(false);
    }
    for (const key of ["tile_infection", "tile_deepsea", "tile_grass"]) {
      expect(keepsFloorStripes(mark(key)), key).toBe(true);
    }
    const glyph = terrainMark("tile_quicksand", {
      tile_quicksand: { name: "鹽漠", description: "", functional: true },
    });
    expect(keepsFloorStripes(glyph)).toBe(true);
    expect(keepsFloorStripes(null)).toBe(true);
  });
});

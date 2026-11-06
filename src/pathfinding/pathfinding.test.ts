// Seam 1 (尋路): map + target cell + motion mode -> nextNode table. Expected values come from
// the two articles in .scratch/snapshot-viewer/reference/ (全解析 and 寻路规则补充).
import { describe, expect, it } from "vitest";
import { loadFixtureLevel } from "../../test-fixtures/load.ts";
import type { Cell, LevelMap, Tile } from "../level/index.ts";
import { createNextNodeLookup, type PathfindingOptions } from "./index.ts";

const tiles: Record<string, Tile> = {
  ".": { tileKey: "tile_road", heightType: "LOWLAND", passableMask: "ALL", buildableType: "MELEE" },
  "#": {
    tileKey: "tile_forbidden",
    heightType: "LOWLAND",
    passableMask: "NONE",
    buildableType: "NONE",
  },
  O: { tileKey: "tile_hole", heightType: "LOWLAND", passableMask: "ALL", buildableType: "NONE" },
};

/** A map drawn top row first, as it looks on screen. */
function drawMap(rows: string[]): LevelMap {
  const bottomUp = [...rows].reverse();
  return {
    width: bottomUp[0]!.length,
    height: bottomUp.length,
    tiles: bottomUp.flatMap((row) => [...row].map((ch) => tiles[ch]!)),
  };
}

/** Every cell's nextNode, top row first, in the 1-based (x, y) notation of 寻路规则补充. */
function xyTable(map: LevelMap, next: (cell: Cell) => Cell): string[][] {
  const out: string[][] = [];
  for (let row = map.height - 1; row >= 0; row--) {
    const line: string[] = [];
    for (let col = 0; col < map.width; col++) {
      const n = next({ row, col });
      line.push(`${n.col + 1},${n.row + 1}`);
    }
    out.push(line);
  }
  return out;
}

const rectangleRule: [string, PathfindingOptions][] = [
  ["2×x rectangle rule on", { rectangleRule: true }],
  ["2×x rectangle rule off", { rectangleRule: false }],
];

describe.each(rectangleRule)("寻路规则补充's worked example (%s)", (_, options) => {
  // 7 x 7, way point (4,1); the rest of row 1 is impassable.
  const map = drawMap([
    ".......",
    ".......",
    ".......",
    ".......",
    ".......",
    ".......",
    "###.###",
  ]);
  const next = createNextNodeLookup(map, options)("WALK", { row: 0, col: 3 }, true);

  it("matches the article's final table on all 49 cells", () => {
    // supp_img/e468e1b2…png; the target and the impassable cells point at themselves.
    const r = (left: string, right: string) => [left, left, left, "4,1", right, right, right];
    expect(xyTable(map, next)).toEqual([
      r("4,6", "4,7"),
      r("4,5", "4,6"),
      r("4,4", "4,5"),
      r("4,3", "4,4"),
      r("4,2", "4,3"),
      r("4,2", "4,2"),
      ["1,1", "2,1", "3,1", "4,1", "5,1", "6,1", "7,1"],
    ]);
  });
});

describe("costs, motion modes and straight-only routes", () => {
  const start = { row: 0, col: 0 };
  const target = { row: 0, col: 2 };

  it("ground: a hole is passable but so costly that the route goes round it", () => {
    const next = createNextNodeLookup(drawMap(["...", ".O."]))("WALK", target, false);
    expect(next(start)).toEqual({ row: 1, col: 0 });
  });

  it("ground, no diagonal moves: nextNode is pulled along a row or column to the next turn", () => {
    const next = createNextNodeLookup(drawMap(["...", ".O."]))("WALK", target, false);
    expect(next({ row: 1, col: 0 })).toEqual({ row: 1, col: 2 });
  });

  it("ground still goes through a hole when there is no other way", () => {
    const next = createNextNodeLookup(drawMap(["###", ".O."]))("WALK", target, false);
    expect(next(start)).toEqual({ row: 0, col: 1 });
  });

  it("flying: holes cost 1 and fly-only tiles are passable", () => {
    const flyOnly: Tile = { ...tiles["#"]!, tileKey: "tile_wall", passableMask: "FLY_ONLY" };
    const map = drawMap(["...", ".O."]);
    map.tiles[1] = flyOnly;
    expect(createNextNodeLookup(map)("FLY", target, false)(start)).toEqual(target);
    map.tiles[1] = tiles["O"]!;
    expect(createNextNodeLookup(map)("FLY", target, false)(start)).toEqual(target);
  });

  it("a passable cell with no way to the target stays put", () => {
    const walled = createNextNodeLookup(drawMap(["#..", ".#."]))("WALK", target, true);
    expect(walled(start)).toEqual(start);
  });

  it("caches one table per motion mode and target cell", () => {
    const lookup = createNextNodeLookup(drawMap(["...", "..."]));
    expect(lookup("WALK", target, true)).toBe(lookup("WALK", { ...target }, true));
    expect(lookup("FLY", target, true)).not.toBe(lookup("WALK", target, true));
  });
});

describe.each(rectangleRule)("全解析's 田 example (%s)", (_, options) => {
  // Path bottom-right -> top-right -> top-left; the target is the top-left cell.
  const target = { row: 1, col: 0 };
  const bottomRight = { row: 0, col: 1 };

  it("links bottom-right straight to top-left when bottom-left is passable", () => {
    const next = createNextNodeLookup(drawMap(["..", ".."]), options)("WALK", target, true);
    expect(next(bottomRight)).toEqual(target);
  });

  it("keeps the right-angle path when bottom-left is impassable", () => {
    const next = createNextNodeLookup(drawMap(["..", "#."]), options)("WALK", target, true);
    expect(next(bottomRight)).toEqual({ row: 1, col: 1 });
  });

  it("keeps the right-angle path when bottom-left is an obstacle (a hole)", () => {
    const next = createNextNodeLookup(drawMap(["..", "O."]), options)("WALK", target, true);
    expect(next(bottomRight)).toEqual({ row: 1, col: 1 });
  });
});

describe.each(rectangleRule)("遗尘漫步 EX-4, as observed in 寻路规则补充 (%s)", (_, options) => {
  // Cell names as on PRTS.Map: letter = row from the bottom (A = 0), number = col + 1.
  const cell = (name: string): Cell => ({
    row: name.charCodeAt(0) - 65,
    col: Number(name.slice(1)) - 1,
  });
  const lookup = createNextNodeLookup(loadFixtureLevel("level_act18d0_ex04").map, options);

  it("heavy defender: towards C5, F8 heads for F5 (not D5, as PRTS.Map draws it)", () => {
    expect(lookup("WALK", cell("C5"), true)(cell("F8"))).toEqual(cell("F5"));
  });

  it("the mirrored ghost route, towards C7: row F heads for E7, row E for D7", () => {
    const next = lookup("WALK", cell("C7"), true);
    for (const name of ["F4", "F5", "F6"]) expect(next(cell(name)), name).toEqual(cell("E7"));
    for (const name of ["E3", "E4", "E5", "E6"]) expect(next(cell(name)), name).toEqual(cell("D7"));
  });
});

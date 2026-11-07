// Seam 2: raw game data -> the 名稱表's 地形表.
import { describe, expect, it } from "vitest";
import { rawTables } from "../test-fixtures/load.ts";
import { terrainTable } from "./terrainTable.ts";

const { cn, tw } = rawTables();
const table = (tileKeys: string[]) => terrainTable(tileKeys, cn.stage, tw.stage);

describe("地形表", () => {
  it("takes the TW name and description when TW has the tile", () => {
    expect(table(["tile_start", "tile_road"])).toEqual({
      tile_start: { name: "侵入點", description: "敵方會從此進入戰場", functional: true },
      tile_road: { name: "平地", description: "可以放置近戰單位，可以通行", functional: false },
    });
  });

  it("fills a tile TW lacks from CN", () => {
    expect(table(["tile_trench"])).toEqual({
      tile_trench: {
        name: "战壕",
        description: "可以部署远程干员，部署后不容易受到伤害",
        functional: true,
      },
    });
  });

  it("leaves out a tile neither server names", () => {
    expect(table(["tile_empty", "tile_start_dqq"])).toEqual({});
  });

  it("drops the game's rich-text tags from the description", () => {
    expect(table(["tile_magic_circle"]).tile_magic_circle?.description).toBe(
      "部署我方單位時，發出新的重整束流",
    );
  });
});

// Seam 2: raw game data -> level model.
import { describe, expect, it } from "vitest";
import { isWalkable, tileAt } from "../src/level/index.ts";
import {
  convertFixture,
  loadFixtureLevel,
  rawEnemyDatabase,
  rawEnemyHandbook,
  rawFixture,
} from "../test-fixtures/load.ts";
import { buildEnemyCatalog, convertLevel } from "./convertLevel.ts";
import type { RawEnemyDbRef } from "./raw.ts";

describe("map orientation", () => {
  it("1-7: route 1 starts at (5, 10) top-right (PRTS F11) and ends at (3, 0) left (PRTS D1)", () => {
    const level = loadFixtureLevel("level_main_01-07");
    const route = level.routes[1]!;
    expect(route.start).toEqual({ row: 5, col: 10 });
    expect(route.end).toEqual({ row: 3, col: 0 });
    expect(tileAt(level.map, route.start)?.tileKey).toBe("tile_start");
    expect(tileAt(level.map, route.end)?.tileKey).toBe("tile_end");
    // Top-right: one row below the top border row, in the rightmost column.
    expect(route.start.row).toBe(level.map.height - 2);
    expect(route.start.col).toBe(level.map.width - 1);
  });

  it("4-4 (vertically asymmetric): every ground route point is walkable", () => {
    const level = loadFixtureLevel("level_main_04-04");
    const points = level.routes
      .filter((r) => r.motionMode === "WALK")
      .flatMap((r) => [
        r.start,
        r.end,
        ...r.checkpoints.filter((c) => c.type === "MOVE").map((c) => c.position),
      ]);
    expect(points.length).toBeGreaterThan(10);
    const blocked = points.filter((p) => !isWalkable(tileAt(level.map, p)!));
    expect(blocked).toEqual([]);
  });
});

describe("waves", () => {
  it("13-11: the first wave moves on after 70 s, the second waits until cleared", () => {
    const level = loadFixtureLevel("level_main_13-11");
    expect(level.waves.map((w) => w.timeLimit)).toEqual([70, null]);
  });
});

describe("1-7 level model", () => {
  const level = loadFixtureLevel("level_main_01-07");
  const actions = level.waves.flatMap((w) => w.fragments.flatMap((f) => f.actions));

  it("has an 11 x 7 map, 27 routes and 24 spawn actions in one wave", () => {
    expect(level.map.width).toBe(11);
    expect(level.map.height).toBe(7);
    expect(level.map.tiles).toHaveLength(77);
    expect(level.routes).toHaveLength(27);
    expect(level.routes[0]!.motionMode).toBe("E_NUM");
    expect(level.waves).toHaveLength(1);
    expect(level.waves[0]!.fragments).toHaveLength(6);
    expect(actions.filter((a) => a.actionType === "SPAWN")).toHaveLength(24);
    // STORY and PREVIEW_CURSOR actions are kept for fragment timing.
    expect(actions).toHaveLength(27);
  });

  it("resolves every spawned enemy with its move speed and TW name", () => {
    const spawned = new Set(actions.filter((a) => a.actionType === "SPAWN").map((a) => a.key));
    expect(Object.keys(level.enemies).sort()).toEqual([...spawned].sort());
    const summary = Object.fromEntries(
      Object.values(level.enemies).map((e) => [e.id, [e.name, e.moveSpeed, e.motion]]),
    );
    expect(summary).toEqual({
      enemy_1007_slime_2: ["源石蟲·α", 1, "WALK"],
      enemy_1027_mob: ["暴徒", 1.1, "WALK"],
      enemy_1002_nsabr: ["士兵", 1.1, "WALK"],
      enemy_1028_mocock: ["雞尾酒投擲者", 1, "WALK"],
      enemy_1029_shdsbr: ["機動盾兵", 1, "WALK"],
      enemy_1030_wteeth: ["拾荒者", 0.8, "WALK"],
    });
  });
});

describe("enemy resolution", () => {
  /** 1-7 with its enemy refs replaced. */
  function withRefs(refs: RawEnemyDbRef[]) {
    return convertFixture({ ...rawFixture("level_main_01-07"), enemyDbRefs: refs });
  }

  it("level n falls back to level 0 for undefined fields (源石蟲 level 1 moves at 1.0)", () => {
    const worm = withRefs([
      { useDb: true, id: "enemy_1007_slime", level: 1, overwrittenData: null },
    ]).enemies["enemy_1007_slime"]!;
    expect(worm.moveSpeed).toBe(1);
    expect(worm.name).toBe("源石蟲");
    // Level 1 defines its own HP.
    expect(worm.maxHp).toBe(2050);
  });

  it("overwrittenData overrides only the fields it defines", () => {
    const worm = withRefs([
      {
        useDb: true,
        id: "enemy_1007_slime",
        level: 1,
        overwrittenData: {
          name: { m_defined: false, m_value: null },
          attributes: {
            moveSpeed: { m_defined: true, m_value: 0.6 },
            maxHp: { m_defined: false, m_value: 0 },
          },
        },
      },
    ]).enemies["enemy_1007_slime"]!;
    expect(worm.moveSpeed).toBe(0.6);
    expect(worm.maxHp).toBe(2050);
    expect(worm.name).toBe("源石蟲");
  });

  it("4-4: the level's overwrittenData raises the soldier's HP to 2200", () => {
    const level = loadFixtureLevel("level_main_04-04");
    expect(level.enemies["enemy_1002_nsabr"]!.maxHp).toBe(2200);
  });

  it("falls back to the CN name when the TW handbook lacks the enemy", () => {
    const raw = rawFixture("level_main_01-07");
    const handbook = rawEnemyHandbook();
    delete handbook.enemyData["enemy_1029_shdsbr"];
    const level = convertLevel("1-7", raw, buildEnemyCatalog(rawEnemyDatabase(), handbook));
    expect(level.enemies["enemy_1029_shdsbr"]!.name).toBe("持盾刀兵");
  });
});

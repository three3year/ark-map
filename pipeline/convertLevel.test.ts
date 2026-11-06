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

describe("null routes (older activity files)", () => {
  it("keep their slot as a placeholder that spawns nothing", () => {
    const raw = rawFixture("level_main_01-07");
    raw.routes![3] = null;
    const level = convertFixture(raw);
    expect(level.routes).toHaveLength(27);
    expect(level.routes[3]!.motionMode).toBe("E_NUM");
    expect(level.routes[4]).toEqual(loadFixtureLevel("level_main_01-07").routes[4]);
  });
});

describe("waves", () => {
  it("13-11: the first wave moves on after 70 s, the second waits until cleared", () => {
    const level = loadFixtureLevel("level_main_13-11");
    expect(level.waves.map((w) => w.timeLimit)).toEqual([70, null]);
  });
});

describe("checkpoints", () => {
  it("4-10: route 1 (霜星) keeps its waits and two disappear / appear pairs in order", () => {
    const level = loadFixtureLevel("level_main_04-10");
    const at = (row: number, col: number) => ({ row, col });
    expect(
      level.routes[1]!.checkpoints.map(({ type, time, position }) =>
        type === "MOVE" || type === "APPEAR_AT_POS" ? [type, position] : [type, time],
      ),
    ).toEqual([
      ["MOVE", at(5, 2)],
      ["WAIT_FOR_SECONDS", 20],
      ["MOVE", at(5, 6)],
      ["WAIT_FOR_SECONDS", 20],
      ["MOVE", at(5, 9)],
      ["DISAPPEAR", 0],
      ["WAIT_FOR_SECONDS", 20],
      ["APPEAR_AT_POS", at(3, 9)],
      ["MOVE", at(3, 8)],
      ["WAIT_FOR_SECONDS", 20],
      ["MOVE", at(3, 3)],
      ["WAIT_FOR_SECONDS", 20],
      ["MOVE", at(3, 1)],
      ["DISAPPEAR", 0],
      ["WAIT_FOR_SECONDS", 20],
      ["APPEAR_AT_POS", at(1, 1)],
      ["MOVE", at(1, 3)],
      ["WAIT_FOR_SECONDS", 20],
    ]);
    // Route 12: one MOVE and a 15 s wait.
    expect(level.routes[12]!.checkpoints.map((c) => [c.type, c.time])).toEqual([
      ["MOVE", 0],
      ["WAIT_FOR_SECONDS", 15],
    ]);
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

  it("takes an enemy not in the database (useDb false) wholly from overwrittenData", () => {
    const enemy = withRefs([
      {
        useDb: false,
        id: "enemy_1122_sphond_0",
        level: 0,
        overwrittenData: {
          name: { m_defined: true, m_value: "“小躁”" },
          prefabKey: { m_defined: true, m_value: "enemy_1122_sphond" },
          attributes: {
            maxHp: { m_defined: true, m_value: 3200 },
            moveSpeed: { m_defined: true, m_value: 1.9 },
          },
          motion: { m_defined: false, m_value: "WALK" },
        },
      },
    ]).enemies["enemy_1122_sphond_0"]!;
    expect(enemy).toMatchObject({ name: "“小躁”", maxHp: 3200, moveSpeed: 1.9, motion: "WALK" });
  });

  it("4-4: the level's overwrittenData raises the soldier's HP to 2200", () => {
    const level = loadFixtureLevel("level_main_04-04");
    expect(level.enemies["enemy_1002_nsabr"]!.maxHp).toBe(2200);
  });

  it("carries the TW handbook code, shown when an enemy has no avatar", () => {
    const level = loadFixtureLevel("level_main_01-07");
    expect(level.enemies["enemy_1007_slime_2"]!.code).toBe("B2");
  });

  it("falls back to the CN name when the TW handbook lacks the enemy", () => {
    const raw = rawFixture("level_main_01-07");
    const handbook = rawEnemyHandbook();
    delete handbook.enemyData["enemy_1029_shdsbr"];
    const level = convertLevel("1-7", raw, buildEnemyCatalog(rawEnemyDatabase(), handbook));
    expect(level.enemies["enemy_1029_shdsbr"]!.name).toBe("持盾刀兵");
  });
});

describe("難度修正", () => {
  it("4-4: keeps each modifier's difficulties, key and blackboard", () => {
    const level = loadFixtureLevel("level_main_04-04");
    expect(level.modifiers).toEqual([
      {
        difficulties: ["FOUR_STAR"],
        key: "gbuff_lifepoint",
        blackboard: [{ key: "value", value: 1, valueStr: null }],
      },
      {
        difficulties: ["FOUR_STAR"],
        key: "ebuff_attribute",
        blackboard: [
          { key: "atk", value: 1, valueStr: null },
          { key: "def", value: 1, valueStr: null },
          { key: "map_hp", value: 1, valueStr: null },
          { key: "move_speed", value: 2, valueStr: null },
        ],
      },
    ]);
  });

  it("decodes ALL, NONE and the numeric masks of older activity files (1 NORMAL, 2 FOUR_STAR)", () => {
    const raw = rawFixture("level_main_04-04");
    raw.runes = [
      { difficultyMask: "ALL", key: "a", blackboard: [] },
      { difficultyMask: "NONE", key: "b", blackboard: [] },
      { difficultyMask: 1, key: "c", blackboard: [] },
      { difficultyMask: 2, key: "d", blackboard: [] },
      { difficultyMask: 3, key: "e", blackboard: null },
      { difficultyMask: "SIX_STAR", key: "f" },
    ];
    const masks = convertFixture(raw).modifiers.map((m) => [m.key, m.difficulties]);
    expect(masks).toEqual([
      ["a", ["NORMAL", "FOUR_STAR", "SIX_STAR", "EASY"]],
      ["b", []],
      ["c", ["NORMAL"]],
      ["d", ["FOUR_STAR"]],
      ["e", ["NORMAL", "FOUR_STAR"]],
      ["f", ["SIX_STAR"]],
    ]);
  });
});

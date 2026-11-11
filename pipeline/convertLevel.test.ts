// Seam 2: raw game data -> level model.
import { describe, expect, it } from "vitest";
import {
  affectsMovement,
  isWalkable,
  tileAt,
  type Cell,
  withNames,
  type NameTable,
} from "../src/level/index.ts";
import {
  convertFixture,
  fixtureDeviceCatalog,
  fixtureLevelNames,
  loadFixtureLevel,
  rawEnemyDatabase,
  rawEnemyHandbook,
  rawCharacterTables,
  rawRangeTable,
  rawFixture,
  rawSkillTable,
} from "../test-fixtures/load.ts";
import {
  buildDeviceCatalog,
  buildEnemyCatalog,
  controllerKeys,
  convertLevel,
  siteLevelFile,
} from "./convertLevel.ts";
import type { RawEnemyDbRef, RawLevel, RawTokenInst } from "./raw.ts";

const enemyCatalog = () => buildEnemyCatalog(rawEnemyDatabase(), rawEnemyHandbook());

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

describe("numeric enums (older activity files)", () => {
  it("act14mini 8: checkpoint types and motion modes come out as names", () => {
    const level = loadFixtureLevel("level_act14mini_08");
    const at = (row: number, col: number) => ({ row, col });
    // Raw types 0 1 0 5 1 6 0 5 1 6 0 0 0.
    expect(
      level.routes[4]!.checkpoints.map(({ type, time, position }) =>
        type === "MOVE" || type === "APPEAR_AT_POS" ? [type, position] : [type, time],
      ),
    ).toEqual([
      ["MOVE", at(4, 4)],
      ["WAIT_FOR_SECONDS", 15],
      ["MOVE", at(4, 8)],
      ["DISAPPEAR", 0],
      ["WAIT_FOR_SECONDS", 5],
      ["APPEAR_AT_POS", at(2, 3)],
      ["MOVE", at(2, 8)],
      ["DISAPPEAR", 0],
      ["WAIT_FOR_SECONDS", 5],
      ["APPEAR_AT_POS", at(4, 11)],
      ["MOVE", at(4, 10)],
      ["MOVE", at(6, 10)],
      ["MOVE", at(6, 7)],
    ]);
    expect(level.routes[4]!.motionMode).toBe("WALK");
    // Raw motion mode 1, waits of type 4 (wave-timed).
    expect(level.routes[0]!.motionMode).toBe("FLY");
    expect(level.routes[0]!.checkpoints.map((c) => [c.type, c.time])).toEqual([
      ["MOVE", 0],
      ["WAIT_CURRENT_WAVE_TIME", 160],
      ["MOVE", 0],
      ["WAIT_CURRENT_WAVE_TIME", 290],
      ["MOVE", 0],
    ]);
  });

  it("act14mini 8: tiles and actions come out as names", () => {
    const level = loadFixtureLevel("level_act14mini_08");
    const tile = (key: string) => level.map.tiles.find((t) => t.tileKey === key);
    expect(tile("tile_road")).toMatchObject({
      heightType: "LOWLAND",
      passableMask: "ALL",
      buildableType: "MELEE",
    });
    expect(tile("tile_wall")).toMatchObject({
      heightType: "HIGHLAND",
      passableMask: "FLY_ONLY",
      buildableType: "RANGED",
    });
    expect(tile("tile_forbidden")).toMatchObject({
      heightType: "HIGHLAND",
      passableMask: "FLY_ONLY",
      buildableType: "NONE",
    });
    const walk = level.routes.filter((r) => r.motionMode === "WALK");
    const blocked = walk
      .flatMap((r) => [r.start, r.end])
      .filter((p) => !isWalkable(tileAt(level.map, p)!));
    expect(blocked).toEqual([]);
    const actions = level.waves.flatMap((w) => w.fragments.flatMap((f) => f.actions));
    expect(new Set(actions.map((a) => a.actionType))).toEqual(new Set(["SPAWN"]));
    expect(actions).toHaveLength(18);
  });

  it("reports a number with no known name and writes it as UNKNOWN_<n>", () => {
    const raw = rawFixture("level_act14mini_08");
    (raw.routes![4]!.checkpoints![1]! as { type: number }).type = 7;
    raw.waves[0]!.fragments[0]!.actions[0]!.actionType = 3;
    raw.runes![0]!.difficultyMask = 4;
    const unknown: [string, number | string][] = [];
    const level = convertLevel(
      "act14mini_08",
      raw,
      buildEnemyCatalog(rawEnemyDatabase(), rawEnemyHandbook()),
      { onUnknownEnum: (field, value) => unknown.push([field, value]) },
    );
    expect(unknown).toEqual([
      ["difficultyMask", 4],
      ["checkpointType", 7],
      ["actionType", 3],
    ]);
    expect(level.routes[4]!.checkpoints[1]!.type).toBe("UNKNOWN_7");
    expect(level.waves[0]!.fragments[0]!.actions[0]!.actionType).toBe("UNKNOWN_3");
  });

  it("reports an action or checkpoint type name it does not know and writes it as UNKNOWN_<name>", () => {
    const raw = rawFixture("level_main_01-07");
    raw.routes![1]!.checkpoints![0]!.type = "JUMP";
    raw.waves[0]!.fragments[0]!.actions[0]!.actionType = "SUMMON";
    const unknown: [string, number | string][] = [];
    const level = convertLevel(
      "main_01-07",
      raw,
      buildEnemyCatalog(rawEnemyDatabase(), rawEnemyHandbook()),
      { onUnknownEnum: (field, value) => unknown.push([field, value]) },
    );
    expect(unknown).toEqual([
      ["checkpointType", "JUMP"],
      ["actionType", "SUMMON"],
    ]);
    expect(level.routes[1]!.checkpoints[0]!.type).toBe("UNKNOWN_JUMP");
    expect(level.waves[0]!.fragments[0]!.actions[0]!.actionType).toBe("UNKNOWN_SUMMON");
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

describe("名稱表", () => {
  const catalog = () => buildEnemyCatalog(rawEnemyDatabase(), rawEnemyHandbook());

  it("1-7: the level file names no enemy; the name table does, and restores the level", () => {
    const level = loadFixtureLevel("level_main_01-07");
    const names: NameTable = { enemies: {}, terrain: {}, devices: {} };
    const file = siteLevelFile(level, catalog(), names);
    expect(Object.values(file.enemies).filter((e) => e.name !== undefined)).toEqual([]);
    expect(names.enemies).toMatchObject({
      enemy_1007_slime_2: "源石蟲·α",
      enemy_1029_shdsbr: "機動盾兵",
    });
    expect(Object.keys(names.enemies).sort()).toEqual(Object.keys(level.enemies).sort());
    expect(withNames(file, names)).toEqual(level);
  });

  it("one table serves every level; a name only one level gives stays in its level file", () => {
    const names: NameTable = { enemies: {}, terrain: {}, devices: {} };
    const other = siteLevelFile(loadFixtureLevel("level_main_04-04"), catalog(), names);
    const raw = rawFixture("level_main_01-07");
    // A level-local enemy (not in the database), and a level renaming an enemy TW has no name for.
    raw.enemyDbRefs!.push({
      useDb: false,
      id: "enemy_1122_sphond_0",
      level: 0,
      overwrittenData: { name: { m_defined: true, m_value: "“小躁”" } },
    });
    const handbook = rawEnemyHandbook();
    delete handbook.enemyData["enemy_1029_shdsbr"];
    raw.enemyDbRefs!.find((r) => r.id === "enemy_1029_shdsbr")!.overwrittenData = {
      name: { m_defined: true, m_value: "改名的持盾刀兵" },
    };
    const renamed = buildEnemyCatalog(rawEnemyDatabase(), handbook);
    const level = convertLevel("1-7", raw, renamed);
    const file = siteLevelFile(level, renamed, names);
    expect(
      Object.values(file.enemies).flatMap((e) => (e.name === undefined ? [] : [[e.id, e.name]])),
    ).toEqual([
      ["enemy_1029_shdsbr", "改名的持盾刀兵"],
      ["enemy_1122_sphond_0", "“小躁”"],
    ]);
    expect(names.enemies["enemy_1029_shdsbr"]).toBe("持盾刀兵");
    expect(names.enemies["enemy_1122_sphond_0"]).toBeUndefined();
    expect(withNames(file, names)).toEqual(level);
    expect(withNames(other, names)).toEqual(loadFixtureLevel("level_main_04-04"));
  });
});

describe("名稱表: 裝置", () => {
  it("TB-1: the level file names and describes no device; the name table does, and restores the level", () => {
    const level = loadFixtureLevel("level_act10mini_01");
    const names: NameTable = { enemies: {}, terrain: {}, devices: {} };
    const file = siteLevelFile(level, enemyCatalog(), names, fixtureDeviceCatalog());
    expect(file.devices.filter((d) => "name" in d || "description" in d)).toEqual([]);
    expect(names.devices).toEqual({
      trap_014_tower: { name: 'L-44"留聲機"', description: "優先攻擊生命上限最高的單位" },
      trap_027_stone: { name: "碎石", description: "改變敵人行進路線" },
    });
    expect(withNames(file, names)).toEqual(level);
  });

  it("a device kind neither character table has keeps its key as its name in the level file", () => {
    const level = convertLevel("WR-EX-6", rawFixture("level_act16d5_ex06"), enemyCatalog());
    const names: NameTable = { enemies: {}, terrain: {}, devices: {} };
    const file = siteLevelFile(
      level,
      enemyCatalog(),
      names,
      buildDeviceCatalog(new Set(), {}, {}, {}, {}),
    );
    expect(names.devices).toEqual({});
    expect(file.devices[0]).toMatchObject({ name: "trap_001_crate", description: null });
    expect(withNames(file, names)).toEqual(level);
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

describe("條件出兵", () => {
  it("11-06 (shown as 11-7): one branch spawning on an extra route that starts at its device", () => {
    const level = loadFixtureLevel("level_main_11-06");
    expect(level.branches).toHaveLength(1);
    const [branch] = level.branches;
    expect(branch!.key).toBe("route1");
    expect(branch!.deviceOnly).toBe(false);
    expect(branch!.phases).toHaveLength(1);
    const [action] = branch!.phases[0]!.actions;
    expect(action).toMatchObject({ actionType: "SPAWN", key: "enemy_1266_nhapos", count: 1 });
    // routeIndex points into extraRoutes: extra route 0 starts on the cell of the device that
    // triggers the branch, predefines.tokenInsts trap_086_larva#1 at (4, 10).
    expect(action!.routeIndex).toBe(0);
    expect(level.extraRoutes[0]!.start).toEqual({ row: 4, col: 10 });
  });

  it("12-18 (shown as 12-20): two spawning branches, each on its own extra route", () => {
    const level = loadFixtureLevel("level_main_12-18");
    expect(
      level.branches.map((b) => [b.key, b.deviceOnly, b.phases[0]!.actions[0]!.routeIndex]),
    ).toEqual([
      ["branch_2", false, 0],
      ["branch_1", false, 1],
    ]);
  });

  it("5-10: the ballista branch only activates devices, phase by phase", () => {
    const level = loadFixtureLevel("level_main_05-10");
    expect(level.branches.map((b) => [b.key, b.deviceOnly])).toEqual([["faust_ballis", true]]);
    const actions = level.branches[0]!.phases.flatMap((p) => p.actions);
    expect(actions.every((a) => a.actionType === "ACTIVATE_PREDEFINED")).toBe(true);
    expect(actions[0]!.key).toBe("trap_007_ballis#1");
  });

  it("an enemy only a branch spawns, missing from enemyDbRefs, comes from the database at level 0", () => {
    // 24 CN level files do this (11-18 spawns enemy_1266_nhapos from four branches without
    // listing it); wave actions never do.
    const raw = rawFixture("level_main_11-06");
    raw.enemyDbRefs = raw.enemyDbRefs!.filter((r) => r.id !== "enemy_1266_nhapos");
    const enemy = convertFixture(raw).enemies["enemy_1266_nhapos"];
    expect(enemy).toMatchObject({ id: "enemy_1266_nhapos", level: 0 });
    expect(enemy!.moveSpeed).toBeGreaterThan(0);
  });

  it("a level without branches has none", () => {
    expect(loadFixtureLevel("level_main_01-07").branches).toEqual([]);
  });
});

describe("key fields of the levels the timeline tests use", () => {
  // Expected values read straight from the raw files (grid, route list, waves, runes).
  const cases = [
    {
      name: "level_main_15-12",
      width: 11,
      height: 7,
      routes: 36,
      extraRoutes: 0,
      route: 1,
      checkpoints: ["MOVE", "WAIT_FOR_SECONDS", "MOVE", "MOVE", "MOVE"],
      fragments: [5],
      actions: 36,
      spawnActions: 33,
      hiddenGroups: ["group1", "group2"],
      branches: 0,
    },
    {
      name: "level_rogue2_2-6",
      width: 8,
      height: 8,
      routes: 35,
      extraRoutes: 2,
      route: 14,
      checkpoints: [
        "MOVE",
        "WAIT_FOR_SECONDS",
        "MOVE",
        "DISAPPEAR",
        "APPEAR_AT_POS",
        "MOVE",
        "MOVE",
        "MOVE",
      ],
      fragments: [6, 1],
      actions: 35,
      spawnActions: 26,
      hiddenGroups: ["allydonq", "raid"],
      branches: 2,
    },
    {
      name: "level_act18d0_ex04",
      width: 11,
      height: 8,
      routes: 24,
      extraRoutes: 0,
      route: 0,
      checkpoints: ["MOVE", "WAIT_FOR_SECONDS", "MOVE"],
      fragments: [5],
      actions: 24,
      spawnActions: 24,
      hiddenGroups: [],
      branches: 0,
    },
  ];

  for (const c of cases) {
    it(`${c.name}: grid, routes, checkpoints, actions, 隱藏組, 條件出兵, no movement modifier`, () => {
      const level = loadFixtureLevel(c.name);
      const actions = level.waves.flatMap((w) => w.fragments.flatMap((f) => f.actions));
      expect([level.map.width, level.map.height]).toEqual([c.width, c.height]);
      expect([level.routes.length, level.extraRoutes.length]).toEqual([c.routes, c.extraRoutes]);
      expect(level.routes[c.route]!.checkpoints.map((p) => p.type)).toEqual(c.checkpoints);
      expect(level.waves.map((w) => w.fragments.length)).toEqual(c.fragments);
      expect(actions).toHaveLength(c.actions);
      expect(actions.filter((a) => a.actionType === "SPAWN")).toHaveLength(c.spawnActions);
      const hidden = new Set(actions.flatMap((a) => (a.hiddenGroup ? [a.hiddenGroup] : [])));
      expect([...hidden].sort()).toEqual(c.hiddenGroups);
      expect(level.branches).toHaveLength(c.branches);
      expect(level.modifiers.filter(affectsMovement)).toEqual([]);
    });
  }
});

describe("裝置", () => {
  it("TB-1: 8 blocking 碎石 at their cells, by alias; its 4 留聲機 do not block", () => {
    const level = loadFixtureLevel("level_act10mini_01");
    const stones = level.devices.filter((d) => d.key === "trap_027_stone");
    expect(stones.map((d) => [d.alias, d.cell])).toEqual([
      ["trap_027_stone#1", { row: 4, col: 4 }],
      ["trap_027_stone#2", { row: 4, col: 5 }],
      ["trap_027_stone#3", { row: 3, col: 4 }],
      ["trap_027_stone#4", { row: 3, col: 5 }],
      ["trap_027_stone#5", { row: 2, col: 4 }],
      ["trap_027_stone#6", { row: 2, col: 5 }],
      ["trap_027_stone#7", { row: 1, col: 4 }],
      ["trap_027_stone#8", { row: 1, col: 5 }],
    ]);
    expect(stones.every((d) => d.blocker && !d.hidden && d.direction === "UP")).toBe(true);
    const towers = level.devices.filter((d) => d.key === "trap_014_tower");
    expect(towers.map((d) => d.blocker)).toEqual([false, false, false, false]);
  });

  it("WR-EX-6: 3 障礙物 hidden at the start, which the challenge 難度修正 enables", () => {
    const level = loadFixtureLevel("level_act16d5_ex06");
    expect(level.devices.map((d) => [d.alias, d.cell, d.hidden, d.blocker])).toEqual([
      ["trap_001_crate#2", { row: 3, col: 7 }, true, true],
      ["trap_001_crate#3", { row: 5, col: 5 }, true, true],
      ["trap_001_crate#4", { row: 3, col: 3 }, true, true],
    ]);
    const enable = level.modifiers.filter((m) => m.key === "level_predefines_enable");
    expect(enable.map((m) => [m.difficulties, m.blackboard.map((b) => b.key).sort()])).toEqual([
      [["FOUR_STAR"], ["trap_001_crate#2", "trap_001_crate#3", "trap_001_crate#4"]],
    ]);
  });

  it("控制器: a key with most instances at (0, 0) over all levels is left out; one with few is kept", () => {
    const token = (key: string, row: number, col: number): RawTokenInst => ({
      alias: `${key}#${row}${col}`,
      inst: { characterKey: key },
      position: { row, col },
      direction: "UP",
      hidden: false,
    });
    const tb1 = rawFixture("level_act10mini_01");
    tb1.predefines!.tokenInsts!.push(
      token("trap_050_blizzard", 0, 0),
      token("trap_027_stone", 0, 0),
    );
    const other = {
      predefines: {
        tokenInsts: [token("trap_050_blizzard", 0, 0), token("trap_050_blizzard", 2, 3)],
      },
    };
    const controllers = controllerKeys([tb1, other, rawFixture("level_act16d5_ex06")]);
    expect([...controllers]).toEqual(["trap_050_blizzard"]);
    const level = convertLevel("TB-1", tb1, enemyCatalog(), {
      devices: buildDeviceCatalog(controllers, {}, {}, {}, {}),
    });
    expect(level.devices.filter((d) => d.key === "trap_050_blizzard")).toEqual([]);
    expect(level.devices.filter((d) => d.key === "trap_027_stone")).toHaveLength(9);
    expect(level.devices.at(-1)!.cell).toEqual({ row: 0, col: 0 });
  });

  it("warns once per level about a key in neither blocker list, and outputs it as not blocking", () => {
    const raw = rawFixture("level_act10mini_01");
    const stone = raw.predefines!.tokenInsts![0]!;
    for (const alias of ["new#1", "new#2"]) {
      raw.predefines!.tokenInsts!.push({ ...stone, alias, inst: { characterKey: "trap_999_new" } });
    }
    const unknown: string[] = [];
    const level = convertLevel("TB-1", raw, enemyCatalog(), {
      onUnknownDevice: (key) => unknown.push(key),
    });
    expect(unknown).toEqual(["trap_999_new"]);
    expect(level.devices.filter((d) => d.key === "trap_999_new").map((d) => d.blocker)).toEqual([
      false,
      false,
    ]);
  });

  it("every device key of the fixture levels is in one of the blocker lists", () => {
    const unknown: string[] = [];
    for (const name of fixtureLevelNames()) {
      convertLevel(name, rawFixture(name), enemyCatalog(), {
        devices: fixtureDeviceCatalog(),
        onUnknownDevice: (key) => unknown.push(key),
      });
    }
    expect(unknown).toEqual([]);
  });

  it("does not read pre-placed operators (characterInsts)", () => {
    const raw = rawFixture("level_act10mini_01") as RawLevel & {
      predefines: { characterInsts: RawTokenInst[] };
    };
    const stone = raw.predefines.tokenInsts![0]!;
    raw.predefines.characterInsts = [
      { ...stone, alias: "op", inst: { characterKey: "char_002_amiya" } },
    ];
    expect(convertFixture(raw).devices.map((d) => d.key)).not.toContain("char_002_amiya");
  });

  it("names a device and gives its description from the TW character table, markup removed", () => {
    const stone = loadFixtureLevel("level_act10mini_01").devices[0]!;
    expect([stone.name, stone.description]).toEqual(["碎石", "改變敵人行進路線"]);
    const shield = loadFixtureLevel("level_rogue3_5-5").devices.find(
      (d) => d.key === "trap_024_npcsld",
    )!;
    expect(shield.description).toBe("無法被友方角色治療");
  });

  it("falls back to the CN character table when TW lacks the key, and to the key when both do", () => {
    const { cn, tw } = rawCharacterTables();
    delete tw["trap_001_crate"];
    const level = convertLevel("WR-EX-6", rawFixture("level_act16d5_ex06"), enemyCatalog(), {
      devices: buildDeviceCatalog(new Set(), cn, tw, {}, {}),
    });
    expect(level.devices.map((d) => [d.name, d.description])[0]).toEqual(["障碍物", null]);
    const unnamed = convertLevel("WR-EX-6", rawFixture("level_act16d5_ex06"), enemyCatalog());
    expect(unnamed.devices[0]!.name).toBe("trap_001_crate");
  });
});

describe("作用範圍", () => {
  const sorted = (cells: Cell[]) => [...cells].sort((a, b) => a.row - b.row || a.col - b.col);
  const effectOf = (levelName: string, alias: string) =>
    sorted(loadFixtureLevel(levelName).devices.find((d) => d.alias === alias)!.effectCells);
  const block = (rows: number[], cols: number[]) =>
    rows.flatMap((row) => cols.map((col) => ({ row, col })));
  const squareWithoutCorners = ({ row, col }: Cell) =>
    sorted(
      block([-2, -1, 0, 1, 2], [-2, -1, 0, 1, 2])
        .filter((d) => Math.abs(d.row) + Math.abs(d.col) < 4)
        .map((d) => ({ row: row + d.row, col: col + d.col })),
    );

  it("16-2: the 嚴重汙染設施 at (4, 4) covers the 21 cells of x-2 around it, its own cell included", () => {
    const cells = effectOf("level_main_16-02", "trap_271_fowstn#1");
    expect(cells).toHaveLength(21);
    expect(cells).toEqual(squareWithoutCorners({ row: 4, col: 4 }));
  });

  it("TB-1: a 留聲機 takes x-2 from the character table", () => {
    expect(effectOf("level_act10mini_01", "trap_014_tower#1")).toEqual(
      squareWithoutCorners({ row: 4, col: 6 }),
    );
  });

  it("TB-1: the cells past the map's edge are cut: the 留聲機 at (1, 6) keeps 18", () => {
    const cells = effectOf("level_act10mini_01", "trap_014_tower#3");
    expect(cells).toHaveLength(18);
    expect(cells).toEqual(squareWithoutCorners({ row: 1, col: 6 }).filter((c) => c.row >= 0));
  });

  it("5-1 (集成戰略): a 樹叢 covers its own cell and the four beside it (x-5)", () => {
    expect(effectOf("level_rogue6_5-1", "trap_218_fttree#1")).toEqual(
      sorted([
        { row: 6, col: 2 },
        { row: 7, col: 2 },
        { row: 5, col: 2 },
        { row: 6, col: 1 },
        { row: 6, col: 3 },
      ]),
    );
  });

  describe("5-10: a 弩炮, with no range in the character table, takes its skill's 1-1 (its own cell and the one ahead), turned to face where it is placed", () => {
    const at = (row: number, col: number): Cell => ({ row, col });
    it.each([
      ["trap_007_ballis#3", "UP", [at(1, 5), at(2, 5)]],
      ["trap_007_ballis#1", "LEFT", [at(3, 9), at(3, 10)]],
      ["trap_007_ballis#2", "DOWN", [at(5, 6), at(6, 6)]],
      ["trap_007_ballis#8", "RIGHT", [at(4, 2), at(4, 3)]],
    ])("%s facing %s", (alias, _facing, cells) => {
      expect(effectOf("level_main_05-10", alias)).toEqual(cells);
    });
  });

  it("TB-1: a 留聲機 keeps the character table's x-2, though its skill has x-5", () => {
    expect(effectOf("level_act10mini_01", "trap_014_tower#2")).toEqual(
      squareWithoutCorners({ row: 4, col: 7 }),
    );
  });

  it("EP-8: a 鹽坨子炮 at level 1 takes 4-1 from its talent: five cells ahead on its row", () => {
    expect(effectOf("level_act39side_08", "trap_196_cnnon#1")).toEqual(block([2], [3, 4, 5, 6, 7]));
  });

  it("EP-8: a 鹽坨子炮 at level 3 takes 6-1 from its talent: seven cells ahead on its row", () => {
    expect(effectOf("level_act39side_08", "trap_196_cnnon#3")).toEqual(
      block([6], [1, 2, 3, 4, 5, 6, 7]),
    );
  });

  it("a 碎石, with a range of only its own cell everywhere, has none", () => {
    const stones = loadFixtureLevel("level_act10mini_01").devices.filter(
      (d) => d.key === "trap_027_stone",
    );
    expect(stones.map((d) => d.effectCells)).toEqual(stones.map(() => []));
  });

  it("a 火灶, whose range the game gives as a radius, has none", () => {
    const stove = loadFixtureLevel("level_act40side_03").devices.find(
      (d) => d.key === "trap_211_cjgtow",
    )!;
    expect(stove.effectCells).toEqual([]);
  });

  function facilityAt(phases: { rangeId: string | null }[], phase: string) {
    const { cn, tw } = rawCharacterTables();
    cn["trap_271_fowstn"]!.phases = phases;
    const raw = rawFixture("level_main_16-02");
    for (const token of raw.predefines!.tokenInsts!) token.inst.phase = phase;
    const level = convertLevel("16-2", raw, enemyCatalog(), {
      devices: buildDeviceCatalog(new Set(), cn, tw, rawRangeTable(), rawSkillTable()),
    });
    return sorted(level.devices.find((d) => d.alias === "trap_271_fowstn#1")!.effectCells);
  }

  it("a device past the last 階段 the character table lists takes the last one", () => {
    expect(facilityAt([{ rangeId: "0-1" }, { rangeId: "x-2" }], "PHASE_2")).toEqual(
      squareWithoutCorners({ row: 4, col: 4 }),
    );
  });

  it("a 階段 with no range id gives none, though another 階段 has one", () => {
    expect(facilityAt([{ rangeId: null }, { rangeId: "x-2" }], "PHASE_0")).toEqual([]);
  });

  it("the site's level file keeps each device's 作用範圍", () => {
    const level = loadFixtureLevel("level_main_16-02");
    const names: NameTable = { enemies: {}, terrain: {}, devices: {} };
    const file = siteLevelFile(level, enemyCatalog(), names, fixtureDeviceCatalog());
    expect(file.devices.map((d) => d.effectCells)).toEqual(level.devices.map((d) => d.effectCells));
    expect(file.devices.some((d) => d.effectCells.length === 21)).toBe(true);
  });

  it("warns about a range id the range table lacks, and gives that device none", () => {
    const { cn, tw } = rawCharacterTables();
    cn["trap_271_fowstn"]!.phases = [{ rangeId: "x-404" }];
    const unknown: [string, string][] = [];
    const level = convertLevel("16-2", rawFixture("level_main_16-02"), enemyCatalog(), {
      devices: buildDeviceCatalog(new Set(), cn, tw, rawRangeTable(), rawSkillTable()),
      onUnknownRangeId: (rangeId, key) => unknown.push([rangeId, key]),
    });
    expect(unknown).toEqual([
      ["x-404", "trap_271_fowstn"],
      ["x-404", "trap_271_fowstn"],
    ]);
    const facilities = level.devices.filter((d) => d.key === "trap_271_fowstn");
    expect(facilities.map((d) => d.effectCells)).toEqual([[], []]);
  });
});

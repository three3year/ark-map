// Seam 1: level model -> baseline timeline / snapshot.
import { describe, expect, it } from "vitest";
import { loadFixtureLevel } from "../../test-fixtures/load.ts";
import type { Level } from "../level/index.ts";
import { buildTimeline, takeSnapshot } from "./index.ts";

/** PRTS.Map's 1-7 spawn table: the "时间点" column of its 24 rows, in its order. */
const prts107 = [
  6, 12, 18, 19, 32, 35, 50, 50, 53, 56, 65, 65, 71, 71, 75, 76, 86, 87, 94, 94, 99, 107, 108, 116,
];

describe("spawn times", () => {
  const timeline = buildTimeline(loadFixtureLevel("level_main_01-07"));

  it("1-7: each spawn action's first spawn matches PRTS.Map's 24 rows", () => {
    const firstByAction = new Map<string, number>();
    for (const ind of timeline.individuals) {
      const key = `${ind.fragmentIndex}/${ind.actionIndex}`;
      firstByAction.set(key, Math.min(firstByAction.get(key) ?? Infinity, ind.spawnTime));
    }
    expect([...firstByAction.values()].sort((a, b) => a - b)).toEqual(prts107);
  });

  it("1-7: 41 individuals, the k-th of an action spawning k intervals after the first", () => {
    expect(timeline.individuals).toHaveLength(41);
    // Fragment 4's fifth action: 5 x 源石蟲·α every 2 s, PRTS row "75s".
    const action = timeline.individuals.filter((i) => i.fragmentIndex === 4 && i.actionIndex === 4);
    expect(action.map((i) => i.spawnTime)).toEqual([75, 77, 79, 81, 83]);
  });
});

describe("snapshot", () => {
  const timeline = buildTimeline(loadFixtureLevel("level_main_01-07"));

  it("1-7 at 0 s: everyone is pending", () => {
    expect(takeSnapshot(timeline, 0).counts).toEqual({ pending: 41, onField: 0, leaked: 0 });
  });

  it("1-7 at 31 s: the 6 s 源石蟲·α has leaked, six more are on the field", () => {
    // Spawns before 31 s: 6, 12, 13, 18, 19, 23, 24. The first one walks the corridors
    // F11 -> F5 -> E5 -> E3 -> D3 -> D1, 12 cells, at 0.5 cells/s: 24 s, leaking at 30 s.
    const snapshot = takeSnapshot(timeline, 31);
    expect(snapshot.counts).toEqual({ pending: 34, onField: 6, leaked: 1 });
    expect(snapshot.onField).toHaveLength(6);
  });
});

describe("movement model v0", () => {
  /** A 1 x 5 corridor with one ground route from (0, 0) to (0, 4). */
  function corridor(moveSpeed: number, spawnOffset = { x: 0, y: 0 }): Level {
    const tile = {
      tileKey: "tile_road",
      heightType: "LOWLAND",
      passableMask: "ALL",
      buildableType: "MELEE",
    };
    const action = {
      actionType: "SPAWN",
      key: "enemy_test",
      count: 1,
      preDelay: 2,
      interval: 0,
      routeIndex: 0,
      hiddenGroup: null,
      randomSpawnGroupKey: null,
      randomSpawnGroupPackKey: null,
      weight: 0,
      harmless: false,
    };
    return {
      levelId: "test/corridor",
      options: {
        characterLimit: 8,
        maxLifePoint: 3,
        initialCost: 10,
        maxCost: 99,
        moveMultiplier: 0.5,
      },
      map: { width: 5, height: 1, tiles: Array.from({ length: 5 }, () => tile) },
      routes: [
        {
          motionMode: "WALK",
          start: { row: 0, col: 0 },
          end: { row: 0, col: 4 },
          spawnOffset,
          checkpoints: [],
          allowDiagonalMove: false,
          visitEveryTileCenter: false,
          visitEveryNodeCenter: false,
          visitEveryCheckPoint: false,
        },
      ],
      extraRoutes: [],
      waves: [{ preDelay: 0, postDelay: 0, fragments: [{ preDelay: 0, actions: [action] }] }],
      enemies: {
        enemy_test: {
          id: "enemy_test",
          level: 0,
          name: "測試",
          moveSpeed,
          motion: "WALK",
          levelType: "NORMAL",
          maxHp: 1,
          atk: 0,
          def: 0,
          notCountInTotal: false,
          avatar: null,
        },
      },
    };
  }

  it("moves from start to end at speed x level multiplier, then leaks", () => {
    const [enemy] = buildTimeline(corridor(2)).individuals; // 1 cell/s, spawns at 2 s
    expect(enemy!.stateAt(1.9)).toEqual({ kind: "pending" });
    expect(enemy!.stateAt(2)).toEqual({
      kind: "onField",
      position: { x: 0, y: 0 },
      invisible: false,
    });
    expect(enemy!.stateAt(4.5)).toEqual({
      kind: "onField",
      position: { x: 2.5, y: 0 },
      invisible: false,
    });
    expect(enemy!.leakTime).toBe(6);
    expect(enemy!.stateAt(6)).toEqual({ kind: "leaked" });
  });

  it("starts at the start cell centre plus the spawn offset", () => {
    const [enemy] = buildTimeline(corridor(2, { x: 0.5, y: 0 })).individuals;
    expect(enemy!.stateAt(2)).toEqual({
      kind: "onField",
      position: { x: 0.5, y: 0 },
      invisible: false,
    });
    expect(enemy!.leakTime).toBe(5.5);
  });

  it("clamps the attribute speed to at least 0.1", () => {
    const [enemy] = buildTimeline(corridor(0.01)).individuals; // 0.1 x 0.5 = 0.05 cells/s
    expect(enemy!.leakTime).toBe(2 + 4 / 0.05);
  });
});

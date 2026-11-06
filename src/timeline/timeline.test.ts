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

describe("waves", () => {
  // 08-17 has four waves; PRTS.Map's 阶段时间点 for the second: 2 x 5 s every 18 s and
  // 2 x 13 s every 16 s. The wave's 5 s preDelay comes before its first fragment.
  const level = loadFixtureLevel("level_main_08-17");

  it("each wave starts its own T = 0; earlier waves count as cleared", () => {
    const timeline = buildTimeline(level, { waveIndex: 1 });
    expect(timeline.individuals.map((i) => i.spawnTime).sort((a, b) => a - b)).toEqual([
      5, 13, 23, 29,
    ]);
    expect(takeSnapshot(timeline, 0).counts).toEqual({ pending: 4, onField: 0, leaked: 0 });
  });

  it("a wave index past the last wave has no individuals", () => {
    expect(buildTimeline(level, { waveIndex: 4 }).individuals).toEqual([]);
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

describe("4-10: waits and teleports", () => {
  // 霜星 (attribute speed 0.5 x 0.5 = 0.25 cells/s) spawns at 3 s at (5, 0) on route 1:
  // 2 cells to (5,2) -> 11 s, wait 20 -> 31; 4 cells to (5,6) -> 47, wait -> 67; 3 cells to
  // (5,9) -> 79, disappear, wait -> 99, appear at (3,9); 1 cell -> 103, wait -> 123;
  // 5 cells to (3,3) -> 143, wait -> 163; 2 cells to (3,1) -> 171, disappear, wait -> 191,
  // appear at (1,1); 2 cells to (1,3) -> 199, wait -> 219; 7 cells to the end (1,10) -> 247.
  const timeline = buildTimeline(loadFixtureLevel("level_main_04-10"));
  const frostNova = timeline.individuals.find((i) => i.enemy.id === "enemy_1505_frstar")!;
  const at = (x: number, y: number, invisible = false) => ({
    kind: "onField",
    position: { x, y },
    invisible,
  });

  it("walks, waits, hides and reappears on schedule", () => {
    expect(frostNova.spawnTime).toBe(3);
    expect(frostNova.stateAt(7)).toEqual(at(1, 5));
    expect(frostNova.stateAt(20)).toEqual(at(2, 5));
    expect(frostNova.stateAt(39)).toEqual(at(4, 5));
    expect(frostNova.stateAt(90)).toEqual(at(9, 5, true));
    expect(frostNova.stateAt(99)).toEqual(at(9, 3));
    expect(frostNova.stateAt(101)).toEqual(at(8.5, 3));
    expect(frostNova.stateAt(180)).toEqual(at(1, 3, true));
    expect(frostNova.stateAt(195)).toEqual(at(2, 1));
    expect(frostNova.leakTime).toBe(247);
  });

  it("counts the hidden 霜星 as on field", () => {
    const snapshot = takeSnapshot(timeline, 90);
    const hidden = snapshot.onField.filter((e) => e.invisible);
    expect(hidden.map((e) => e.individual.enemy.id)).toEqual(["enemy_1505_frstar"]);
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
      waves: [
        {
          preDelay: 0,
          postDelay: 0,
          timeLimit: null,
          fragments: [{ preDelay: 0, actions: [action] }],
        },
      ],
      enemies: {
        enemy_test: {
          id: "enemy_test",
          level: 0,
          name: "測試",
          code: null,
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

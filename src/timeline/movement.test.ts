// Seam 1: level model -> baseline timeline. Ground individuals follow the nextNode chain.
import { describe, expect, it } from "vitest";
import type { Cell, Checkpoint, Level, MotionMode, Tile, Vec2 } from "../level/index.ts";
import { buildTimeline, takeSnapshot, type IndividualState } from "./index.ts";

const road: Tile = {
  tileKey: "tile_road",
  heightType: "LOWLAND",
  passableMask: "ALL",
  buildableType: "MELEE",
};
const wall: Tile = { ...road, tileKey: "tile_wall", passableMask: "FLY_ONLY" };

interface TestRoute {
  motionMode: MotionMode;
  start: Cell;
  end: Cell;
  allowDiagonalMove: boolean;
  spawnOffset?: Vec2;
  checkpoints?: Checkpoint[];
}

/** Spawn timing: fragment preDelay and action preDelay; both 0 = spawn at 0 s. */
interface TestTiming {
  fragmentDelay?: number;
  spawnDelay?: number;
}

/** One enemy at 1 cell/s on a map drawn top row first ("#" = wall). */
function level(rows: string[], route: TestRoute, timing: TestTiming = {}): Level {
  const bottomUp = [...rows].reverse();
  return {
    levelId: "test/movement",
    options: {
      characterLimit: 8,
      maxLifePoint: 3,
      initialCost: 10,
      maxCost: 99,
      moveMultiplier: 1,
    },
    modifiers: [],
    map: {
      width: bottomUp[0]!.length,
      height: bottomUp.length,
      tiles: bottomUp.flatMap((row) => [...row].map((ch) => (ch === "#" ? wall : road))),
    },
    routes: [
      {
        spawnOffset: { x: 0, y: 0 },
        checkpoints: [],
        ...route,
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
        fragments: [
          {
            preDelay: timing.fragmentDelay ?? 0,
            actions: [
              {
                actionType: "SPAWN",
                key: "enemy_test",
                count: 1,
                preDelay: timing.spawnDelay ?? 0,
                interval: 0,
                routeIndex: 0,
                hiddenGroup: null,
                randomSpawnGroupKey: null,
                randomSpawnGroupPackKey: null,
                weight: 0,
                harmless: false,
              },
            ],
          },
        ],
      },
    ],
    enemies: {
      enemy_test: {
        id: "enemy_test",
        level: 0,
        name: "測試",
        code: null,
        moveSpeed: 1,
        motion: route.motionMode,
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

function only(l: Level) {
  const [individual] = buildTimeline(l).individuals;
  return individual!;
}

describe("movement model: ground follows the nextNode chain", () => {
  // A wall between start and end: the way round is up, across, down (4 cells).
  const uTurn = ["...", ".#."];
  const across = { start: { row: 0, col: 0 }, end: { row: 0, col: 2 } };

  it("walks round a wall cell by cell at constant speed", () => {
    const enemy = only(level(uTurn, { motionMode: "WALK", ...across, allowDiagonalMove: false }));
    expect(enemy.leakTime).toBe(4);
    expect(enemy.stateAt(0.5)).toMatchObject({ position: { x: 0, y: 0.5 } });
    expect(enemy.stateAt(2)).toMatchObject({ position: { x: 1, y: 1 } });
    expect(enemy.stateAt(3.5)).toMatchObject({ position: { x: 2, y: 0.5 } });
  });

  it("cuts corners where diagonal moves are allowed and the line of sight is clear", () => {
    // Bottom-left (0,0) to top-right (1,2) on an open 3 x 2 map: one straight diagonal.
    const enemy = only(
      level(["...", "..."], {
        motionMode: "WALK",
        start: { row: 0, col: 0 },
        end: { row: 1, col: 2 },
        allowDiagonalMove: true,
      }),
    );
    expect(enemy.leakTime).toBeCloseTo(Math.sqrt(5));
  });

  it("flies straight over the wall", () => {
    const enemy = only(level(uTurn, { motionMode: "FLY", ...across, allowDiagonalMove: false }));
    expect(enemy.leakTime).toBe(2);
    expect(enemy.stateAt(1)).toMatchObject({ position: { x: 1, y: 0 } });
  });

  it("never leaks when no way leads to the end", () => {
    const enemy = only(
      level([".#.", ".#."], { motionMode: "WALK", ...across, allowDiagonalMove: true }),
    );
    expect(enemy.leakTime).toBeNull();
    expect(enemy.stateAt(100)).toMatchObject({ kind: "onField", position: { x: 0, y: 0 } });
  });
});

/** A checkpoint at `cell`; `time` is the wait for the WAIT types. */
function cp(type: string, cell: Cell = { row: 0, col: 0 }, time = 0, reachOffset = { x: 0, y: 0 }) {
  return { type, time, position: cell, reachOffset, reachDistance: 0 } satisfies Checkpoint;
}

function expectAt(state: IndividualState, x: number, y: number, invisible = false) {
  expect(state.kind).toBe("onField");
  if (state.kind !== "onField") return;
  expect(state.position.x).toBeCloseTo(x, 4);
  expect(state.position.y).toBeCloseTo(y, 4);
  expect(state.invisible).toBe(invisible);
}

const p = (x: number, y: number) => ({ x, y });
const at = (x: number, y: number) => ({ kind: "onField", position: { x, y }, invisible: false });

describe("movement model: checkpoints", () => {
  const corridor = ["....."];
  const ground = { motionMode: "WALK", allowDiagonalMove: true } as const;

  it("straight line: spawn offset and a MOVE checkpoint's reach offset move the points", () => {
    const enemy = only(
      level(corridor, {
        ...ground,
        start: { row: 0, col: 0 },
        end: { row: 0, col: 4 },
        spawnOffset: { x: 0, y: 0.3 },
        checkpoints: [cp("MOVE", { row: 0, col: 2 }, 0, { x: 0, y: -0.3 }), cp("ALERT")],
      }),
    );
    // (0, 0.3) -> (2, -0.3) -> (4, 0): hypot(2, 0.6) + hypot(2, 0.3) cells at 1 cell/s.
    expect(enemy.stateAt(0)).toEqual(at(0, 0.3));
    expectAt(enemy.stateAt(2.08806), 2, -0.3);
    expect(enemy.leakTime).toBeCloseTo(2.08806 + 2.02237, 4);
  });

  it("one turn: a MOVE checkpoint off the straight way bends the path there", () => {
    // Open 3 x 2 map: straight along the bottom row would be 2 cells; via (1,1) it is two
    // diagonals of sqrt(2).
    const enemy = only(
      level(["...", "..."], {
        ...ground,
        start: { row: 0, col: 0 },
        end: { row: 0, col: 2 },
        checkpoints: [cp("MOVE", { row: 1, col: 1 })],
      }),
    );
    expectAt(enemy.stateAt(Math.SQRT2 / 2), 0.5, 0.5);
    expectAt(enemy.stateAt(Math.SQRT2), 1, 1);
    expectAt(enemy.stateAt(Math.SQRT2 * 1.5), 1.5, 0.5);
    expect(enemy.leakTime).toBeCloseTo(2 * Math.SQRT2);
  });

  const straight = { ...ground, start: { row: 0, col: 0 }, end: { row: 0, col: 4 } };
  const halfway = { row: 0, col: 2 };

  it("one wait: WAIT_FOR_SECONDS stands still for that long", () => {
    const enemy = only(
      level(corridor, {
        ...straight,
        checkpoints: [cp("MOVE", halfway), cp("WAIT_FOR_SECONDS", halfway, 3)],
      }),
    );
    expect(enemy.stateAt(1)).toEqual(at(1, 0));
    expect(enemy.stateAt(2)).toEqual(at(2, 0));
    expect(enemy.stateAt(4.9)).toEqual(at(2, 0));
    expect(enemy.stateAt(6)).toEqual(at(3, 0));
    expect(enemy.leakTime).toBe(7);
  });

  it("WAIT_CURRENT_WAVE_TIME stands still until that second of the wave, if not yet past", () => {
    const route = (time: number) => ({
      ...straight,
      checkpoints: [cp("MOVE", halfway), cp("WAIT_CURRENT_WAVE_TIME", halfway, time)],
    });
    // Spawns at 1 s, reaches (2, 0) at 3 s.
    expect(only(level(corridor, route(10), { spawnDelay: 1 })).leakTime).toBe(12);
    expect(only(level(corridor, route(2), { spawnDelay: 1 })).leakTime).toBe(5);
  });

  it("WAIT_CURRENT_FRAGMENT_TIME stands still until that second after the fragment start", () => {
    // The fragment starts at 4 s, the individual spawns at 5 s and reaches (2, 0) at 7 s.
    const enemy = only(
      level(
        corridor,
        {
          ...straight,
          checkpoints: [cp("MOVE", halfway), cp("WAIT_CURRENT_FRAGMENT_TIME", halfway, 6)],
        },
        { fragmentDelay: 4, spawnDelay: 1 },
      ),
    );
    expect(enemy.stateAt(9)).toEqual(at(2, 0));
    expect(enemy.leakTime).toBe(12);
  });

  describe("disappear / appear", () => {
    const l = level(corridor, {
      ...straight,
      checkpoints: [
        cp("MOVE", { row: 0, col: 1 }),
        cp("DISAPPEAR"),
        cp("WAIT_FOR_SECONDS", { row: 0, col: 0 }, 2),
        cp("APPEAR_AT_POS", { row: 0, col: 3 }),
      ],
    });
    const enemy = only(l);

    it("hides where it disappears and shows up at once where it appears", () => {
      expect(enemy.stateAt(0.5)).toEqual(at(0.5, 0));
      expectAt(enemy.stateAt(1), 1, 0, true);
      expectAt(enemy.stateAt(2.9), 1, 0, true);
      expect(enemy.stateAt(3)).toEqual(at(3, 0));
      expect(enemy.stateAt(3.5)).toEqual(at(3.5, 0));
      expect(enemy.leakTime).toBe(4);
    });

    it("counts an invisible individual as on field", () => {
      expect(takeSnapshot(buildTimeline(l), 2).counts).toEqual({
        pending: 0,
        onField: 1,
        leaked: 0,
      });
    });

    it("draws the path as walk, wait, teleport, walk", () => {
      expect(enemy.path).toEqual([
        { kind: "move", start: 0, end: 1, points: [p(0, 0), p(1, 0)], invisible: false },
        { kind: "wait", start: 1, end: 3, position: p(1, 0), invisible: true },
        { kind: "teleport", start: 3, end: 3, from: p(1, 0), to: p(3, 0), invisible: false },
        { kind: "move", start: 3, end: 4, points: [p(3, 0), p(4, 0)], invisible: false },
      ]);
    });
  });

  describe("patrol", () => {
    // Spawns at (1, 0), then (3, 0) <-> (0, 0) forever: 2 s out, then 3 s each way.
    const enemy = only(
      level(["...."], {
        ...ground,
        start: { row: 0, col: 1 },
        end: { row: 0, col: 3 },
        checkpoints: [cp("PATROL_MOVE", { row: 0, col: 3 }), cp("PATROL_MOVE", { row: 0, col: 0 })],
      }),
    );

    it("loops from the last checkpoint back to the first and never leaks", () => {
      expect(enemy.leakTime).toBeNull();
      expect(enemy.stateAt(2)).toEqual(at(3, 0));
      expect(enemy.stateAt(5)).toEqual(at(0, 0));
      expect(enemy.stateAt(6.5)).toEqual(at(1.5, 0));
      // 995 s after reaching (0, 0) at 5 s: 165 laps of 6 s, then 5 s into the next.
      expect(enemy.stateAt(1000)).toEqual(at(1, 0));
    });

    it("draws the first lap and the walk back to the first checkpoint", () => {
      expect(enemy.path.map((leg) => [leg.kind, leg.start, leg.end])).toEqual([
        ["move", 0, 2],
        ["move", 2, 5],
        ["move", 5, 8],
      ]);
    });
  });

  it("skips a MOVE checkpoint it has no way to", () => {
    const enemy = only(
      level(["..#.."], {
        ...ground,
        start: { row: 0, col: 0 },
        end: { row: 0, col: 1 },
        checkpoints: [cp("MOVE", { row: 0, col: 4 })],
      }),
    );
    expect(enemy.leakTime).toBe(1);
  });
});

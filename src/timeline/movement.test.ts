// Seam 1: level model -> baseline timeline. Ground individuals follow the nextNode chain.
import { describe, expect, it } from "vitest";
import type {
  Cell,
  Checkpoint,
  CheckpointType,
  Device,
  DeviceIndex,
  Level,
  MotionMode,
  Tile,
  Vec2,
} from "../level/index.ts";
import {
  buildTimeline,
  takeSnapshot,
  type Individual,
  type IndividualState,
  type Stay,
  type TimelineOptions,
} from "./index.ts";

const road: Tile = {
  tileKey: "tile_road",
  heightType: "LOWLAND",
  passableMask: "ALL",
  buildableType: "MELEE",
};
const wall: Tile = { ...road, tileKey: "tile_wall", passableMask: "FLY_ONLY" };
const hole: Tile = { ...road, tileKey: "tile_hole", buildableType: "NONE" };

const tileOf: Record<string, Tile> = { "#": wall, O: hole, X: wall, Q: hole };

function blocker(cell: Cell): Device {
  const alias = `trap_027_stone#${cell.row},${cell.col}`;
  return {
    alias,
    key: "trap_027_stone",
    cell,
    direction: "UP",
    hidden: false,
    blocker: true,
    name: "碎石",
    description: null,
    image: null,
    effectCells: [],
  };
}

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

function level(rows: string[], route: TestRoute, timing: TestTiming = {}): Level {
  const bottomUp = [...rows].reverse();
  const devices = bottomUp.flatMap((line, row) =>
    [...line].flatMap((ch, col) => ("BXQ".includes(ch) ? [blocker({ row, col })] : [])),
  );
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
      tiles: bottomUp.flatMap((row) => [...row].map((ch) => tileOf[ch] ?? road)),
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
    branches: [],
    devices,
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
        magicResistance: 0,
        baseAttackTime: 0,
        attackSpeed: 100,
        rangeRadius: 0,
        massLevel: 0,
        lifePointReduce: 1,
        notCountInTotal: false,
        avatar: null,
      },
    },
  };
}

function only(l: Level, options: TimelineOptions = {}) {
  const [individual] = buildTimeline(l, options).individuals;
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

  it("剩下的路徑 starts where the individual is and drops the corners it has passed", () => {
    const enemy = only(level(uTurn, { motionMode: "WALK", ...across, allowDiagonalMove: false }));
    // (0, 0) -> (0, 1) -> (2, 1) -> (2, 0); at 1.5 s it is a quarter of the way across.
    expect(enemy.remainingPathAt(1.5)).toEqual([
      {
        kind: "move",
        start: 1.5,
        end: 4,
        points: [
          { x: 0.5, y: 1 },
          { x: 2, y: 1 },
          { x: 2, y: 0 },
        ],
        invisible: false,
      },
    ]);
  });
});

/** A checkpoint at `cell`; `time` is the wait for the WAIT types. */
function cp(
  type: CheckpointType,
  cell: Cell = { row: 0, col: 0 },
  time = 0,
  reachOffset = { x: 0, y: 0 },
) {
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
const at = (x: number, y: number, stay: Stay | null = null) => ({
  kind: "onField",
  position: { x, y },
  invisible: false,
  stay,
});

/** Each leg of `individual`'s 路徑 left at `t` as kind, start, end, then a walk's corner points. */
const legsAt = (individual: Individual, t: number) =>
  individual
    .remainingPathAt(t)
    .map((leg) => [leg.kind, leg.start, leg.end, ...(leg.kind === "move" ? leg.points : [])]);

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
        checkpoints: [cp("MOVE", { row: 0, col: 2 }, 0, { x: 0, y: -0.3 }), cp("UNKNOWN_7")],
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
    expect(enemy.stateAt(2)).toEqual(at(2, 0, { start: 2, end: 5 }));
    expect(enemy.stateAt(4.9)).toEqual(at(2, 0, { start: 2, end: 5 }));
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
    expect(enemy.stateAt(9)).toEqual(at(2, 0, { start: 7, end: 10 }));
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
      expect(enemy.remainingPathAt(0)).toEqual([
        { kind: "move", start: 0, end: 1, points: [p(0, 0), p(1, 0)], invisible: false },
        { kind: "wait", start: 1, end: 3, position: p(1, 0), invisible: true },
        { kind: "teleport", start: 3, end: 3, from: p(1, 0), to: p(3, 0), invisible: false },
        { kind: "move", start: 3, end: 4, points: [p(3, 0), p(4, 0)], invisible: false },
      ]);
    });
  });

  describe("剩下的路徑", () => {
    // Spawns at 1 s: (1, 0) at 2 s, hides and waits until 4 s, appears at (3, 0), leaks at 5 s.
    const enemy = only(
      level(
        corridor,
        {
          ...straight,
          checkpoints: [
            cp("MOVE", { row: 0, col: 1 }),
            cp("DISAPPEAR"),
            cp("WAIT_FOR_SECONDS", { row: 0, col: 0 }, 2),
            cp("APPEAR_AT_POS", { row: 0, col: 3 }),
          ],
        },
        { spawnDelay: 1 },
      ),
    );
    const whole = [
      { kind: "move", start: 1, end: 2, points: [p(0, 0), p(1, 0)], invisible: false },
      { kind: "wait", start: 2, end: 4, position: p(1, 0), invisible: true },
      { kind: "teleport", start: 4, end: 4, from: p(1, 0), to: p(3, 0), invisible: false },
      { kind: "move", start: 4, end: 5, points: [p(3, 0), p(4, 0)], invisible: false },
    ];

    it("is empty before the individual spawns", () => {
      expect(enemy.remainingPathAt(0)).toEqual([]);
      expect(enemy.remainingPathAt(0.9)).toEqual([]);
    });

    it("is the whole path at the 出生時刻", () => {
      expect(enemy.remainingPathAt(1)).toEqual(whole);
    });

    const [, wait, teleport, lastWalk] = whole;

    it("cuts the walk it is on at where it is", () => {
      expect(enemy.remainingPathAt(1.5)).toEqual([
        { kind: "move", start: 1.5, end: 2, points: [p(0.5, 0), p(1, 0)], invisible: false },
        wait,
        teleport,
        lastWalk,
      ]);
    });

    it("keeps the whole wait it is in, hidden or not, and drops it once over", () => {
      expect(enemy.remainingPathAt(2)).toEqual([wait, teleport, lastWalk]);
      expect(enemy.remainingPathAt(3.9)).toEqual([wait, teleport, lastWalk]);
      expect(enemy.remainingPathAt(4)).not.toContainEqual(wait);
    });

    it("drops the teleport from the second it happens", () => {
      expect(enemy.remainingPathAt(4)).toEqual([lastWalk]);
    });

    it("is empty from the second it reaches the end point", () => {
      expect(enemy.remainingPathAt(5)).toEqual([]);
      expect(enemy.remainingPathAt(6)).toEqual([]);
    });

    it("is empty once it stands at the end of its walk with no way to the end point", () => {
      // Walks to (1, 0) by 1 s; the wall cuts it off from the end point, so it stays there.
      const stuck = only(
        level(["..#."], {
          ...ground,
          start: { row: 0, col: 0 },
          end: { row: 0, col: 3 },
          checkpoints: [cp("MOVE", { row: 0, col: 1 })],
        }),
      );
      expect(stuck.leakTime).toBeNull();
      expect(stuck.remainingPathAt(0.5)).toEqual([
        { kind: "move", start: 0.5, end: 1, points: [p(0.5, 0), p(1, 0)], invisible: false },
      ]);
      expect(stuck.remainingPathAt(1)).toEqual([]);
      expect(stuck.remainingPathAt(100)).toEqual([]);
    });

    it("is each individual's own when one action spawns several", () => {
      // Two from one action, 1 s apart: at 1.5 s the first is 1.5 cells in, the second 0.5.
      const l = level(corridor, straight);
      const action = l.waves[0]!.fragments[0]!.actions[0]!;
      Object.assign(action, { count: 2, interval: 1 });
      const [first, second] = buildTimeline(l).individuals;
      expect(first!.remainingPathAt(1.5)[0]).toMatchObject({
        start: 1.5,
        end: 4,
        points: [p(1.5, 0), p(4, 0)],
      });
      expect(second!.remainingPathAt(1.5)[0]).toMatchObject({
        start: 1.5,
        end: 5,
        points: [p(0.5, 0), p(4, 0)],
      });
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

    it("draws the first lap up to the last checkpoint at the 出生時刻", () => {
      expect(legsAt(enemy, 0)).toEqual([
        ["move", 0, 2, p(1, 0), p(3, 0)],
        ["move", 2, 5, p(3, 0), p(0, 0)],
      ]);
    });

    it("cuts the first lap where it is, still up to the last checkpoint", () => {
      expect(legsAt(enemy, 1.5)).toEqual([
        ["move", 1.5, 2, p(2.5, 0), p(3, 0)],
        ["move", 2, 5, p(3, 0), p(0, 0)],
      ]);
      expect(legsAt(enemy, 3)).toEqual([["move", 3, 5, p(2, 0), p(0, 0)]]);
    });

    it("draws the whole next lap, from the last checkpoint back round, once a lap is done", () => {
      expect(legsAt(enemy, 5)).toEqual([
        ["move", 5, 8, p(0, 0), p(3, 0)],
        ["move", 8, 11, p(3, 0), p(0, 0)],
      ]);
    });

    it("cuts a later lap where it is, up to that lap's end", () => {
      expect(legsAt(enemy, 9)).toEqual([["move", 9, 11, p(2, 0), p(0, 0)]]);
    });

    it("keeps to the lap it is on far later", () => {
      // Lap 166 runs from 995 s to 1001 s.
      expect(legsAt(enemy, 995)).toEqual([
        ["move", 995, 998, p(0, 0), p(3, 0)],
        ["move", 998, 1001, p(3, 0), p(0, 0)],
      ]);
      expect(legsAt(enemy, 1000)).toEqual([["move", 1000, 1001, p(1, 0), p(0, 0)]]);
    });

    it("opens each lap with the wait when the first checkpoint is one", () => {
      // Like RM-2's patrols. Spawns at (1, 0): waits until 1 s, (3, 0) at 3 s, waits until
      // 4 s, (0, 0) at 7 s; then laps of 8 s that start with the wait at (0, 0).
      const waitFirst = only(
        level(["...."], {
          ...ground,
          start: { row: 0, col: 1 },
          end: { row: 0, col: 3 },
          checkpoints: [
            cp("WAIT_FOR_SECONDS", { row: 0, col: 0 }, 1),
            cp("PATROL_MOVE", { row: 0, col: 3 }),
            cp("WAIT_FOR_SECONDS", { row: 0, col: 0 }, 1),
            cp("PATROL_MOVE", { row: 0, col: 0 }),
          ],
        }),
      );
      expect(legsAt(waitFirst, 0)).toEqual([
        ["wait", 0, 1],
        ["move", 1, 3, p(1, 0), p(3, 0)],
        ["wait", 3, 4],
        ["move", 4, 7, p(3, 0), p(0, 0)],
      ]);
      const secondLap = [
        ["wait", 7, 8],
        ["move", 8, 11, p(0, 0), p(3, 0)],
        ["wait", 11, 12],
        ["move", 12, 15, p(3, 0), p(0, 0)],
      ];
      expect(legsAt(waitFirst, 7)).toEqual(secondLap);
      expect(legsAt(waitFirst, 7.5)).toEqual(secondLap);
      expect(legsAt(waitFirst, 13)).toEqual([["move", 13, 15, p(2, 0), p(0, 0)]]);
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

describe("時刻快照: 目前的停留", () => {
  const corridor = ["....."];
  const straight = {
    motionMode: "WALK",
    allowDiagonalMove: true,
    start: { row: 0, col: 0 },
    end: { row: 0, col: 4 },
  } as const;
  const halfway = { row: 0, col: 2 };
  const stayAt = (l: Level, t: number) => takeSnapshot(buildTimeline(l), t).onField[0]?.stay;

  // Reaches (2, 0) at 2 s, stands there until 5 s, leaks at 7 s.
  const waitThree = level(corridor, {
    ...straight,
    checkpoints: [cp("MOVE", halfway), cp("WAIT_FOR_SECONDS", halfway, 3)],
  });

  it("is empty a second before the stay, carries its start and end during it, empty after", () => {
    expect(stayAt(waitThree, 1)).toBeNull();
    expect(stayAt(waitThree, 2)).toEqual({ start: 2, end: 5 });
    expect(stayAt(waitThree, 4)).toEqual({ start: 2, end: 5 });
    expect(stayAt(waitThree, 5)).toBeNull();
    expect(stayAt(waitThree, 6)).toBeNull();
  });

  it("waiting until a second of the wave or the fragment has the same shape", () => {
    const untilWave = level(corridor, {
      ...straight,
      checkpoints: [cp("MOVE", halfway), cp("WAIT_CURRENT_WAVE_TIME", halfway, 5)],
    });
    // The fragment starts at 1 s and the individual spawns then, reaching (2, 0) at 3 s.
    const untilFragment = level(
      corridor,
      {
        ...straight,
        checkpoints: [cp("MOVE", halfway), cp("WAIT_CURRENT_FRAGMENT_TIME", halfway, 6)],
      },
      { fragmentDelay: 1 },
    );
    expect(stayAt(untilWave, 3)).toEqual({ start: 2, end: 5 });
    expect(stayAt(untilFragment, 4)).toEqual({ start: 3, end: 7 });
  });

  it("is empty while the individual waits hidden", () => {
    const hidden = level(corridor, {
      ...straight,
      checkpoints: [
        cp("MOVE", { row: 0, col: 1 }),
        cp("DISAPPEAR"),
        cp("WAIT_FOR_SECONDS", { row: 0, col: 0 }, 2),
        cp("APPEAR_AT_POS", { row: 0, col: 3 }),
      ],
    });
    expect(takeSnapshot(buildTimeline(hidden), 2).onField[0]).toMatchObject({
      invisible: true,
      stay: null,
    });
  });

  it("covers a pause on a patrol's later laps", () => {
    // Spawns at (1, 0): (3, 0) at 2 s, waits until 3 s, (0, 0) at 6 s; then laps of 7 s.
    const patrol = level(["...."], {
      motionMode: "WALK",
      allowDiagonalMove: true,
      start: { row: 0, col: 1 },
      end: { row: 0, col: 3 },
      checkpoints: [
        cp("PATROL_MOVE", { row: 0, col: 3 }),
        cp("WAIT_FOR_SECONDS", { row: 0, col: 3 }, 1),
        cp("PATROL_MOVE", { row: 0, col: 0 }),
      ],
    });
    expect(stayAt(patrol, 2.5)).toEqual({ start: 2, end: 3 });
    // Second lap: (3, 0) at 9 s, waits until 10 s.
    expect(stayAt(patrol, 9.5)).toEqual({ start: 9, end: 10 });
  });
});

describe("movement model: 擋路裝置", () => {
  const across = (end: number) => ({ start: { row: 0, col: 0 }, end: { row: 0, col: end } });

  it("crosses a 擋路格 rather than a hole when the way round is longer, at constant speed", () => {
    const enemy = only(
      level(["..B..", ".###.", "..O.."], {
        motionMode: "WALK",
        ...across(4),
        allowDiagonalMove: false,
      }),
    );
    expect(enemy.leakTime).toBe(8);
    expectAt(enemy.stateAt(4), 2, 2);
  });

  it("a 擋路裝置 in a hole leaves it a hole", () => {
    const enemy = only(
      level(["..B..", ".###.", "..Q.."], {
        motionMode: "WALK",
        ...across(4),
        allowDiagonalMove: false,
      }),
    );
    expect(enemy.leakTime).toBe(8);
  });

  it("a 擋路格 blocks the line of sight that smooths corners", () => {
    const enemy = only(
      level(["...", ".B.", "..."], {
        motionMode: "WALK",
        start: { row: 0, col: 0 },
        end: { row: 2, col: 2 },
        allowDiagonalMove: true,
      }),
    );
    expect(enemy.leakTime).toBe(4);
  });

  it("a 擋路裝置 on a wall leaves the way as it was: still none", () => {
    const route = { motionMode: "WALK" as const, ...across(2), allowDiagonalMove: false };
    const withDevice = only(level([".X."], route));
    expect(withDevice.leakTime).toBeNull();
    expect(withDevice.stateAt(100)).toEqual(only(level([".#."], route)).stateAt(100));
  });

  it("flying routes fly straight over a 擋路格", () => {
    const enemy = only(
      level([".B."], { motionMode: "FLY", ...across(2), allowDiagonalMove: false }),
    );
    expect(enemy.leakTime).toBe(2);
    expect(enemy.stateAt(1)).toMatchObject({ position: { x: 1, y: 0 } });
  });
});

describe("movement model: 移除時刻 re-routes ground individuals", () => {
  const ring = [".....", ".###.", ".###.", "..B.."];
  const across = {
    motionMode: "WALK",
    start: { row: 0, col: 0 },
    end: { row: 0, col: 4 },
    allowDiagonalMove: false,
  } as const;
  const removedAt = (t: number): TimelineOptions => ({
    removals: new Map([[0 as DeviceIndex, { wave: 0, t }]]),
  });

  it("keeps the individual where it was until the 移除時刻", () => {
    const kept = only(level(ring, across));
    const removed = only(level(ring, across), removedAt(1));
    expect(kept.leakTime).toBe(10);
    for (const t of [0, 0.5, 1]) expect(removed.stateAt(t)).toEqual(kept.stateAt(t));
  });

  it("turns back from where it is at the 移除時刻 and takes the opened way", () => {
    const enemy = only(level(ring, across), removedAt(1));
    expectAt(enemy.stateAt(1.5), 0, 0.5);
    expectAt(enemy.stateAt(3), 1, 0);
    expect(enemy.leakTime).toBe(6);
  });

  it("draws the old path up to the 移除時刻 joined to the new one, as one walk", () => {
    const enemy = only(level(ring, across), removedAt(1));
    expect(legsAt(enemy, 0)).toEqual([["move", 0, 6, p(0, 0), p(0, 1), p(0, 0), p(4, 0)]]);
  });

  it("an individual waiting at the 移除時刻 walks the new way once the wait is over", () => {
    const waiting = { ...across, checkpoints: [cp("WAIT_FOR_SECONDS", across.start, 3)] };
    expect(only(level(ring, waiting)).leakTime).toBe(13);
    const enemy = only(level(ring, waiting), removedAt(1));
    expect(enemy.stateAt(2)).toEqual(at(0, 0, { start: 0, end: 3 }));
    expectAt(enemy.stateAt(4), 1, 0);
    expect(enemy.leakTime).toBe(7);
  });

  it("a patrol takes the new way on the walk after the 移除時刻", () => {
    const patrol = {
      ...across,
      checkpoints: [cp("PATROL_MOVE", { row: 0, col: 4 }), cp("PATROL_MOVE", { row: 0, col: 0 })],
    };
    const enemy = only(level(ring, patrol), removedAt(10));
    expectAt(enemy.stateAt(5), 2, 3);
    expectAt(enemy.stateAt(12), 2, 0);
    expectAt(enemy.stateAt(16), 2, 0);
    expect(legsAt(enemy, 14)).toEqual([
      ["move", 14, 18, p(0, 0), p(4, 0)],
      ["move", 18, 22, p(4, 0), p(0, 0)],
    ]);
  });

  it("flying routes are as they were", () => {
    const fly = { ...across, motionMode: "FLY" } as const;
    expect(only(level(ring, fly), removedAt(1)).remainingPathAt(0)).toEqual(
      only(level(ring, fly)).remainingPathAt(0),
    );
  });
});

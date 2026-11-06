// Seam 1: level model -> baseline timeline. Ground individuals follow the nextNode chain.
import { describe, expect, it } from "vitest";
import type { Cell, Level, MotionMode, Tile } from "../level/index.ts";
import { buildTimeline } from "./index.ts";

const road: Tile = {
  tileKey: "tile_road",
  heightType: "LOWLAND",
  passableMask: "ALL",
  buildableType: "MELEE",
};
const wall: Tile = { ...road, tileKey: "tile_wall", passableMask: "FLY_ONLY" };

/** One enemy at 1 cell/s, spawning at 0 s, on a map drawn top row first ("#" = wall). */
function level(
  rows: string[],
  route: { motionMode: MotionMode; start: Cell; end: Cell; allowDiagonalMove: boolean },
): Level {
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
    map: {
      width: bottomUp[0]!.length,
      height: bottomUp.length,
      tiles: bottomUp.flatMap((row) => [...row].map((ch) => (ch === "#" ? wall : road))),
    },
    routes: [
      {
        ...route,
        spawnOffset: { x: 0, y: 0 },
        checkpoints: [],
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
            preDelay: 0,
            actions: [
              {
                actionType: "SPAWN",
                key: "enemy_test",
                count: 1,
                preDelay: 0,
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

// Seam 1: level model + 開關狀態 -> 出生點 and 消失點 of one wave's timeline.
import { describe, expect, it } from "vitest";
import { loadFixtureLevel } from "../../test-fixtures/load.ts";
import {
  cellKey,
  type Checkpoint,
  type CheckpointType,
  type Level,
  type Route,
  type Tile,
} from "../level/index.ts";
import {
  actionKey,
  buildTimeline,
  endpointKey,
  endpointRows,
  matchesEndpoint,
  routeEndpoints,
  spawnTable,
  type EndpointKind,
  type RouteEndpoint,
  type SpawnSwitches,
  type Timeline,
} from "./index.ts";

/** "row,col" of each cell with an endpoint of `kind`. */
const cellsOf = (timeline: Timeline, kind: EndpointKind) =>
  routeEndpoints(timeline)
    .filter((e) => e.kind === kind)
    .map((e) => cellKey(e.cell))
    .sort();

describe("出生點 and 消失點", () => {
  it("1-7: enemies come out of the three right-hand cells and all leave at (3, 0)", () => {
    const timeline = buildTimeline(loadFixtureLevel("level_main_01-07"));
    expect(cellsOf(timeline, "spawn")).toEqual(["1,10", "3,10", "5,10"]);
    expect(cellsOf(timeline, "exit")).toEqual(["3,0"]);
  });

  it("15-13: switching 隱藏組 group1 on adds its 出生點 (3, 2) and (3, 8)", () => {
    const level = loadFixtureLevel("level_main_15-12");
    const off = cellsOf(buildTimeline(level), "spawn");
    const on = cellsOf(
      buildTimeline(level, { switches: { hiddenOn: ["group1", "group2"] } }),
      "spawn",
    );
    expect(off).not.toContain("3,2");
    expect(off).not.toContain("3,8");
    expect(on).toEqual([...off, "3,2", "3,8"].sort());
  });

  describe("ro2_n_2_6 第 2 波: the 隨機出兵組's pick decides the thief's 出生點", () => {
    // The default candidate is empty; candidates 1 and 2 come out at (1, 0), 3 and 4 at (1, 7),
    // all leaving at (7, 4).
    const level = loadFixtureLevel("level_rogue2_2-6");
    const timelineOf = (pick: number) =>
      buildTimeline(level, { waveIndex: 1, switches: { picks: { 2: pick } } });

    it("filtering by (1, 0) lists the picked thief's row only, not the other candidate there", () => {
      const switches = { picks: { 2: 1 } };
      const spawn = endpointAt(routeEndpoints(timelineOf(1)), "spawn", "1,0");
      const rows = endpointRows(spawnTable(level, { switches }), 1, spawn);
      expect(rows.map((r) => [r.waveIndex, r.random?.candidate])).toEqual([[1, 1]]);
    });

    it("the empty default draws no point; each thief its own", () => {
      expect(routeEndpoints(timelineOf(0))).toEqual([]);
      expect(cellsOf(timelineOf(1), "spawn")).toEqual(["1,0"]);
      expect(cellsOf(timelineOf(3), "spawn")).toEqual(["1,7"]);
      expect(cellsOf(timelineOf(3), "exit")).toEqual(["7,4"]);
    });
  });

  it("1-7: filtering by the 消失點 (3, 0) lists every row of the wave on screen", () => {
    const level = loadFixtureLevel("level_main_01-07");
    const rows = spawnTable(level);
    const exit = endpointAt(routeEndpoints(buildTimeline(level)), "exit", "3,0");
    const listed = endpointRows(rows, 0, exit);
    expect(listed.length).toBeGreaterThan(0);
    expect(listed).toEqual(rows.filter((r) => r.waveIndex === 0));
  });

  it("11-7: a 條件出兵 switched on adds its route's 出生點 (4, 10), naming its action", () => {
    const level = loadFixtureLevel("level_main_11-06");
    const on30 = { conditional: { 0: { wave: 0, t: 30 } } };
    expect(cellsOf(buildTimeline(level), "spawn")).not.toContain("4,10");
    const added = routeEndpoints(buildTimeline(level, { switches: on30 })).find(
      (e) => e.kind === "spawn" && e.cell.row === 4 && e.cell.col === 10,
    );
    expect(added?.actions).toEqual([{ branchIndex: 0, fragmentIndex: 0, actionIndex: 0 }]);
  });

  describe("the map and the spawn table filter the same individuals", () => {
    // Each fixture with the switches that put its 隱藏組, 條件出兵 or picked thief on screen.
    const cases: [string, SpawnSwitches][] = [
      ["level_main_01-07", {}],
      ["level_main_04-10", {}],
      ["level_main_15-12", { hiddenOn: ["group1", "group2"] }],
      ["level_main_11-06", { conditional: { 0: { wave: 0, t: 30 } } }],
      ["level_rogue2_2-6", { picks: { 2: 1 } }],
      ["level_rogue3_5-5", {}],
    ];
    it.each(cases)("%s: every endpoint of every wave", (fixture, switches) => {
      const level = loadFixtureLevel(fixture);
      const rows = spawnTable(level, { switches });
      level.waves.forEach((_, waveIndex) => {
        const timeline = buildTimeline(level, { waveIndex, switches });
        for (const endpoint of routeEndpoints(timeline)) {
          const fromMap = timeline.individuals
            .filter((individual) => matchesEndpoint(individual, endpoint))
            .map(actionKey);
          const fromTable = endpointRows(rows, waveIndex, endpoint).map(actionKey);
          expect(fromMap.length, `${endpointKey(endpoint)} matches someone`).toBeGreaterThan(0);
          expect(
            [...new Set(fromMap)].sort(),
            `wave ${waveIndex} ${endpointKey(endpoint)}`,
          ).toEqual([...fromTable].sort());
        }
      });
    });
  });

  describe("a walker through a 通道 and a patrol, on one row of eight cells", () => {
    // Action 0 walks (0, 0) -> (0, 7), vanishing into a 通道 at (0, 2) and coming out at (0, 5).
    // Action 1 spawns at (0, 6) and patrols (0, 6) <-> (0, 4) forever.
    const timeline = buildTimeline(
      corridorLevel([
        {
          start: { row: 0, col: 0 },
          end: { row: 0, col: 7 },
          checkpoints: [
            checkpoint("MOVE", 2),
            checkpoint("DISAPPEAR", 0),
            checkpoint("WAIT_FOR_SECONDS", 0, 2),
            checkpoint("APPEAR_AT_POS", 5),
          ],
        },
        {
          start: { row: 0, col: 6 },
          end: { row: 0, col: 6 },
          checkpoints: [checkpoint("PATROL_MOVE", 4), checkpoint("PATROL_MOVE", 6)],
        },
      ]),
    );

    it("the 通道's cells get neither a 出生點 nor a 消失點", () => {
      expect(cellsOf(timeline, "spawn")).toEqual(["0,0", "0,6"]);
      expect(cellsOf(timeline, "exit")).toEqual(["0,7"]);
    });

    it("a 出生點 matches only the individuals coming out of it, a 消失點 only those leaving at it", () => {
      const [walker, patrol] = timeline.individuals;
      const at = (kind: EndpointKind, col: number) => ({ kind, cell: { row: 0, col } });
      expect(matchesEndpoint(walker!, at("spawn", 0))).toBe(true);
      expect(matchesEndpoint(walker!, at("exit", 0))).toBe(false);
      expect(matchesEndpoint(walker!, at("exit", 7))).toBe(true);
      expect(matchesEndpoint(walker!, at("spawn", 7))).toBe(false);
      expect(matchesEndpoint(patrol!, at("spawn", 6))).toBe(true);
    });

    it("the patrol, ending its route where it started but never leaving, matches no 消失點", () => {
      const patrol = timeline.individuals[1]!;
      expect(matchesEndpoint(patrol, { kind: "exit", cell: patrol.route.end })).toBe(false);
    });

    it("the patrol, never leaving, has a 出生點 and no 消失點", () => {
      const ofPatrol = routeEndpoints(timeline).filter((e) =>
        e.actions.some((a) => a.actionIndex === 1),
      );
      expect(ofPatrol).toEqual([
        {
          kind: "spawn",
          cell: { row: 0, col: 6 },
          actions: [{ branchIndex: null, fragmentIndex: 0, actionIndex: 1 }],
        },
      ]);
    });
  });
});

function endpointAt(endpoints: RouteEndpoint[], kind: EndpointKind, cell: string): RouteEndpoint {
  const found = endpoints.find((e) => e.kind === kind && cellKey(e.cell) === cell);
  if (!found) throw new Error(`no ${kind} at ${cell}`);
  return found;
}

const road: Tile = {
  tileKey: "tile_road",
  heightType: "LOWLAND",
  passableMask: "ALL",
  buildableType: "MELEE",
};

function checkpoint(type: CheckpointType, col: number, time = 0): Checkpoint {
  return {
    type,
    time,
    position: { row: 0, col },
    reachOffset: { x: 0, y: 0 },
    reachDistance: 0,
  };
}

/** One row of eight road cells; action i spawns one walker at 1 cell/s on `routes[i]`. */
function corridorLevel(routes: Pick<Route, "start" | "end" | "checkpoints">[]): Level {
  return {
    levelId: "test/endpoints",
    options: {
      characterLimit: 8,
      maxLifePoint: 3,
      initialCost: 10,
      maxCost: 99,
      moveMultiplier: 1,
    },
    modifiers: [],
    map: { width: 8, height: 1, tiles: Array.from({ length: 8 }, () => road) },
    routes: routes.map((r) => ({
      ...r,
      motionMode: "WALK",
      spawnOffset: { x: 0, y: 0 },
      allowDiagonalMove: false,
      visitEveryTileCenter: false,
      visitEveryNodeCenter: false,
      visitEveryCheckPoint: false,
    })),
    extraRoutes: [],
    branches: [],
    devices: [],
    waves: [
      {
        preDelay: 0,
        postDelay: 0,
        timeLimit: null,
        fragments: [
          {
            preDelay: 0,
            actions: routes.map((_, routeIndex) => ({
              actionType: "SPAWN",
              key: "enemy_test",
              count: 1,
              preDelay: 0,
              interval: 0,
              routeIndex,
              hiddenGroup: null,
              randomSpawnGroupKey: null,
              randomSpawnGroupPackKey: null,
              weight: 0,
              harmless: false,
            })),
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

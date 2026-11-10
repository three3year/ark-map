// Seam 1: level model -> baseline timeline / snapshot.
import { describe, expect, it } from "vitest";
import { loadFixtureLevel } from "../../test-fixtures/load.ts";
import type { Device, Difficulty, Level, Modifier } from "../level/index.ts";
import { buildTimeline, takeSnapshot, type Individual, type Stay } from "./index.ts";

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

describe("難度修正: challenge (突襲) move speed", () => {
  // 4-4's FOUR_STAR ebuff_attribute has move_speed 2.
  const level = loadFixtureLevel("level_main_04-04");
  const normal = buildTimeline(level);
  const challenge = buildTimeline(level, { difficulty: "FOUR_STAR" });

  function distanceWalked(timeline: typeof normal, index: number, seconds: number): number {
    const individual = timeline.individuals[index]!;
    const from = individual.stateAt(individual.spawnTime);
    const to = individual.stateAt(individual.spawnTime + seconds);
    if (from.kind !== "onField" || to.kind !== "onField") throw new Error("not on the field");
    return Math.hypot(to.position.x - from.position.x, to.position.y - from.position.y);
  }

  it("4-4: in the same second a challenge enemy walks twice as far as a normal one", () => {
    expect(distanceWalked(normal, 0, 0.5)).toBeGreaterThan(0);
    expect(distanceWalked(challenge, 0, 0.5)).toBeCloseTo(2 * distanceWalked(normal, 0, 0.5), 9);
  });

  it("4-4: every challenge enemy spends half the time walking (waits stay as they are)", () => {
    const walkTimes = (t: typeof normal) =>
      t.individuals.map((i) =>
        i
          .remainingPathAt(i.spawnTime)
          .filter((leg) => leg.kind === "move")
          .reduce((s, leg) => s + leg.end - leg.start, 0),
      );
    expect(normal.individuals.length).toBeGreaterThan(0);
    walkTimes(challenge).forEach((time, i) =>
      expect(time).toBeCloseTo(walkTimes(normal)[i]! / 2, 9),
    );
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
  const at = (x: number, y: number, invisible = false, stay: Stay | null = null) => ({
    kind: "onField",
    position: { x, y },
    invisible,
    stay,
  });

  it("walks, waits, hides and reappears on schedule", () => {
    expect(frostNova.spawnTime).toBe(3);
    expect(frostNova.stateAt(7)).toEqual(at(1, 5));
    expect(frostNova.stateAt(20)).toEqual(at(2, 5, false, { start: 11, end: 31 }));
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
      actionType: "SPAWN" as const,
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
      modifiers: [],
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
      branches: [],
      devices: [],
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
      stay: null,
    });
    expect(enemy!.stateAt(4.5)).toEqual({
      kind: "onField",
      position: { x: 2.5, y: 0 },
      invisible: false,
      stay: null,
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
      stay: null,
    });
    expect(enemy!.leakTime).toBe(5.5);
  });

  it("clamps the attribute speed to at least 0.1", () => {
    const [enemy] = buildTimeline(corridor(0.01)).individuals; // 0.1 x 0.5 = 0.05 cells/s
    expect(enemy!.leakTime).toBe(2 + 4 / 0.05);
  });

  describe("難度修正 move speed", () => {
    /** The corridor with a second enemy, enemy_other, spawning alongside enemy_test. */
    function twoEnemies(modifiers: Modifier[]): Level {
      const level = corridor(2); // 1 cell/s: 4 s from start to end
      const actions = level.waves[0]!.fragments[0]!.actions;
      actions.push({ ...actions[0]!, key: "enemy_other" });
      level.enemies["enemy_other"] = { ...level.enemies["enemy_test"]!, id: "enemy_other" };
      level.modifiers = modifiers;
      return level;
    }
    const moveSpeed = (value: number) => ({ key: "move_speed", value, valueStr: null });
    const enemies = (key: string, ids: string) => ({ key, value: 0, valueStr: ids });
    /** Seconds each enemy takes to walk the corridor, by enemy id. */
    function walkTimes(level: Level, difficulty?: Difficulty): Record<string, number> {
      return Object.fromEntries(
        buildTimeline(level, { difficulty }).individuals.map((i) => [
          i.enemy.id,
          i.leakTime! - i.spawnTime,
        ]),
      );
    }

    it("a modifier naming an enemy speeds up only that enemy", () => {
      const level = twoEnemies([
        {
          difficulties: ["FOUR_STAR"],
          key: "enemy_attribute_mul",
          blackboard: [moveSpeed(2), enemies("enemy", "enemy_x|enemy_test")],
        },
      ]);
      expect(walkTimes(level, "FOUR_STAR")).toEqual({ enemy_test: 2, enemy_other: 4 });
    });

    it("a modifier excluding an enemy speeds up every other enemy", () => {
      const level = twoEnemies([
        {
          difficulties: ["FOUR_STAR"],
          key: "enemy_attribute_mul",
          blackboard: [moveSpeed(2), enemies("enemy_exclude", "enemy_test")],
        },
      ]);
      expect(walkTimes(level, "FOUR_STAR")).toEqual({ enemy_test: 4, enemy_other: 2 });
    });

    it("applies only the modifiers whose mask holds the variant's difficulty, multiplied", () => {
      const level = twoEnemies([
        { difficulties: ["FOUR_STAR"], key: "ebuff_attribute", blackboard: [moveSpeed(2)] },
        {
          difficulties: ["NORMAL", "FOUR_STAR", "SIX_STAR", "EASY"],
          key: "enemy_attribute_mul",
          blackboard: [moveSpeed(0.5)],
        },
      ]);
      expect(walkTimes(level)).toEqual({ enemy_test: 8, enemy_other: 8 });
      expect(walkTimes(level, "FOUR_STAR")).toEqual({ enemy_test: 4, enemy_other: 4 });
    });

    it("never applies other modifier keys, even with a move_speed entry", () => {
      const level = twoEnemies([
        { difficulties: ["NORMAL"], key: "env_gbuff_new", blackboard: [moveSpeed(2)] },
        { difficulties: ["NORMAL"], key: "some_new_key", blackboard: [moveSpeed(2)] },
      ]);
      expect(walkTimes(level)).toEqual({ enemy_test: 4, enemy_other: 4 });
    });
  });
});

describe("裝置 on the field", () => {
  const aliases = (devices: Device[]) => devices.map((d) => d.alias);

  it("TB-1: its 8 碎石 and 4 留聲機 are on the field all through the wave", () => {
    const level = loadFixtureLevel("level_act10mini_01");
    const timeline = buildTimeline(level);
    expect(timeline.devicesAt(0)).toHaveLength(12);
    expect(timeline.devicesAt(0).filter((d) => d.key === "trap_027_stone")).toHaveLength(8);
    expect(aliases(timeline.devicesAt(60))).toEqual(aliases(level.devices));
  });

  it("WR-EX-6: the 3 hidden 障礙物 stay off in normal; the challenge 難度修正 puts them on", () => {
    const level = loadFixtureLevel("level_act16d5_ex06");
    expect(buildTimeline(level).devicesAt(0)).toEqual([]);
    expect(aliases(buildTimeline(level, { difficulty: "FOUR_STAR" }).devicesAt(0))).toEqual([
      "trap_001_crate#2",
      "trap_001_crate#3",
      "trap_001_crate#4",
    ]);
  });

  it("5-10: hidden ballistae that only a 純機關 activates stay off the field", () => {
    const level = loadFixtureLevel("level_main_05-10");
    expect(level.devices).toHaveLength(10);
    expect(buildTimeline(level).devicesAt(0)).toEqual([]);
  });

  it("a level_predefines_enable entry of value 0 takes a device off in its variant only", () => {
    // 9-12 challenge, for one: trap_043_dupilr#2 and #5 are not hidden and get value 0.
    const level = loadFixtureLevel("level_act10mini_01");
    level.modifiers.push({
      difficulties: ["FOUR_STAR"],
      key: "level_predefines_enable",
      blackboard: [{ key: "trap_027_stone#1", value: 0, valueStr: null }],
    });
    expect(buildTimeline(level).devicesAt(0)).toHaveLength(12);
    const challenge = buildTimeline(level, { difficulty: "FOUR_STAR" }).devicesAt(0);
    expect(aliases(challenge)).not.toContain("trap_027_stone#1");
    expect(challenge).toHaveLength(11);
  });

  it("devices sharing an alias go on together", () => {
    const level = loadFixtureLevel("level_act16d5_ex06");
    level.devices[1]!.alias = "trap_001_crate#2";
    expect(buildTimeline(level, { difficulty: "FOUR_STAR" }).devicesAt(0)).toHaveLength(3);
    level.modifiers = level.modifiers.map((m) =>
      m.key === "level_predefines_enable"
        ? { ...m, blackboard: m.blackboard.filter((b) => b.key === "trap_001_crate#2") }
        : m,
    );
    expect(buildTimeline(level, { difficulty: "FOUR_STAR" }).devicesAt(0)).toHaveLength(2);
  });
});

describe("擋路裝置 change ground routes", () => {
  /** Each cell `individual` stands on, sampled every 0.05 s from its spawn until it leaks. */
  function cellsWalked(individual: Individual): Set<string> {
    const cells = new Set<string>();
    const end = individual.leakTime ?? individual.spawnTime + 300;
    for (let t = individual.spawnTime; t < end; t += 0.05) {
      const state = individual.stateAt(t);
      if (state.kind !== "onField") continue;
      cells.add(`${Math.round(state.position.y)},${Math.round(state.position.x)}`);
    }
    return cells;
  }
  const cellsOf = (devices: Device[]) => devices.map((d) => `${d.cell.row},${d.cell.col}`);

  it("TB-1: a route straight through the 碎石 goes round them while they are on the field", () => {
    const level = loadFixtureLevel("level_act10mini_01");
    // Route 19 runs (3,0) -> (3,10) across the band the 碎石 wall off at columns 4-5.
    const route = level.routes[19]!;
    const walker = (l: Level) => buildTimeline(l).individuals.find((i) => i.route === route)!;
    const stones = cellsOf(level.devices.filter((d) => d.key === "trap_027_stone"));

    const withStones = cellsWalked(walker(level));
    expect(stones.filter((c) => withStones.has(c))).toEqual([]);
    expect(withStones.has("6,4")).toBe(true); // the top corridor

    const withoutStones = cellsWalked(walker({ ...level, devices: [] }));
    expect(stones.filter((c) => withoutStones.has(c))).not.toEqual([]);
  });

  it("WR-EX-6: the hidden 障礙物 change routes only in the challenge, which puts them on", () => {
    const level = loadFixtureLevel("level_act16d5_ex06");
    const leakTimes = (l: Level, difficulty: Difficulty) =>
      Object.fromEntries(
        buildTimeline(l, { difficulty }).individuals.map((i) => [i.id, i.leakTime]),
      );
    const bare = { ...level, devices: [] };
    expect(leakTimes(level, "NORMAL")).toEqual(leakTimes(bare, "NORMAL"));
    const challenge = leakTimes(level, "FOUR_STAR");
    const bareChallenge = leakTimes(bare, "FOUR_STAR");
    // The first wave's route-2 individual goes round them: it leaks later.
    expect(challenge["0-2-0"]! > bareChallenge["0-2-0"]!).toBe(true);
  });

  it("ISW-NO: walled in by a full row of 碎石, the individual walks through them and leaks", () => {
    const level = loadFixtureLevel("level_rogue2_5-5");
    // Route 9 starts at (6,1) and its checkpoints walk the 碎石 row (7,1)..(7,9) to (7,10).
    const route = level.routes[9]!;
    const [walker] = level.waves.flatMap((_, waveIndex) =>
      buildTimeline(level, { waveIndex }).individuals.filter((i) => i.route === route),
    );
    expect(walker!.leakTime).not.toBeNull();
    const walked = cellsWalked(walker!);
    const stones = cellsOf(level.devices.filter((d) => d.key === "trap_027_stone"));
    expect(stones.filter((c) => !walked.has(c))).toEqual([]);
  });
});

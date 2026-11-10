import { describe, expect, it } from "vitest";
import { convertFixture, loadFixtureLevel, rawFixture } from "../../test-fixtures/load.ts";
import {
  buildTimeline,
  spawnPlan,
  spawnTable,
  switchMarkKinds,
  switchMarks,
  type ActionRef,
} from "./index.ts";
import type { Level } from "../level/index.ts";
import { thiefGroup } from "../../test-fixtures/rogue2_2-6.ts";

function hiddenGroupAction(level: Level, name: string): ActionRef {
  for (const [waveIndex, wave] of level.waves.entries()) {
    for (const [fragmentIndex, fragment] of wave.fragments.entries()) {
      const actionIndex = fragment.actions.findIndex((a) => a.hiddenGroup === name);
      if (actionIndex >= 0) return { branchIndex: null, waveIndex, fragmentIndex, actionIndex };
    }
  }
  throw new Error(`no action in ${name}`);
}

describe("隱藏組 marks: ro3_n_5_5", () => {
  const level = loadFixtureLevel("level_rogue3_5-5");
  const plan = spawnPlan(level, "NORMAL");
  const hiddenMarks = (name: string) =>
    switchMarks(level, plan, hiddenGroupAction(level, name)).filter(
      (m) => m.kind === "hiddenGroup",
    );

  it("numbers a group by its place in the 隱藏組 list, from 1", () => {
    expect(hiddenMarks("totem2")).toEqual([{ kind: "hiddenGroup", number: 1, name: "totem2" }]);
    expect(hiddenMarks("totem1")).toEqual([{ kind: "hiddenGroup", number: 2, name: "totem1" }]);
    expect(hiddenMarks("raid")).toEqual([{ kind: "hiddenGroup", number: 5, name: "raid" }]);
  });
});

describe("隨機出兵組 marks: ro2_n_2_6", () => {
  const level = loadFixtureLevel("level_rogue2_2-6");
  const plan = spawnPlan(level, "NORMAL");
  const candidateAction = (candidate: number) =>
    plan.groups.random[thiefGroup]!.candidates[candidate]!.actions[0]!;

  it("marks a candidate that is not picked with its group's number and its weight", () => {
    expect(switchMarks(level, plan, candidateAction(1))).toEqual([
      { kind: "random", number: 3, group: thiefGroup, candidate: 1, weight: 5, share: 5 / 105 },
    ]);
  });

  it("marks the default pick too", () => {
    expect(switchMarks(level, plan, candidateAction(0))).toEqual([
      { kind: "random", number: 3, group: thiefGroup, candidate: 0, weight: 85, share: 85 / 105 },
    ]);
  });
});

describe("隨機出兵組 marks: an action in two groups (ro3_n_5_5, edited)", () => {
  const raw = rawFixture("level_rogue3_5-5");
  const actions = raw.waves[0]!.fragments[10]!.actions;
  actions.push(
    { ...actions[0]!, randomSpawnGroupKey: "g2", randomSpawnGroupPackKey: "s1", weight: 30 },
    { ...actions[0]!, randomSpawnGroupKey: "g2", randomSpawnGroupPackKey: "s3", weight: 10 },
  );
  const level = convertFixture(raw);
  const plan = spawnPlan(level, "NORMAL");
  const at = (actionIndex: number): ActionRef => ({
    branchIndex: null,
    waveIndex: 0,
    fragmentIndex: 10,
    actionIndex,
  });
  const g1 = plan.groups.random.findIndex((g) => g.fragmentIndex === 10 && g.key === "g1");

  it("gives one mark per group, each with the weight of the action's candidate in it", () => {
    expect(plan.groups.random[g1 + 1]).toMatchObject({ fragmentIndex: 10, key: "g2" });
    expect(switchMarks(level, plan, at(3))).toEqual([
      { kind: "random", number: g1 + 1, group: g1, candidate: 0, weight: 100, share: 0.5 },
      { kind: "random", number: g1 + 2, group: g1 + 1, candidate: 0, weight: 30, share: 0.75 },
    ]);
  });

  it("an action in one group gets one mark", () => {
    expect(switchMarks(level, plan, at(2))).toEqual([
      { kind: "random", number: g1 + 1, group: g1, candidate: 1, weight: 100, share: 0.5 },
    ]);
  });
});

describe("條件出兵 marks", () => {
  it("number the 條件出兵 that spawn, in level-file order: 12-18's second branch is 2", () => {
    const level = loadFixtureLevel("level_main_12-18");
    const plan = spawnPlan(level, "NORMAL");
    expect(switchMarks(level, plan, { branchIndex: 1, fragmentIndex: 0, actionIndex: 0 })).toEqual([
      { kind: "conditional", number: 2, branchIndex: 1, key: level.branches[1]!.key },
    ]);
  });

  describe("act1dp_01 with its 純機關 listed first", () => {
    const raw = rawFixture("level_act1dp_01");
    const { fixed, sequence } = raw.branches!;
    raw.branches = { fixed: fixed!, sequence: sequence! };
    const level = convertFixture(raw);
    const plan = spawnPlan(level, "NORMAL");

    it("skips the 純機關: the spawning branch is 條件出兵 1; its 隱藏組 and 隨機出兵組 follow", () => {
      expect(level.branches.map((b) => [b.key, b.deviceOnly])).toEqual([
        ["fixed", true],
        ["sequence", false],
      ]);
      expect(
        switchMarks(level, plan, { branchIndex: 1, fragmentIndex: 0, actionIndex: 3 }),
      ).toEqual([
        { kind: "conditional", number: 1, branchIndex: 1, key: "sequence" },
        { kind: "hiddenGroup", number: 1, name: "random" },
        { kind: "random", number: 1, group: 0, candidate: 3, weight: 6, share: 6 / 14 },
      ]);
    });
  });
});

describe("spawn table rows", () => {
  it("carry their action's marks: act1dp_01's 條件出兵 rows", () => {
    const level = loadFixtureLevel("level_act1dp_01");
    const rows = spawnTable(level, {
      switches: { conditional: { 0: { wave: 0, t: 10 } }, hiddenOn: ["random"] },
    });
    expect(rows.map((r) => r.marks.map((m) => `${m.kind} ${m.number}`))).toEqual(
      Array.from({ length: 4 }, () => ["conditional 1", "hiddenGroup 1", "random 1"]),
    );
  });
});

describe("敵人個體", () => {
  const level = loadFixtureLevel("level_act1dp_01");
  const switches = { conditional: { 0: { wave: 0, t: 10 } }, hiddenOn: ["random"] };

  it("carry their action's marks: act1dp_01's 條件出兵 enemies", () => {
    const { individuals } = buildTimeline(level, { switches });
    expect(individuals.length).toBeGreaterThan(0);
    for (const individual of individuals) {
      expect(individual.marks.map((m) => `${m.kind} ${m.number}`)).toEqual([
        "conditional 1",
        "hiddenGroup 1",
        "random 1",
      ]);
    }
  });

  it("an enemy of no 開關 has no mark: ro2_n_2_6's 第 1 波", () => {
    const { individuals } = buildTimeline(loadFixtureLevel("level_rogue2_2-6"));
    expect(individuals.length).toBeGreaterThan(0);
    expect(individuals.every((i) => i.marks.length === 0)).toBe(true);
  });
});

describe("the wave's mark kinds, for the legend", () => {
  it("are every kind some enemy of the wave carries, in mark order", () => {
    const level = loadFixtureLevel("level_act1dp_01");
    const switches = { conditional: { 0: { wave: 0, t: 10 } }, hiddenOn: ["random"] };
    expect(switchMarkKinds(buildTimeline(level, { switches }))).toEqual([
      "conditional",
      "hiddenGroup",
      "random",
    ]);
  });

  it("leave out the kinds no enemy carries: ro3_n_5_5 has no 條件出兵 on", () => {
    const level = loadFixtureLevel("level_rogue3_5-5");
    expect(switchMarkKinds(buildTimeline(level))).toEqual(["hiddenGroup", "random"]);
  });

  it("are none when no enemy comes from a 開關: ro2_n_2_6's 第 1 波", () => {
    expect(switchMarkKinds(buildTimeline(loadFixtureLevel("level_rogue2_2-6")))).toEqual([]);
  });
});

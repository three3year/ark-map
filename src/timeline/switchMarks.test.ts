import { describe, expect, it } from "vitest";
import { convertFixture, loadFixtureLevel, rawFixture } from "../../test-fixtures/load.ts";
import {
  buildTimeline,
  spawnPlan,
  spawnTable,
  switchMarkKinds,
  switchMarks,
  type ActionRef,
  type Timeline,
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
      {
        kind: "random",
        number: 3,
        group: thiefGroup,
        candidate: 1,
        weight: 5,
        share: 5 / 105,
        picked: false,
      },
    ]);
  });

  it("marks the default pick too", () => {
    expect(switchMarks(level, plan, candidateAction(0))).toEqual([
      {
        kind: "random",
        number: 3,
        group: thiefGroup,
        candidate: 0,
        weight: 85,
        share: 85 / 105,
        picked: true,
      },
    ]);
  });
});

/**
 * ro3_n_5_5 with a second group "g2" in fragment 10, beside its "g1": packs s1 (weight 30) and s3
 * (weight 10) each get a keyed action, so s1's keyless action 3 is in a candidate of both groups.
 */
function rogue3_5_5WithSecondGroup(): Level {
  const raw = rawFixture("level_rogue3_5-5");
  const actions = raw.waves[0]!.fragments[10]!.actions;
  const keyedInG2 = (packKey: string, weight: number) => ({
    ...actions[0]!,
    randomSpawnGroupKey: "g2",
    randomSpawnGroupPackKey: packKey,
    weight,
  });
  actions.push(keyedInG2("s1", 30), keyedInG2("s3", 10));
  return convertFixture(raw);
}

describe("隨機出兵組 marks: an action in two groups (ro3_n_5_5, edited)", () => {
  const level = rogue3_5_5WithSecondGroup();
  const plan = spawnPlan(level, "NORMAL");
  const at = (actionIndex: number): ActionRef => ({
    branchIndex: null,
    waveIndex: 0,
    fragmentIndex: 10,
    actionIndex,
  });
  const inBothGroups = at(3);
  const g1 = plan.groups.random.findIndex((g) => g.fragmentIndex === 10 && g.key === "g1");
  const g2 = g1 + 1;

  it("gives one mark per group, each with the weight of the action's candidate in it", () => {
    expect(plan.groups.random[g2]).toMatchObject({ fragmentIndex: 10, key: "g2" });
    expect(switchMarks(level, plan, inBothGroups)).toEqual([
      {
        kind: "random",
        number: g1 + 1,
        group: g1,
        candidate: 0,
        weight: 100,
        share: 0.5,
        picked: true,
      },
      {
        kind: "random",
        number: g2 + 1,
        group: g2,
        candidate: 0,
        weight: 30,
        share: 0.75,
        picked: true,
      },
    ]);
  });

  it("an action in one group gets one mark", () => {
    expect(switchMarks(level, plan, at(2))).toEqual([
      {
        kind: "random",
        number: g1 + 1,
        group: g1,
        candidate: 1,
        weight: 100,
        share: 0.5,
        picked: false,
      },
    ]);
  });

  describe("with g1's other candidate picked", () => {
    const switches = { picks: { [g1]: 1 } };

    it("each mark says whether its own group picks the action's candidate", () => {
      const marks = switchMarks(level, spawnPlan(level, "NORMAL", switches), inBothGroups);
      expect(marks.map((m) => m.kind === "random" && [m.number, m.picked])).toEqual([
        [g1 + 1, false],
        [g2 + 1, true],
      ]);
    });

    it("the action's row still spawns, g2 picking it", () => {
      const row = spawnTable(level, { switches }).find(
        (r) => r.fragmentIndex === 10 && r.actionIndex === 3,
      )!;
      expect(row.picked).toBe(true);
      expect(row.firstOrder).not.toBeNull();
    });
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
        {
          kind: "random",
          number: 1,
          group: 0,
          candidate: 3,
          weight: 6,
          share: 6 / 14,
          picked: true,
        },
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

describe("裝置", () => {
  function onField(timeline: Timeline, alias: string) {
    for (let t = 0; t < 600; t++) {
      const device = timeline.devicesAt(t).find((d) => d.device.alias === alias);
      if (device) return device;
    }
    throw new Error(`${alias} never shows`);
  }

  it("a device only a 隨機出兵組 activates carries that group's mark: ro3_n_5_5's smbox", () => {
    const level = loadFixtureLevel("level_rogue3_5-5");
    const timeline = buildTimeline(level, { switches: { picks: { 0: 1 } } });
    expect(onField(timeline, "trap_108_smbox#1").marks).toEqual([
      { kind: "random", number: 1, group: 0 },
    ]);
  });

  it("several candidates of one group naming a device give it one mark, whichever is picked: act1arkhub_solo_1_3's akbtel#9", () => {
    const level = loadFixtureLevel("level_act1arkhub_solo_1_3");
    for (const candidate of [2, 3]) {
      const timeline = buildTimeline(level, { switches: { picks: { 0: candidate } } });
      expect(onField(timeline, "trap_1641_akbtel#9").marks).toEqual([
        { kind: "random", number: 1, group: 0 },
      ]);
    }
  });

  it("a device a 隱藏組 activates carries that group's mark: ro3_n_5_5's npcsld#1, in 隱藏組 totem2", () => {
    const level = loadFixtureLevel("level_rogue3_5-5");
    const timeline = buildTimeline(level, { switches: { hiddenOn: ["totem2"] } });
    expect(onField(timeline, "trap_024_npcsld#1").marks).toEqual([
      { kind: "hiddenGroup", number: 1, name: "totem2" },
    ]);
  });

  it("a device on the field from the start carries the mark of the 隱藏組 that withdraws it, on or off: act21mini_01's sheltr#5", () => {
    const level = loadFixtureLevel("level_act21mini_01");
    for (const hiddenOn of [[], ["normal"]]) {
      const device = buildTimeline(level, { switches: { hiddenOn } })
        .devicesAt(0)
        .find((d) => d.device.alias === "trap_141_sheltr#5");
      expect(device?.marks).toEqual([{ kind: "hiddenGroup", number: 1, name: "normal" }]);
    }
  });

  it("a device of four 開關 carries their marks by kind, then number: ro6_n_5_1's fttreant#5", () => {
    const level = loadFixtureLevel("level_rogue6_5-1");
    const timeline = buildTimeline(level, { switches: { picks: { 2: 1 } } });
    expect(onField(timeline, "trap_219_fttreant#5").marks).toEqual([
      { kind: "hiddenGroup", number: 1, name: "normal" },
      { kind: "hiddenGroup", number: 2, name: "hard" },
      { kind: "random", number: 3, group: 2 },
      { kind: "random", number: 5, group: 4 },
    ]);
  });

  it("a device only a 純機關 activates has no mark: main_05-10's ballis#1, on the field from the start (edited)", () => {
    const raw = rawFixture("level_main_05-10");
    const ballista = raw.predefines!.tokenInsts!.find((d) => d.alias === "trap_007_ballis#1")!;
    ballista.hidden = false;
    const device = buildTimeline(convertFixture(raw))
      .devicesAt(0)
      .find((d) => d.device.alias === "trap_007_ballis#1");
    expect(device?.marks).toEqual([]);
  });

  it("a removed device carries the marks it had before its 移除", () => {
    const level = loadFixtureLevel("level_rogue3_5-5");
    const switches = { picks: { 0: 1 } };
    const before = onField(buildTimeline(level, { switches }), "trap_108_smbox#1");
    const removals = new Map([[before.index, { wave: 0, t: 0 }]]);
    const removed = buildTimeline(level, { switches, removals })
      .removedAt(300)
      .find((d) => d.index === before.index);
    expect(removed?.marks).toEqual(before.marks);
    expect(removed?.marks).toHaveLength(1);
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

  describe("ro2_n_5_5's 第 2 波: no enemy has a mark, only the box 隨機出兵組 1 puts down", () => {
    const level = loadFixtureLevel("level_rogue2_5-5");
    const secondWave = (picks: Record<number, number>) =>
      buildTimeline(level, { waveIndex: 1, switches: { picks } });

    it("count the kinds of the devices drawn in the wave: whichever box is picked, 隨機出兵組", () => {
      for (const box of [1, 2, 3]) {
        const timeline = secondWave({ 0: box });
        expect(timeline.individuals.every((i) => i.marks.length === 0)).toBe(true);
        expect(switchMarkKinds(timeline)).toEqual(["random"]);
      }
    });

    it("leave out devices never drawn: the default candidate puts no box down", () => {
      expect(switchMarkKinds(secondWave({}))).toEqual([]);
    });
  });
});

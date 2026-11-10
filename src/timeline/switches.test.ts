// Seam 1: level model + 開關狀態 (隱藏組, 隨機出兵組) -> baseline timeline / spawn table.
import { describe, expect, it } from "vitest";
import { loadFixtureLevel } from "../../test-fixtures/load.ts";
import {
  buildTimeline,
  levelGroups,
  spawnTable,
  switchHidden,
  switchConditional,
  switchPick,
  takeSnapshot,
  type SpawnSwitches,
} from "./index.ts";

describe("隱藏組: 15-12 (shown as 15-13)", () => {
  // Normal and six-star enable group2 with level_hidden_group_enable; group1 is never enabled.
  // group1 tags three single-enemy spawn actions, group2 one.
  const level = loadFixtureLevel("level_main_15-12");
  const hiddenOf = (ids: string[]) =>
    buildTimeline(level, { switches: { hiddenOn: ids } }).individuals.length;

  it("lists group1 off and group2 on by default, for normal and six-star", () => {
    for (const difficulty of ["NORMAL", "SIX_STAR"] as const) {
      expect(levelGroups(level, difficulty).hidden).toEqual([
        { name: "group1", defaultOn: false },
        { name: "group2", defaultOn: true },
      ]);
    }
    expect(levelGroups(level, "FOUR_STAR").hidden.map((g) => g.defaultOn)).toEqual([false, false]);
  });

  it("by default only group2's enemy spawns; switching group1 on adds three individuals", () => {
    const byDefault = buildTimeline(level).individuals.length;
    expect(hiddenOf(["group2"])).toBe(byDefault);
    expect(hiddenOf(["group1", "group2"])).toBe(byDefault + 3);
    expect(hiddenOf([])).toBe(byDefault - 1);
  });

  it("the spawn table lists a hidden group's rows, named, only while the group is on", () => {
    const hiddenRows = (hiddenOn?: string[]) =>
      spawnTable(level, { switches: { hiddenOn } })
        .filter((r) => r.hiddenGroup !== null)
        .map((r) => r.hiddenGroup);
    expect(hiddenRows()).toEqual(["group2"]);
    expect(hiddenRows(["group1", "group2"]).sort()).toEqual([
      "group1",
      "group1",
      "group1",
      "group2",
    ]);
  });

  it("switching a group back to its default leaves no switch state behind", () => {
    const on = switchHidden(level, "NORMAL", {}, "group1", true);
    expect(on).toEqual({ hiddenOn: ["group1", "group2"] });
    expect(switchHidden(level, "NORMAL", on, "group1", false)).toEqual({});
    expect(switchHidden(level, "NORMAL", {}, "group2", false)).toEqual({ hiddenOn: [] });
  });
});

describe("隨機出兵組: ro2_n_2_6", () => {
  // Wave 2 opens with group g1: nothing (an empty spawn, weight 85) or one of four thieves
  // (weight 5 each), group 2 after wave 1's g1 and g2, which pick treasure boxes to activate
  // (devices, no spawn). PRTS.Map shows the same: 22@85% "-" plus four 22@5% rows with 切换.
  const level = loadFixtureLevel("level_rogue2_2-6");
  const groups = levelGroups(level, "NORMAL").random;
  const enemiesOf = (picks: Record<number, number>) =>
    buildTimeline(level, { waveIndex: 1, switches: { picks } }).individuals.map((i) => i.enemy.id);

  it("has two box groups, then the spawn group, whose default is the weight-85 empty candidate", () => {
    expect(groups).toMatchObject([
      { branchIndex: null, waveIndex: 0, fragmentIndex: 0, key: "g1" },
      { branchIndex: null, waveIndex: 0, fragmentIndex: 0, key: "g2" },
      { branchIndex: null, waveIndex: 1, fragmentIndex: 0, key: "g1" },
    ]);
    expect(groups[2]!.candidates.map((c) => c.weight)).toEqual([85, 5, 5, 5, 5]);
    expect(groups[2]!.defaultPick).toBe(0);
    expect(enemiesOf({})).toEqual([]);
  });

  it("picking another candidate spawns that thief only", () => {
    expect(enemiesOf({ 2: 1 })).toEqual(["enemy_2034_sythef"]);
    expect(enemiesOf({ 2: 4 })).toEqual(["enemy_2085_skzjxd"]);
  });

  it("the spawn table matches PRTS.Map's rows; candidate rows carry their weight share", () => {
    // PRTS.Map (2026-11-07, headless render of map.ark-nights.com/map/ro2_n_2_6): wave 1 has
    // 20 rows (the 突襲-only raid group off) with these 阶段时间点 and counts, then 限时50s;
    // wave 2 is group 22: 85% "-" (picked) and four 5% rows at 87 s / 3 s with 切换.
    const rows = spawnTable(level);
    const wave1 = rows.filter((r) => r.waveIndex === 0);
    expect(wave1.map((r) => [r.waveTime, r.count])).toEqual([
      ...Array.from({ length: 5 }, () => [0, 1]),
      [3, 1],
      [7, 3],
      ...Array.from({ length: 5 }, () => [57, 1]),
      [67, 1],
      [69, 1],
      [69, 1],
      ...Array.from({ length: 5 }, () => [79, 1]),
    ]);
    expect(wave1.at(-1)!.lastOrder).toBe(22);
    const wave2 = rows.filter((r) => r.waveIndex === 1);
    expect(wave2.map((r) => [r.enemyId, r.random?.picked, r.firstOrder])).toEqual([
      ["", true, null],
      ["enemy_2034_sythef", false, null],
      ["enemy_2001_duckmi", false, null],
      ["enemy_2002_bearmi", false, null],
      ["enemy_2085_skzjxd", false, null],
    ]);
    expect(wave2.map((r) => Math.round(r.random!.share * 100))).toEqual([81, 5, 5, 5, 5]);
    expect(wave2.slice(1).map((r) => [r.waveTime, r.absoluteTime])).toEqual(
      Array.from({ length: 4 }, () => [3, 87]),
    );
  });

  it("picking the default candidate again leaves no switch state behind", () => {
    const picked = switchPick(level, {}, 2, 2);
    expect(picked).toEqual({ picks: { 2: 2 } });
    expect(switchPick(level, picked, 2, 0)).toEqual({});
  });

  it("a picked thief takes the next 次序 number", () => {
    const wave2 = spawnTable(level, { switches: { picks: { 2: 2 } } }).filter(
      (r) => r.waveIndex === 1,
    );
    expect(wave2.map((r) => [r.random?.picked, r.firstOrder])).toEqual([
      [false, null],
      [false, null],
      [true, 23],
      [false, null],
      [false, null],
    ]);
  });
});

describe("隨機出兵組 packs: ro3_n_5_5", () => {
  // Fragment 10's g1: pack s1 = 2 x 暮落沉渣 (duskls) now + 1 x duskld 5 s later (keyless member),
  // pack s2 = 1 x duskld now + 2 x duskls 5 s later. Both weight 100.
  const level = loadFixtureLevel("level_rogue3_5-5");
  const group = levelGroups(level, "NORMAL").random.findIndex((g) => g.fragmentIndex === 10);
  const fragment10 = (pick: number) =>
    buildTimeline(level, { switches: { picks: { [group]: pick } } })
      .individuals.filter((i) => i.fragmentIndex === 10)
      .map((i) => [i.actionIndex, i.enemy.id]);

  it("bundles each pack's keyed and keyless actions into one candidate", () => {
    const candidates = levelGroups(level, "NORMAL").random[group]!.candidates;
    expect(candidates.map((c) => c.actions.map((a) => a.actionIndex))).toEqual([
      [0, 3],
      [1, 2],
    ]);
    expect(candidates.map((c) => c.weight)).toEqual([100, 100]);
  });

  it("the default (first of equal weights) spawns pack s1; picking s2 swaps the whole pack", () => {
    const duskls = "enemy_1288_duskls_2";
    const duskld = "enemy_1292_duskld_2";
    expect(fragment10(0)).toEqual(
      buildTimeline(level)
        .individuals.filter((i) => i.fragmentIndex === 10)
        .map((i) => [i.actionIndex, i.enemy.id]),
    );
    expect(fragment10(0)).toEqual([
      [0, duskls],
      [0, duskls],
      [3, duskld],
    ]);
    expect(fragment10(1)).toEqual([
      [1, duskld],
      [2, duskls],
      [2, duskls],
    ]);
  });
});

describe("條件出兵: 11-06 (shown as 11-7)", () => {
  // Branch route1: breaking the larva device at (4, 10) spawns one enemy_1266_nhapos on extra
  // route 0, which starts on that cell and first waits 8 s.
  const level = loadFixtureLevel("level_main_11-06");
  const on30 = { conditional: { 0: { wave: 0, t: 30 } } };

  it("switched on at 30 s: the 30 s snapshot has one more individual, on the extra route start", () => {
    const off = takeSnapshot(buildTimeline(level), 30);
    const on = takeSnapshot(buildTimeline(level, { switches: on30 }), 30);
    expect(on.counts.onField).toBe(off.counts.onField + 1);
    const added = on.onField.filter((e) => e.individual.branchIndex === 0);
    expect(added.map((e) => [e.individual.enemy.id, e.position])).toEqual([
      ["enemy_1266_nhapos", { x: 10, y: 4 }],
    ]);
    expect(added[0]!.individual.spawnTime).toBe(30);
  });

  it("is off by default and not there before its trigger second", () => {
    const timeline = buildTimeline(level, { switches: on30 });
    const added = timeline.individuals.filter((i) => i.branchIndex !== null);
    expect(added).toHaveLength(1);
    expect(added[0]!.stateAt(29.9).kind).toBe("pending");
    expect(buildTimeline(level).individuals.some((i) => i.branchIndex !== null)).toBe(false);
  });

  it("the spawn table lists it at its trigger second, among the wave's rows, only while on", () => {
    expect(spawnTable(level).some((r) => r.branchIndex !== null)).toBe(false);
    const rows = spawnTable(level, { switches: on30 });
    const i = rows.findIndex((r) => r.branchIndex === 0);
    expect(rows[i]).toMatchObject({
      enemyId: "enemy_1266_nhapos",
      count: 1,
      waveTime: 30,
      absoluteTime: 30,
    });
    expect(rows[i - 1]!.waveTime).toBeLessThanOrEqual(30);
    expect(rows[i + 1]!.waveTime).toBeGreaterThan(30);
    expect(rows[i]!.firstOrder).toBe(rows[i - 1]!.lastOrder! + 1);
  });
});

describe("條件出兵: 12-18 (shown as 12-20)", () => {
  // branch_2 spawns enemy_1542_wdslm_2 on extra route 0 from (4, 1); branch_1 spawns
  // enemy_1542_wdslm_3 on extra route 1 from (3, 1). Both routes start with a wait.
  const level = loadFixtureLevel("level_main_12-18");
  const added = (conditional: Record<number, { wave: number; t: number }>, t: number) =>
    takeSnapshot(buildTimeline(level, { switches: { conditional } }), t)
      .onField.filter((e) => e.individual.branchIndex !== null)
      .map((e) => [e.individual.branchIndex, e.individual.enemy.id, e.position]);

  it("each branch switches on alone, at its own second", () => {
    expect(added({ 0: { wave: 0, t: 10 } }, 11)).toEqual([
      [0, "enemy_1542_wdslm_2", { x: 1, y: 4 }],
    ]);
    expect(added({ 1: { wave: 0, t: 40 } }, 41)).toEqual([
      [1, "enemy_1542_wdslm_3", { x: 1, y: 3 }],
    ]);
    expect(added({ 1: { wave: 0, t: 40 } }, 39)).toEqual([]);
  });

  it("a branch triggered in another wave stays out of this wave", () => {
    expect(added({ 0: { wave: 1, t: 10 } }, 11)).toEqual([]);
  });

  it("both can be on together", () => {
    const both = { 0: { wave: 0, t: 10 }, 1: { wave: 0, t: 12 } };
    expect(added(both, 12).map(([branch]) => branch)).toEqual([0, 1]);
  });

  it("switching one off keeps the other; switching both off leaves no state", () => {
    const one = switchConditional({}, 1, { wave: 0, t: 40 });
    const both = switchConditional(one, 0, { wave: 0, t: 10 });
    expect(both).toEqual({ conditional: { 0: { wave: 0, t: 10 }, 1: { wave: 0, t: 40 } } });
    expect(switchConditional(both, 0, null)).toEqual(one);
    expect(switchConditional(one, 1, null)).toEqual({});
  });
});

describe("條件出兵: 5-10 (device only)", () => {
  const level = loadFixtureLevel("level_main_05-10");

  it("a device-only branch spawns nothing even when switched on", () => {
    const on = buildTimeline(level, { switches: { conditional: { 0: { wave: 0, t: 5 } } } });
    expect(on.individuals).toHaveLength(buildTimeline(level).individuals.length);
  });
});

describe("條件出兵 with its own 隱藏組 and 隨機出兵組: act1dp_01", () => {
  // Branch 0 "sequence" is the only thing that spawns: four single-enemy actions, all in 隱藏組
  // "random" (no wave action uses it, no 難度修正 enables it) and in 隨機出兵組 "1", weights
  // 4 / 2 / 2 / 6.
  const level = loadFixtureLevel("level_act1dp_01");
  const on = { conditional: { 0: { wave: 0, t: 10 } } };
  const spawned = (switches: SpawnSwitches) =>
    buildTimeline(level, { switches }).individuals.map((i) => i.enemy.id);

  it("lists the branch's 隱藏組, off by default, and its 隨機出兵組, picking the heaviest", () => {
    const groups = levelGroups(level, "NORMAL");
    expect(groups.hidden).toEqual([{ name: "random", defaultOn: false }]);
    expect(
      groups.random.map((g) => [
        g.branchIndex,
        g.fragmentIndex,
        g.key,
        g.candidates.map((c) => c.weight),
        g.defaultPick,
      ]),
    ).toEqual([[0, 0, "1", [4, 2, 2, 6], 3]]);
  });

  it("spawns nothing while its 隱藏組 is off; with the group on, the default candidate", () => {
    expect(spawned(on)).toEqual([]);
    const withGroup = switchHidden(level, "NORMAL", on, "random", true);
    expect(withGroup).toEqual({ ...on, hiddenOn: ["random"] });
    expect(spawned(withGroup)).toEqual(["enemy_17003_sabshp"]);
    expect(spawned({ hiddenOn: ["random"] })).toEqual([]);
  });

  it("picking another candidate of the branch's 隨機出兵組 spawns that one instead", () => {
    const picked = switchPick(level, { ...on, hiddenOn: ["random"] }, 0, 0);
    expect(picked.picks).toEqual({ 0: 0 });
    expect(spawned(picked)).toEqual(["enemy_1007_slime_2"]);
    expect(switchPick(level, picked, 0, 3).picks).toBeUndefined();
  });

  it("the spawn table lists every candidate of the branch's group, the pick marked", () => {
    const rows = spawnTable(level, { switches: { ...on, hiddenOn: ["random"] } });
    expect(
      rows.map((r) => [r.branchIndex, r.enemyId, r.random?.weight, r.random?.picked, r.firstOrder]),
    ).toEqual([
      [0, "enemy_1007_slime_2", 4, false, null],
      [0, "enemy_1021_bslime", 2, false, null],
      [0, "enemy_1350_mgcshp", 2, false, null],
      [0, "enemy_17003_sabshp", 6, true, 1],
    ]);
  });
});

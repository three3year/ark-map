// Seam 1: level model + 開關狀態 (隱藏組, 隨機出兵組) -> baseline timeline / spawn table.
import { describe, expect, it } from "vitest";
import { loadFixtureLevel } from "../../test-fixtures/load.ts";
import { buildTimeline, levelGroups, spawnTable, switchHidden, switchPick } from "./index.ts";

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
  // (weight 5 each). Wave 1's g1 and g2 pick treasure boxes (devices, no spawn) and are not
  // spawn groups. PRTS.Map shows the same: 22@85% "-" plus four 22@5% rows with 切换.
  const level = loadFixtureLevel("level_rogue2_2-6");
  const groups = levelGroups(level, "NORMAL").random;
  const enemiesOf = (picks: Record<number, number>) =>
    buildTimeline(level, { waveIndex: 1, switches: { picks } }).individuals.map((i) => i.enemy.id);

  it("has one spawn group, whose default is the weight-85 empty candidate", () => {
    expect(groups.map((g) => [g.waveIndex, g.fragmentIndex, g.key])).toEqual([[1, 0, "g1"]]);
    expect(groups[0]!.candidates.map((c) => c.weight)).toEqual([85, 5, 5, 5, 5]);
    expect(groups[0]!.defaultPick).toBe(0);
    expect(enemiesOf({})).toEqual([]);
  });

  it("picking another candidate spawns that thief only", () => {
    expect(enemiesOf({ 0: 1 })).toEqual(["enemy_2034_sythef"]);
    expect(enemiesOf({ 0: 4 })).toEqual(["enemy_2085_skzjxd"]);
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
    const picked = switchPick(level, {}, 0, 2);
    expect(picked).toEqual({ picks: { 0: 2 } });
    expect(switchPick(level, picked, 0, 0)).toEqual({});
  });

  it("a picked thief takes the next 次序 number", () => {
    const wave2 = spawnTable(level, { switches: { picks: { 0: 2 } } }).filter(
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

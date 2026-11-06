// Seam 1: level model -> spawn table, checked against PRTS.Map's spawn tables.
import { describe, expect, it } from "vitest";
import prtsTables from "../../test-fixtures/prts/spawn-tables.json" with { type: "json" };
import { loadFixtureLevel } from "../../test-fixtures/load.ts";
import { buildTimeline, spawnTable } from "./index.ts";

/**
 * PRTS.Map's spawn table rows in its display order, transcribed from accessibility
 * snapshots of its pages (2026-11). Columns: 敌兵, x 数量, 次序, 出现间隔, 时间点 (absolute),
 * 阶段时间点 (wave time), and the last row's 击溃后继续 / 限时Ns.
 */
interface PrtsRow {
  enemy: string;
  count: number;
  order: string;
  interval: number;
  time: number;
  waveTime: number;
  marker: string | null;
}

const prts = prtsTables as Record<string, PrtsRow[]>;
const round = (t: number) => Math.round(t * 100) / 100;

describe("無害單位", () => {
  // 12-14's harmless spawns (isUnharmfulAndAlwaysCountAsKilled): 10 actions of three kinds.
  const level = loadFixtureLevel("level_main_12-14");
  const harmlessKinds = ["enemy_1313_wdfmr", "enemy_1540_wdncr", "enemy_1541_wdslms"];

  it("are flagged in the spawn table", () => {
    const harmless = spawnTable(level).filter((r) => r.harmless);
    expect(harmless).toHaveLength(10);
    expect(new Set(harmless.map((r) => r.enemyId))).toEqual(new Set(harmlessKinds));
  });

  it("are flagged on their individuals", () => {
    const harmless = buildTimeline(level).individuals.filter((i) => i.harmless);
    expect(harmless).toHaveLength(10);
    expect(new Set(harmless.map((i) => i.enemy.id))).toEqual(new Set(harmlessKinds));
  });
});

describe.each(Object.keys(prts))("%s spawn table vs PRTS.Map", (name) => {
  const rows = spawnTable(loadFixtureLevel(name));
  const expected = prts[name]!;

  it("lists every spawn action with its wave time and absolute time, in PRTS's order", () => {
    expect(rows.map((r) => [r.enemyId, r.count, round(r.waveTime), round(r.absoluteTime)])).toEqual(
      expected.map((r) => [r.enemy, r.count, r.waveTime, r.time]),
    );
  });

  it("numbers individuals across the level (次序) and shows each action's interval", () => {
    const order = (r: (typeof rows)[number]) =>
      r.firstOrder === r.lastOrder ? `${r.firstOrder}` : `${r.firstOrder} ~ ${r.lastOrder}`;
    expect(rows.map((r) => [order(r), r.interval])).toEqual(
      expected.map((r) => [r.order, r.interval]),
    );
  });

  it("marks each wave's last row: 擊潰後繼續, or 限時 N 秒 when the wave has a time limit", () => {
    const marker = (r: (typeof rows)[number]) =>
      r.waveEnd === null
        ? null
        : r.waveEnd.kind === "untilCleared"
          ? "击溃后继续"
          : `限时${r.waveEnd.seconds}s`;
    expect(rows.map(marker)).toEqual(expected.map((r) => r.marker));
  });
});

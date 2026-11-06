// 出兵表: one row per spawn action across every wave, with PRTS.Map's absolute-time column.
import { isSpawn, type Difficulty, type EnemyRef, type Level } from "../level/index.ts";
import { scheduleWave, type ScheduledAction } from "./schedule.ts";
import { spawnPlan, triggeredBranches, type SpawnSwitches } from "./switches.ts";

/** PRTS.Map's convention between waves: the next wave starts 5 s after the previous ends. */
export const PRTS_WAVE_GAP = 5;

/** How a wave hands over to the next: 擊潰後繼續, or 限時 N 秒. */
export type WaveEnd = { kind: "untilCleared" } | { kind: "timeLimit"; seconds: number };

/** A row's place in a 隨機出兵組. */
export interface RandomRowInfo {
  /** Index into `levelGroups(...).random`. */
  group: number;
  candidate: number;
  /** The candidate's weight and its share of the group's total. */
  weight: number;
  share: number;
  /** The candidate is the group's current pick: the row spawns. */
  picked: boolean;
}

export interface SpawnRow {
  waveIndex: number;
  /**
   * The switched-on 條件出兵 (index into `Level.branches`) the row comes from, or null for a wave
   * action. For a 條件出兵, `fragmentIndex` is the branch phase and the times count from the
   * wave start, trigger second included.
   */
  branchIndex: number | null;
  fragmentIndex: number;
  actionIndex: number;
  /** Empty for a random group's "nothing" candidate. */
  enemyId: string;
  /** Null when the level file references an enemy it does not define, or none. */
  enemy: EnemyRef | null;
  count: number;
  /**
   * 次序: 1-based numbers of the action's first and last individual, counted over the rows that
   * spawn; null for a candidate that is not picked, and for an empty candidate.
   */
  firstOrder: number | null;
  lastOrder: number | null;
  interval: number;
  /** 波內時刻 of the action's first individual. */
  waveTime: number;
  /** 絕對時刻: wave offset + wave time. For comparison with PRTS.Map only. */
  absoluteTime: number;
  /** 無害單位: counts as killed, never a threat. */
  harmless: boolean;
  /** 隱藏組 the action belongs to; rows of groups switched off are left out. */
  hiddenGroup: string | null;
  /** The first 隨機出兵組 candidate the action belongs to. */
  random: RandomRowInfo | null;
  /** Set on the last row of each wave. */
  waveEnd: WaveEnd | null;
}

export interface SpawnTableOptions {
  /** Picks the 隱藏組 on by default. Default NORMAL. */
  difficulty?: Difficulty;
  switches?: SpawnSwitches;
}

/** A spawn action placed in a wave: a wave action, or one of a switched-on 條件出兵. */
type TableAction = ScheduledAction & { branchIndex: number | null; spawns: boolean };

/**
 * Rows are ordered by wave, then by wave time, ties in level-file order (條件出兵 after the
 * wave's own actions). A switched-on 條件出兵's spawns join its trigger wave. The wave offset is
 * the previous wave's offset + its end (wave preDelay included) + {@link PRTS_WAVE_GAP}. Every
 * action counts toward a fragment's end, whatever the switches say (matches PRTS.Map on
 * ro2_n_2_6 and ro3_n_5_5).
 */
export function spawnTable(level: Level, options: SpawnTableOptions = {}): SpawnRow[] {
  const difficulty = options.difficulty ?? "NORMAL";
  const switches = options.switches ?? {};
  const plan = spawnPlan(level, difficulty, switches);
  const rows: SpawnRow[] = [];
  let order = 0;
  let offset = 0;
  level.waves.forEach((wave, waveIndex) => {
    const schedule = scheduleWave(wave);
    const spawns: TableAction[] = schedule.actions
      .filter(
        ({ action }) =>
          isSpawn(action) && (action.hiddenGroup === null || plan.hiddenOn.has(action.hiddenGroup)),
      )
      .map((s) => ({ ...s, branchIndex: null, spawns: plan.spawns({ waveIndex, ...s }) }));
    for (const b of triggeredBranches(level, difficulty, switches, waveIndex)) {
      for (const s of scheduleWave(b.level.waves[0]!).actions) {
        if (!isSpawn(s.action) || !b.plan.spawns({ waveIndex: 0, ...s })) continue;
        spawns.push({ ...s, start: b.t + s.start, branchIndex: b.branchIndex, spawns: true });
      }
    }
    spawns.sort((a, b) => a.start - b.start);
    const waveEnd: WaveEnd =
      wave.timeLimit === null
        ? { kind: "untilCleared" }
        : { kind: "timeLimit", seconds: wave.timeLimit };
    spawns.forEach(({ action, fragmentIndex, actionIndex, start, branchIndex, spawns: on }, i) => {
      const ref = { waveIndex, fragmentIndex, actionIndex };
      // A random group's "nothing" candidate is a spawn action without an enemy.
      const active = on && action.key !== "";
      const membership = branchIndex === null ? plan.memberships(ref)[0] : undefined;
      let random: RandomRowInfo | null = null;
      if (membership) {
        const candidates = plan.groups.random[membership.group]!.candidates;
        const weight = candidates[membership.candidate]!.weight;
        const total = candidates.reduce((sum, c) => sum + c.weight, 0);
        random = {
          ...membership,
          weight,
          share: total > 0 ? weight / total : 0,
          picked: plan.picks[membership.group] === membership.candidate,
        };
      }
      const firstOrder = active ? order + 1 : null;
      if (active) order += action.count;
      rows.push({
        waveIndex,
        branchIndex,
        fragmentIndex,
        actionIndex,
        enemyId: action.key,
        enemy: level.enemies[action.key] ?? null,
        count: action.count,
        firstOrder,
        lastOrder: active ? order : null,
        interval: action.interval,
        waveTime: start,
        absoluteTime: offset + start,
        harmless: action.harmless,
        hiddenGroup: action.hiddenGroup,
        random,
        waveEnd: i === spawns.length - 1 ? waveEnd : null,
      });
    });
    offset += schedule.end + PRTS_WAVE_GAP;
  });
  return rows;
}

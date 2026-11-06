// 出兵表: one row per spawn action across every wave, with PRTS.Map's absolute-time column.
import type { EnemyRef, Level } from "../level/index.ts";
import { scheduleWave } from "./schedule.ts";

/** PRTS.Map's convention between waves: the next wave starts 5 s after the previous ends. */
export const PRTS_WAVE_GAP = 5;

/** How a wave hands over to the next: 擊潰後繼續, or 限時 N 秒. */
export type WaveEnd = { kind: "untilCleared" } | { kind: "timeLimit"; seconds: number };

export interface SpawnRow {
  waveIndex: number;
  fragmentIndex: number;
  actionIndex: number;
  enemyId: string;
  /** Null when the level file references an enemy it does not define. */
  enemy: EnemyRef | null;
  count: number;
  /** 次序: 1-based numbers of the action's first and last individual, counted in row order. */
  firstOrder: number;
  lastOrder: number;
  interval: number;
  /** 波內時刻 of the action's first individual. */
  waveTime: number;
  /** 絕對時刻: wave offset + wave time. For comparison with PRTS.Map only. */
  absoluteTime: number;
  /** 無害單位: counts as killed, never a threat. */
  harmless: boolean;
  hiddenGroup: string | null;
  /** Set on the last row of each wave. */
  waveEnd: WaveEnd | null;
}

/**
 * Rows are ordered by wave, then by wave time, ties in level-file order. The wave offset is
 * the previous wave's offset + its end (wave preDelay included) + {@link PRTS_WAVE_GAP}.
 */
export function spawnTable(level: Level): SpawnRow[] {
  const rows: SpawnRow[] = [];
  let offset = 0;
  level.waves.forEach((wave, waveIndex) => {
    const schedule = scheduleWave(wave);
    const spawns = schedule.actions
      .filter(({ action }) => action.actionType === "SPAWN")
      .sort((a, b) => a.start - b.start);
    const waveEnd: WaveEnd =
      wave.timeLimit === null
        ? { kind: "untilCleared" }
        : { kind: "timeLimit", seconds: wave.timeLimit };
    spawns.forEach(({ action, fragmentIndex, actionIndex, start }, i) => {
      const firstOrder = (rows.at(-1)?.lastOrder ?? 0) + 1;
      rows.push({
        waveIndex,
        fragmentIndex,
        actionIndex,
        enemyId: action.key,
        enemy: level.enemies[action.key] ?? null,
        count: action.count,
        firstOrder,
        lastOrder: firstOrder + action.count - 1,
        interval: action.interval,
        waveTime: start,
        absoluteTime: offset + start,
        harmless: action.harmless,
        hiddenGroup: action.hiddenGroup,
        waveEnd: i === spawns.length - 1 ? waveEnd : null,
      });
    });
    offset += schedule.end + PRTS_WAVE_GAP;
  });
  return rows;
}

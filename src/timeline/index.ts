// 基準時間軸: level model -> every enemy individual's trajectory; 時刻快照 = its value at T.
// Pure; no DOM or network.
import {
  isSpawn,
  moveSpeedFactor,
  variantModifiers,
  type Difficulty,
  type EnemyRef,
  type Level,
  type Route,
  type Vec2,
} from "../level/index.ts";
import { createNextNodeLookup } from "../pathfinding/index.ts";
import {
  nextNodeModel,
  theoreticalSpeed,
  type IndividualState,
  type MovementModel,
  type PathLeg,
} from "./movement.ts";
import { scheduleWave } from "./schedule.ts";
import { spawnPlan, triggeredBranches, type SpawnPlan, type SpawnSwitches } from "./switches.ts";

export * from "./movement.ts";
export * from "./spawnTable.ts";
export * from "./switches.ts";

export interface Individual {
  /** Stable within a timeline: "<fragment>-<action>-<k>". */
  id: string;
  enemy: EnemyRef;
  route: Route;
  /**
   * The 條件出兵 (index into `Level.branches`) that spawned it, or null for a wave action. For a
   * 條件出兵, `fragmentIndex` is the branch phase.
   */
  branchIndex: number | null;
  fragmentIndex: number;
  actionIndex: number;
  /** k: this is the (k+1)-th individual of its action. */
  spawnIndex: number;
  spawnTime: number;
  /** 無害單位: counts as killed, never a threat. */
  harmless: boolean;
  leakTime: number | null;
  /** 路徑 to draw when the individual is selected. */
  path: PathLeg[];
  stateAt(t: number): IndividualState;
}

export interface Timeline {
  individuals: Individual[];
}

export interface TimelineOptions {
  waveIndex?: number;
  /** The variant's difficulty; picks which 難度修正 apply. Default NORMAL. */
  difficulty?: Difficulty;
  /** 隱藏組 and 隨機出兵組 state; parts left out take the variant's default. */
  switches?: SpawnSwitches;
  movement?: MovementModel;
}

export interface Snapshot {
  onField: { individual: Individual; position: Vec2; invisible: boolean }[];
  counts: { pending: number; onField: number; leaked: number };
}

export function takeSnapshot(timeline: Timeline, t: number): Snapshot {
  const snapshot: Snapshot = { onField: [], counts: { pending: 0, onField: 0, leaked: 0 } };
  for (const individual of timeline.individuals) {
    const state = individual.stateAt(t);
    snapshot.counts[state.kind]++;
    if (state.kind === "onField") {
      snapshot.onField.push({ individual, position: state.position, invisible: state.invisible });
    }
  }
  return snapshot;
}

/** Last second anything happens: the latest leak, or the latest spawn when nothing leaks. */
export function timelineEnd(timeline: Timeline): number {
  let end = 0;
  for (const i of timeline.individuals) end = Math.max(end, i.leakTime ?? i.spawnTime);
  return end;
}

/**
 * Every individual of one wave, timed by {@link scheduleWave}; T = 0 is the wave start and
 * earlier waves count as cleared.
 */
export function buildTimeline(level: Level, options: TimelineOptions = {}): Timeline {
  const { waveIndex = 0, difficulty = "NORMAL", switches = {}, movement = nextNodeModel } = options;
  const wave = level.waves[waveIndex];
  if (!wave) return { individuals: [] };
  const nextNode = createNextNodeLookup(level.map);
  const modifiers = variantModifiers(level.modifiers, difficulty);
  const individuals: Individual[] = [];

  /**
   * Individuals of wave `sourceWave` of `source` (the level, or a 條件出兵 run as a level),
   * spawning on `routes`, `offset` seconds into the wave.
   */
  function spawn(
    source: Level,
    plan: SpawnPlan,
    sourceWave: number,
    routes: Route[],
    offset: number,
    branch: number | null,
  ) {
    for (const scheduled of scheduleWave(source.waves[sourceWave]!).actions) {
      const { action, fragmentIndex, actionIndex } = scheduled;
      if (!isSpawn(action)) continue;
      if (!plan.spawns({ waveIndex: sourceWave, fragmentIndex, actionIndex })) continue;
      const route = routes[action.routeIndex];
      const enemy = level.enemies[action.key];
      if (!route || route.motionMode === "E_NUM" || !enemy) continue;
      const speed = theoreticalSpeed(enemy, level.options, moveSpeedFactor(modifiers, enemy.id));
      const fragmentStart = offset + scheduled.fragmentStart;
      for (let k = 0; k < action.count; k++) {
        const spawnTime = offset + scheduled.start + k * action.interval;
        const trajectory = movement({ route, speed, spawnTime, fragmentStart, nextNode });
        individuals.push({
          id: `${branch === null ? "" : `b${branch}-`}${fragmentIndex}-${actionIndex}-${k}`,
          enemy,
          route,
          branchIndex: branch,
          fragmentIndex,
          actionIndex,
          spawnIndex: k,
          spawnTime,
          harmless: action.harmless,
          leakTime: trajectory.leakTime,
          path: trajectory.path,
          stateAt: trajectory.stateAt,
        });
      }
    }
  }

  spawn(level, spawnPlan(level, difficulty, switches), waveIndex, level.routes, 0, null);
  for (const b of triggeredBranches(level, difficulty, switches, waveIndex)) {
    spawn(b.level, b.plan, 0, level.extraRoutes, b.t, b.branchIndex);
  }
  return { individuals };
}

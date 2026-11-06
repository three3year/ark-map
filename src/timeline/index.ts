// 基準時間軸: level model -> every enemy individual's trajectory; 時刻快照 = its value at T.
// Pure; no DOM or network.
import type { EnemyRef, Level, Route, Vec2 } from "../level/index.ts";
import { createNextNodeLookup } from "../pathfinding/index.ts";
import {
  nextNodeModel,
  theoreticalSpeed,
  type IndividualState,
  type MovementModel,
} from "./movement.ts";
import { scheduleWave } from "./schedule.ts";

export * from "./movement.ts";
export * from "./spawnTable.ts";

export interface Individual {
  /** Stable within a timeline: "<fragment>-<action>-<k>". */
  id: string;
  enemy: EnemyRef;
  route: Route;
  fragmentIndex: number;
  actionIndex: number;
  /** k: this is the (k+1)-th individual of its action. */
  spawnIndex: number;
  spawnTime: number;
  /** 無害單位: counts as killed, never a threat. */
  harmless: boolean;
  leakTime: number | null;
  stateAt(t: number): IndividualState;
}

export interface Timeline {
  individuals: Individual[];
}

export interface TimelineOptions {
  waveIndex?: number;
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
  const { waveIndex = 0, movement = nextNodeModel } = options;
  const wave = level.waves[waveIndex];
  if (!wave) return { individuals: [] };
  const nextNode = createNextNodeLookup(level.map);
  const individuals: Individual[] = [];
  for (const { action, fragmentIndex, actionIndex, fragmentStart, start } of scheduleWave(wave)
    .actions) {
    if (action.actionType !== "SPAWN") continue;
    const route = level.routes[action.routeIndex];
    const enemy = level.enemies[action.key];
    if (!route || route.motionMode === "E_NUM" || !enemy) continue;
    const speed = theoreticalSpeed(enemy, level.options);
    for (let k = 0; k < action.count; k++) {
      const spawnTime = start + k * action.interval;
      const trajectory = movement({ route, speed, spawnTime, fragmentStart, nextNode });
      individuals.push({
        id: `${fragmentIndex}-${actionIndex}-${k}`,
        enemy,
        route,
        fragmentIndex,
        actionIndex,
        spawnIndex: k,
        spawnTime,
        harmless: action.harmless,
        leakTime: trajectory.leakTime,
        stateAt: trajectory.stateAt,
      });
    }
  }
  return { individuals };
}

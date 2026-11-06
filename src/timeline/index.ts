// 基準時間軸: level model -> every enemy individual's trajectory; 時刻快照 = its value at T.
// Pure; no DOM or network.
import type { EnemyRef, Level, Route, Vec2 } from "../level/index.ts";
import { createNextNodeLookup } from "../pathfinding/index.ts";
import {
  straightLineModel,
  theoreticalSpeed,
  type IndividualState,
  type MovementModel,
} from "./movement.ts";

export * from "./movement.ts";

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
 * T = 0 is the wave start. Fragment start = previous fragment end + fragment preDelay
 * (the wave preDelay is added before the first fragment). Fragment end = start + the max of
 * every action's (preDelay + (count - 1) x interval), non-spawn actions included. The k-th
 * individual of a spawn action spawns at fragment start + preDelay + k x interval.
 */
export function buildTimeline(level: Level, options: TimelineOptions = {}): Timeline {
  const { waveIndex = 0, movement = straightLineModel } = options;
  const wave = level.waves[waveIndex];
  if (!wave) return { individuals: [] };
  const nextNode = createNextNodeLookup(level.map);
  const individuals: Individual[] = [];
  let previousEnd = wave.preDelay;
  wave.fragments.forEach((fragment, fragmentIndex) => {
    const start = previousEnd + fragment.preDelay;
    let end = start;
    fragment.actions.forEach((action, actionIndex) => {
      end = Math.max(end, start + action.preDelay + (action.count - 1) * action.interval);
      if (action.actionType !== "SPAWN") return;
      const route = level.routes[action.routeIndex];
      const enemy = level.enemies[action.key];
      if (!route || route.motionMode === "E_NUM" || !enemy) return;
      const speed = theoreticalSpeed(enemy, level.options);
      for (let k = 0; k < action.count; k++) {
        const spawnTime = start + action.preDelay + k * action.interval;
        const trajectory = movement({ route, speed, spawnTime, fragmentStart: start, nextNode });
        individuals.push({
          id: `${fragmentIndex}-${actionIndex}-${k}`,
          enemy,
          route,
          fragmentIndex,
          actionIndex,
          spawnIndex: k,
          spawnTime,
          leakTime: trajectory.leakTime,
          stateAt: trajectory.stateAt,
        });
      }
    });
    previousEnd = end;
  });
  return { individuals };
}

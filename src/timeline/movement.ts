// 移動模型: route + theoretical speed -> where an enemy individual is at any second.
// Swappable as a whole layer; the timeline and UI only see `MovementModel`.
import {
  cellCenter,
  type EnemyRef,
  type LevelOptions,
  type Route,
  type Vec2,
} from "../level/index.ts";
import type { NextNodeLookup } from "../pathfinding/index.ts";

/** An individual's state at one second of its wave: 未出現 / 在場 / 已進點. */
export type IndividualState =
  | { kind: "pending" }
  | { kind: "onField"; position: Vec2; invisible: boolean }
  | { kind: "leaked" };

export interface MovementInput {
  route: Route;
  /** 理論移速, cells per second. */
  speed: number;
  /** 出生時刻, seconds into the wave. */
  spawnTime: number;
  /** Start of the individual's fragment, for WAIT_CURRENT_FRAGMENT_TIME. */
  fragmentStart: number;
  nextNode: NextNodeLookup;
}

export interface Trajectory {
  /** State at second `t` of the wave. */
  stateAt(t: number): IndividualState;
  /** Second the individual reaches the end point; null if it never does (patrols). */
  leakTime: number | null;
}

export type MovementModel = (input: MovementInput) => Trajectory;

/** 理論移速 = max(屬性移速, 0.1) x the level's move multiplier. */
export function theoreticalSpeed(enemy: EnemyRef, options: LevelOptions): number {
  return Math.max(enemy.moveSpeed, 0.1) * options.moveMultiplier;
}

/** v0: a straight line from the spawn point to the end cell at constant speed. */
export const straightLineModel: MovementModel = ({ route, speed, spawnTime }) => {
  const from = cellCenter(route.start);
  from.x += route.spawnOffset.x;
  from.y += route.spawnOffset.y;
  const to = cellCenter(route.end);
  const duration = Math.hypot(to.x - from.x, to.y - from.y) / speed;
  const leakTime = spawnTime + duration;
  return {
    leakTime,
    stateAt(t) {
      if (t < spawnTime) return { kind: "pending" };
      if (t >= leakTime) return { kind: "leaked" };
      const f = duration === 0 ? 1 : (t - spawnTime) / duration;
      return {
        kind: "onField",
        position: { x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f },
        invisible: false,
      };
    },
  };
};

// 移動模型: route + theoretical speed -> where an enemy individual is at any second.
// Swappable as a whole layer; the timeline and UI only see `MovementModel`.
import {
  cellCenter,
  type Cell,
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

/** 理論移速 = max(屬性移速, 0.1) x the level's move multiplier x the 難度修正 move-speed factor. */
export function theoreticalSpeed(
  enemy: EnemyRef,
  options: LevelOptions,
  modifierFactor = 1,
): number {
  return Math.max(enemy.moveSpeed, 0.1) * options.moveMultiplier * modifierFactor;
}

/**
 * v1: ground individuals walk from cell to cell along the end cell's nextNode chain, flying ones
 * fly straight. Every segment is straight, at constant speed. Checkpoints are not followed yet.
 */
export const nextNodeModel: MovementModel = ({ route, speed, spawnTime, nextNode }) => {
  const from = cellCenter(route.start);
  from.x += route.spawnOffset.x;
  from.y += route.spawnOffset.y;
  const to = cellCenter(route.end);
  if (route.motionMode === "FLY") return polyline([from, to], true, speed, spawnTime);
  const next = nextNode(route.motionMode, route.end, route.allowDiagonalMove);
  const points = [from];
  let cell = route.start;
  while (!sameCell(cell, route.end)) {
    const n = next(cell);
    if (sameCell(n, cell)) return polyline(points, false, speed, spawnTime);
    points.push(cellCenter(n));
    cell = n;
  }
  // Heading for the end cell means heading for the end point (the same until offsets exist).
  if (points.length > 1) points.pop();
  points.push(to);
  return polyline(points, true, speed, spawnTime);
};

function sameCell(a: Cell, b: Cell): boolean {
  return a.row === b.row && a.col === b.col;
}

/** Constant-speed travel along `points`; leaks at the last one if `leaks`, else stays there. */
function polyline(points: Vec2[], leaks: boolean, speed: number, spawnTime: number): Trajectory {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y));
  const duration = lengths.reduce((a, b) => a + b, 0) / speed;
  const leakTime = leaks ? spawnTime + duration : null;
  return {
    leakTime,
    stateAt(t) {
      if (t < spawnTime) return { kind: "pending" };
      if (leakTime !== null && t >= leakTime) return { kind: "leaked" };
      let left = (t - spawnTime) * speed;
      let i = 0;
      while (i < lengths.length && left >= lengths[i]!) left -= lengths[i++]!;
      const a = points[i]!;
      const b = points[i + 1] ?? a;
      const f = i < lengths.length ? left / lengths[i]! : 0;
      const position = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
      return { kind: "onField", position, invisible: false };
    },
  };
}

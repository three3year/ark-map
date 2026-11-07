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

/** A visible stand-still at a wait checkpoint, in seconds of the wave; it moves on at `end`. */
export interface Stay {
  start: number;
  end: number;
}

/**
 * An individual's state at one second of its wave: 未出現 / 在場 / 已進點. `stay` is the
 * visible wait it is in, if any; a hidden wait has none.
 */
export type IndividualState =
  | { kind: "pending" }
  | { kind: "onField"; position: Vec2; invisible: boolean; stay: Stay | null }
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

/**
 * One stretch of an individual's 路徑, timed in seconds of the wave: walking a polyline at
 * constant speed, standing still (a wait checkpoint), or teleporting (start = end).
 */
export type PathLeg =
  | { kind: "move"; start: number; end: number; points: Vec2[]; invisible: boolean }
  | { kind: "wait"; start: number; end: number; position: Vec2; invisible: boolean }
  | { kind: "teleport"; start: number; end: number; from: Vec2; to: Vec2; invisible: boolean };

export interface Trajectory {
  /** State at second `t` of the wave. */
  stateAt(t: number): IndividualState;
  /** Second the individual reaches the end point; null if it never does (patrols). */
  leakTime: number | null;
  /**
   * 路徑 left at second `t` of the wave: the legs ending after `t`, the walk it is on starting
   * where it is now; empty while 未出現, once 已進點, or once it rests at the end of its walk.
   * A patrol still gets its whole first lap and its walk back.
   */
  remainingPathAt(t: number): PathLeg[];
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

/** A leg plus which lap of a patrol and which checkpoint (-1: the end point) produced it. */
interface Step {
  leg: PathLeg;
  lap: number;
  checkpoint: number;
}

/** Where an individual stays once its walk is over without reaching the end point. */
interface Rest {
  position: Vec2;
  invisible: boolean;
}

/**
 * v1: the checkpoints in order, then the end point. Ground individuals walk from cell to cell
 * along the target cell's nextNode chain, flying ones fly straight; every segment is straight,
 * at constant speed. A route whose last checkpoint is PATROL_MOVE loops back to its first
 * checkpoint forever, so its legs are generated lazily.
 */
export const nextNodeModel: MovementModel = (input) => {
  const { route, speed, spawnTime } = input;
  const walk = walkRoute(input);
  const steps: Step[] = [];
  /** undefined while the walk goes on; null once it reached the end point. */
  let rest: Rest | null | undefined;
  /** Generates legs until one ends after `t` or the walk is over. */
  const extendPast = (t: number) => {
    while (rest === undefined && (steps.length === 0 || steps.at(-1)!.leg.end <= t)) {
      const next = walk.next();
      if (next.done) rest = next.value;
      else steps.push(next.value);
    }
  };

  if (!patrols(route)) extendPast(Infinity);
  const leakTime = rest === null ? (steps.at(-1)?.leg.end ?? spawnTime) : null;
  const pathDone = () =>
    rest !== undefined || steps.some((s) => s.lap > 1 || (s.lap === 1 && s.checkpoint > 0));
  while (!pathDone()) extendPast(steps.at(-1)?.leg.end ?? spawnTime);
  const path = steps
    .filter((s) => s.lap === 0 || (s.lap === 1 && s.checkpoint === 0))
    .map((s) => s.leg);

  return {
    leakTime,
    remainingPathAt(t) {
      if (t < spawnTime) return [];
      if (patrols(route)) return path;
      return path.flatMap((leg) => (leg.end > t ? [legFrom(leg, t, speed)] : []));
    },
    stateAt(t) {
      if (t < spawnTime) return { kind: "pending" };
      if (leakTime !== null && t >= leakTime) return { kind: "leaked" };
      extendPast(t);
      let i = steps.length - 1;
      while (i > 0 && steps[i]!.leg.start > t) i--;
      const leg = steps[i]?.leg;
      if (!leg || t >= leg.end) return { kind: "onField", ...rest!, stay: null };
      const stay =
        leg.kind === "wait" && !leg.invisible ? { start: leg.start, end: leg.end } : null;
      return {
        kind: "onField",
        position: positionOn(leg, t, speed),
        invisible: leg.invisible,
        stay,
      };
    },
  };
};

/** PATROL_MOVE switches back to the first checkpoint only from the last one, if not also first. */
function patrols(route: Route): boolean {
  return route.checkpoints.length > 1 && route.checkpoints.at(-1)!.type === "PATROL_MOVE";
}

/** Legs in order; returns where the individual rests, or null when it reaches the end point. */
function* walkRoute({
  route,
  speed,
  spawnTime,
  fragmentStart,
  nextNode,
}: MovementInput): Generator<Step, Rest | null> {
  let position = offset(cellCenter(route.start), route.spawnOffset);
  let cell = route.start;
  let now = spawnTime;
  let invisible = false;
  let lap = 0;
  let checkpoint = 0;

  /** Stands still until `until`, if that is later than now. */
  function* waitUntil(until: number): Generator<Step> {
    if (until <= now) return;
    yield { leg: { kind: "wait", start: now, end: until, position, invisible }, lap, checkpoint };
    now = until;
  }

  /** Walks to `point` in `target`; false (and stays put) when no way leads there. */
  function* moveTo(target: Cell, point: Vec2): Generator<Step, boolean> {
    const points = pathPoints(route, nextNode, position, cell, target, point);
    if (!points) return false;
    const duration = polylineLength(points) / speed;
    if (duration > 0) {
      const leg: PathLeg = { kind: "move", start: now, end: now + duration, points, invisible };
      yield { leg, lap, checkpoint };
    }
    now += duration;
    position = point;
    cell = target;
    return true;
  }

  const checkpoints = route.checkpoints;
  let lapStart = now;
  while (checkpoint < checkpoints.length) {
    const { type, time, position: target, reachOffset } = checkpoints[checkpoint]!;
    const point = offset(cellCenter(target), reachOffset);
    switch (type) {
      case "MOVE":
      case "PATROL_MOVE":
        // A checkpoint the individual cannot reach counts as done at once.
        yield* moveTo(target, point);
        break;
      case "WAIT_FOR_SECONDS":
        yield* waitUntil(now + time);
        break;
      case "WAIT_CURRENT_WAVE_TIME":
        yield* waitUntil(time);
        break;
      case "WAIT_CURRENT_FRAGMENT_TIME":
        yield* waitUntil(fragmentStart + time);
        break;
      case "DISAPPEAR":
        invisible = true;
        break;
      case "APPEAR_AT_POS":
        invisible = false;
        yield {
          leg: { kind: "teleport", start: now, end: now, from: position, to: point, invisible },
          lap,
          checkpoint,
        };
        position = point;
        cell = target;
        break;
      // Every other type completes at once.
    }
    if (checkpoint === checkpoints.length - 1 && patrols(route)) {
      // A lap that takes no time would loop forever on the spot.
      if (now === lapStart) return { position, invisible };
      lapStart = now;
      lap++;
      checkpoint = 0;
    } else {
      checkpoint++;
    }
  }
  checkpoint = -1;
  const reached = yield* moveTo(route.end, cellCenter(route.end));
  return reached ? null : { position, invisible };
}

/**
 * The corner points from `from` (in `cell`) to `point` (in `target`): straight for flying
 * routes, along `target`'s nextNode chain for ground ones; null when no way leads there.
 */
function pathPoints(
  route: Route,
  nextNode: NextNodeLookup,
  from: Vec2,
  cell: Cell,
  target: Cell,
  point: Vec2,
): Vec2[] | null {
  if (route.motionMode === "FLY") return [from, point];
  const next = nextNode(route.motionMode, target, route.allowDiagonalMove);
  const points = [from];
  while (!sameCell(cell, target)) {
    const n = next(cell);
    if (sameCell(n, cell)) return null;
    points.push(cellCenter(n));
    cell = n;
  }
  // Heading for the target cell means heading for its point (the centre plus the offset).
  if (points.length > 1) points.pop();
  points.push(point);
  return points;
}

function positionOn(leg: PathLeg, t: number, speed: number): Vec2 {
  switch (leg.kind) {
    case "wait":
      return leg.position;
    case "teleport":
      return leg.to;
    case "move":
      return pointsAhead(leg, t, speed)[0]!;
  }
}

/** The part of `leg` left from second `t`: a walk cut where the individual is; else as is. */
function legFrom(leg: PathLeg, t: number, speed: number): PathLeg {
  if (leg.kind !== "move" || t <= leg.start) return leg;
  return { ...leg, start: t, points: pointsAhead(leg, t, speed) };
}

/** The walk's polyline from where the individual is at `t` to its end. */
function pointsAhead(leg: PathLeg & { kind: "move" }, t: number, speed: number): Vec2[] {
  let left = (t - leg.start) * speed;
  const { points } = leg;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const length = distance(a, b);
    if (left < length) {
      const f = left / length;
      return [{ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }, ...points.slice(i)];
    }
    left -= length;
  }
  return [points.at(-1)!];
}

function offset(p: Vec2, by: Vec2): Vec2 {
  return { x: p.x + by.x, y: p.y + by.y };
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function polylineLength(points: Vec2[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += distance(points[i - 1]!, points[i]!);
  return length;
}

function sameCell(a: Cell, b: Cell): boolean {
  return a.row === b.row && a.col === b.col;
}

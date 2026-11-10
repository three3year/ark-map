// 基準時間軸: level model -> every enemy individual's trajectory; 時刻快照 = its value at T.
// Pure; no DOM or network.
import {
  cellKey,
  isWalkable,
  moveSpeedFactor,
  tileAt,
  variantModifiers,
  type Difficulty,
  type Level,
  type Vec2,
} from "../level/index.ts";
import { createNextNodeLookup, type NextNodeLookup } from "../pathfinding/index.ts";
import {
  devicePresence,
  presenceChanges,
  presentAt,
  removedAt,
  type DevicePresence,
  type Removals,
} from "./devices.ts";
import {
  nextNodeModel,
  theoreticalSpeed,
  type MovementModel,
  type NextNodeSegment,
  type Stay,
} from "./movement.ts";
import { individualKey, type IndividualId } from "./identity.ts";
import { waveSpawns } from "./schedule.ts";
import { spawnPlan, type SpawnSwitches } from "./switches.ts";
import type { Individual, Timeline } from "./types.ts";

export type { RemovalMoment, Removals } from "./devices.ts";
export * from "./endpoints.ts";
export * from "./identity.ts";
export * from "./movement.ts";
export * from "./spawnTable.ts";
export * from "./switches.ts";
export type * from "./types.ts";

export interface TimelineOptions {
  waveIndex?: number;
  /** The variant's difficulty; picks which 難度修正 apply. Default NORMAL. */
  difficulty?: Difficulty;
  /** 開關狀態 (隱藏組, 隨機出兵組, 條件出兵); parts left out take the variant's default. */
  switches?: SpawnSwitches;
  /** 移除時刻 of the 擋路裝置 the user removed; none by default. */
  removals?: Removals;
  movement?: MovementModel;
}

export interface Snapshot {
  onField: { individual: Individual; position: Vec2; invisible: boolean; stay: Stay | null }[];
  counts: { pending: number; onField: number; leaked: number };
}

export function takeSnapshot(timeline: Timeline, t: number): Snapshot {
  const snapshot: Snapshot = { onField: [], counts: { pending: 0, onField: 0, leaked: 0 } };
  for (const individual of timeline.individuals) {
    const state = individual.stateAt(t);
    snapshot.counts[state.kind]++;
    if (state.kind === "onField") {
      const { position, invisible, stay } = state;
      snapshot.onField.push({ individual, position, invisible, stay });
    }
  }
  return snapshot;
}

/** 空波次: the wave spawns no enemy individual. */
export const isEmptyWave = (timeline: Timeline): boolean => timeline.individuals.length === 0;

/** Last second anything happens: the latest leak, or the latest spawn when nothing leaks. */
export function timelineEnd(timeline: Timeline): number {
  let end = 0;
  for (const i of timeline.individuals) end = Math.max(end, i.leakTime ?? i.spawnTime);
  return end;
}

/**
 * Every individual of one wave, spawned by {@link waveSpawns}, and the 裝置 on the field; T = 0 is
 * the wave start and earlier waves count as cleared.
 */
export function buildTimeline(level: Level, options: TimelineOptions = {}): Timeline {
  const {
    waveIndex = 0,
    difficulty = "NORMAL",
    switches = {},
    removals = new Map(),
    movement = nextNodeModel,
  } = options;
  if (!level.waves[waveIndex]) return { individuals: [], devicesAt: () => [], removedAt: () => [] };
  const modifiers = variantModifiers(level.modifiers, difficulty);
  const devices = devicePresence(level, modifiers, waveIndex, removals);
  const nextNode = nextNodeSegments(level, devices);
  const individuals: Individual[] = [];
  for (const { action, ref, fragmentStart, start, picked } of waveSpawns(
    level,
    spawnPlan(level, difficulty, switches),
    waveIndex,
  )) {
    if (!picked) continue;
    const route = (ref.branchIndex === null ? level.routes : level.extraRoutes)[action.routeIndex];
    const enemy = level.enemies[action.key];
    if (!route || route.motionMode === "E_NUM" || !enemy) continue;
    const speed = theoreticalSpeed(enemy, level.options, moveSpeedFactor(modifiers, enemy.id));
    for (let k = 0; k < action.count; k++) {
      const spawnTime = start + k * action.interval;
      const trajectory = movement({ route, speed, spawnTime, fragmentStart, nextNode });
      const id: IndividualId = {
        branchIndex: ref.branchIndex,
        fragmentIndex: ref.fragmentIndex,
        actionIndex: ref.actionIndex,
        spawnIndex: k,
      };
      individuals.push({
        ...id,
        id: individualKey(id),
        enemy,
        route,
        spawnTime,
        harmless: action.harmless,
        leakTime: trajectory.leakTime,
        remainingPathAt: trajectory.remainingPathAt,
        stateAt: trajectory.stateAt,
      });
    }
  }
  return {
    individuals,
    devicesAt: (t) => devices.filter((d) => presentAt(d, t)).map((d) => d.device),
    removedAt: (t) => devices.filter((d) => removedAt(d, t)).map((d) => d.device),
  };
}

/**
 * The wave's nextNode tables by second: a new segment wherever the 擋路格 change, the cells of
 * the 擋路裝置 on the field. One on ground that cannot be walked changes no way, so is left out.
 */
function nextNodeSegments(level: Level, devices: DevicePresence[]): NextNodeSegment[] {
  const lookup = createNextNodeLookup(level.map);
  const blocking = devices.filter((d) => {
    const tile = tileAt(level.map, d.device.cell);
    return d.device.blocker && tile !== undefined && isWalkable(tile);
  });
  const segments: (NextNodeSegment & { key: string })[] = [];
  for (const from of presenceChanges(blocking)) {
    const cells = blocking.filter((d) => presentAt(d, from)).map((d) => cellKey(d.device.cell));
    const blockers = new Set(cells);
    const key = [...blockers].sort().join(";");
    if (segments.at(-1)?.key === key) continue;
    const nextNode: NextNodeLookup = (mode, target, diagonal) =>
      lookup(mode, target, diagonal, blockers);
    segments.push({ from, nextNode, key });
  }
  return segments;
}

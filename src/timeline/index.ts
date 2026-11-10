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
import { blockersKey, createNextNodeLookup, type NextNodeLookup } from "../pathfinding/index.ts";
import {
  devicePresence,
  presenceChanges,
  presentAt,
  removedAt,
  type DevicePresence,
  type Removals,
} from "./devices.ts";
import { nextNodeModel, theoreticalSpeed, type MovementModel, type Stay } from "./movement.ts";
import { individualKey, type IndividualId } from "./identity.ts";
import { waveSpawns } from "./schedule.ts";
import type { Stepwise } from "./stepwise.ts";
import { spawnPlan, type SpawnSwitches } from "./switches.ts";
import type { Individual, Timeline } from "./types.ts";

export {
  removalToggle,
  toggleRemoval,
  type RemovalMoment,
  type RemovalToggle,
  type Removals,
} from "./devices.ts";
export * from "./endpoints.ts";
export * from "./identity.ts";
export * from "./movement.ts";
export * from "./spawnTable.ts";
export type * from "./stepwise.ts";
export * from "./switches.ts";
export type * from "./types.ts";

export interface TimelineOptions {
  waveIndex?: number;
  /** The variant's difficulty; picks which 難度修正 apply. Default NORMAL. */
  difficulty?: Difficulty;
  /** 開關狀態 (隱藏組, 隨機出兵組, 條件出兵); parts left out take the variant's default. */
  switches?: SpawnSwitches;
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
 * Every individual of one wave, spawned by {@link waveSpawns}; T = 0 is the wave start and
 * earlier waves count as cleared.
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
  const plan = spawnPlan(level, difficulty, switches);
  const devices = devicePresence(level, modifiers, plan, waveIndex, removals);
  const nextNode = nextNodeOverTime(level, devices);
  const individuals: Individual[] = [];
  for (const { action, ref, fragmentStart, start, picked } of waveSpawns(level, plan, waveIndex)) {
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
    devicesAt: (t) =>
      devices.filter((d) => presentAt(d, t)).map(({ index, device }) => ({ index, device })),
    removedAt: (t) =>
      devices.filter((d) => removedAt(d, t)).map(({ index, device }) => ({ index, device })),
  };
}

function nextNodeOverTime(level: Level, devices: DevicePresence[]): Stepwise<NextNodeLookup> {
  const lookup = createNextNodeLookup(level.map);
  const blocking = devices.filter((d) => {
    const tile = tileAt(level.map, d.device.cell);
    return d.device.blocker && tile !== undefined && isWalkable(tile);
  });
  const blockersAt = (t: number) =>
    new Set(blocking.filter((d) => presentAt(d, t)).map((d) => cellKey(d.device.cell)));
  const avoiding =
    (blockers: ReadonlySet<string>): NextNodeLookup =>
    (mode, target, diagonal) =>
      lookup(mode, target, diagonal, blockers);
  const initial = blockersAt(0);
  const nextNode: Stepwise<NextNodeLookup> = { initial: avoiding(initial), changes: [] };
  let key = blockersKey(initial);
  for (const from of presenceChanges(blocking)) {
    const blockers = blockersAt(from);
    const changed = blockersKey(blockers);
    if (changed === key) continue;
    key = changed;
    nextNode.changes.push({ from, value: avoiding(blockers) });
  }
  return nextNode;
}

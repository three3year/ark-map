// 基準時間軸: level model -> every enemy individual's trajectory; 時刻快照 = its value at T.
// Pure; no DOM or network.
import {
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
import { individualKey, type IndividualId } from "./identity.ts";
import { waveSpawns } from "./schedule.ts";
import { spawnPlan, type SpawnSwitches } from "./switches.ts";

export * from "./identity.ts";
export * from "./movement.ts";
export * from "./spawnTable.ts";
export * from "./switches.ts";

export interface Individual extends IndividualId {
  /** {@link individualKey}: stable within a timeline. */
  id: string;
  enemy: EnemyRef;
  route: Route;
  spawnTime: number;
  /** 無害敵人: counts as killed, never a threat. */
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
  /** 開關狀態 (隱藏組, 隨機出兵組, 條件出兵); parts left out take the variant's default. */
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
 * Every individual of one wave, spawned by {@link waveSpawns}; T = 0 is the wave start and
 * earlier waves count as cleared.
 */
export function buildTimeline(level: Level, options: TimelineOptions = {}): Timeline {
  const { waveIndex = 0, difficulty = "NORMAL", switches = {}, movement = nextNodeModel } = options;
  if (!level.waves[waveIndex]) return { individuals: [] };
  const nextNode = createNextNodeLookup(level.map);
  const modifiers = variantModifiers(level.modifiers, difficulty);
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
        path: trajectory.path,
        stateAt: trajectory.stateAt,
      });
    }
  }
  return { individuals };
}

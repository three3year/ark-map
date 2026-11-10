import { isSpawn, type Action, type Level, type Wave } from "../level/index.ts";
import type { ActionRef, SpawnPlan } from "./switches.ts";

export interface ScheduledAction {
  action: Action;
  fragmentIndex: number;
  actionIndex: number;
  /** Seconds into the wave at which the action's fragment starts. */
  fragmentStart: number;
  /** Seconds into the wave of the action's first individual: fragment start + preDelay. */
  start: number;
}

export interface WaveSchedule {
  /** Every action, spawn or not, in level-file order. */
  actions: ScheduledAction[];
  /** Seconds into the wave at which the last fragment ends (the wave preDelay included). */
  end: number;
}

/**
 * T = 0 is the wave start. Fragment start = previous fragment end + fragment preDelay
 * (the wave preDelay is added before the first fragment). Fragment end = start + the max of
 * every action's (preDelay + (count - 1) x interval), non-spawn actions included. The k-th
 * individual of an action spawns at fragment start + preDelay + k x interval.
 */
export function scheduleWave(wave: Pick<Wave, "preDelay" | "fragments">): WaveSchedule {
  const actions: ScheduledAction[] = [];
  let previousEnd = wave.preDelay;
  wave.fragments.forEach((fragment, fragmentIndex) => {
    const fragmentStart = previousEnd + fragment.preDelay;
    let end = fragmentStart;
    fragment.actions.forEach((action, actionIndex) => {
      const start = fragmentStart + action.preDelay;
      end = Math.max(end, start + (action.count - 1) * action.interval);
      actions.push({ action, fragmentIndex, actionIndex, fragmentStart, start });
    });
    previousEnd = end;
  });
  return { actions, end: previousEnd };
}

export interface PlacedAction {
  action: Action;
  ref: ActionRef;
  fragmentStart: number;
  start: number;
  picked: boolean;
}

export function waveActions(level: Level, plan: SpawnPlan, waveIndex: number): PlacedAction[] {
  const wave = level.waves[waveIndex];
  if (!wave) return [];
  const placed: PlacedAction[] = [];
  const place = (schedule: WaveSchedule, offset: number, at: (s: ScheduledAction) => ActionRef) => {
    for (const s of schedule.actions) {
      const { hiddenGroup } = s.action;
      if (hiddenGroup !== null && !plan.hiddenOn.has(hiddenGroup)) continue;
      const ref = at(s);
      placed.push({
        action: s.action,
        ref,
        fragmentStart: offset + s.fragmentStart,
        start: offset + s.start,
        picked: plan.picked(ref),
      });
    }
  };
  place(scheduleWave(wave), 0, ({ fragmentIndex, actionIndex }) => ({
    branchIndex: null,
    waveIndex,
    fragmentIndex,
    actionIndex,
  }));
  for (const [index, trigger] of Object.entries(plan.conditional)) {
    const branchIndex = Number(index);
    const branch = level.branches[branchIndex];
    if (!branch || trigger.wave !== waveIndex) continue;
    const schedule = scheduleWave({ preDelay: 0, fragments: branch.phases });
    place(schedule, trigger.t, ({ fragmentIndex, actionIndex }) => ({
      branchIndex,
      fragmentIndex,
      actionIndex,
    }));
  }
  return placed;
}

export const waveSpawns = (level: Level, plan: SpawnPlan, waveIndex: number): PlacedAction[] =>
  waveActions(level, plan, waveIndex).filter((a) => isSpawn(a.action));

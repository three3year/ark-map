import type { Action, Wave } from "../level/index.ts";

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
export function scheduleWave(wave: Wave): WaveSchedule {
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

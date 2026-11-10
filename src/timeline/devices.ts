// When each 裝置 is on the field in one wave. Pure; no DOM or network.
import type { Device, Level, Modifier } from "../level/index.ts";
import { waveActions } from "./schedule.ts";
import type { SpawnPlan } from "./switches.ts";

/** From second `from` of the wave on, the device is on the field or not, until the next run. */
export interface PresenceRun {
  from: number;
  present: boolean;
}

/** 移除時刻: second `t` of wave `wave` (0-based); from then on the device is gone for good. */
export interface RemovalMoment {
  wave: number;
  t: number;
}

/** 移除時刻 by device: the key is the device's index in `level.devices` (aliases repeat). */
export type Removals = ReadonlyMap<number, RemovalMoment>;

/**
 * One device's runs in one wave, ordered by `from`; the first starts at 0. From `removedFrom` on,
 * if not null, it is removed: off the field whatever its runs say.
 */
export interface DevicePresence {
  device: Device;
  runs: PresenceRun[];
  removedFrom: number | null;
}

/**
 * Whether each alias is on the field when the battle starts, as the variant's
 * `level_predefines_enable` sets it: each blackboard key is an alias, value 1 puts it on, 0 takes
 * it off. In the level files, value 1 names only hidden devices and 0 only shown ones.
 */
function startOverrides(modifiers: Modifier[]): Map<string, boolean> {
  const on = new Map<string, boolean>();
  for (const m of modifiers) {
    if (m.key !== "level_predefines_enable") continue;
    for (const { key, value } of m.blackboard) on.set(key, value !== 0);
  }
  return on;
}

/** A device action that took effect: devices with `alias` come on, or go off from the next wave. */
interface DeviceEvent {
  alias: string;
  activate: boolean;
  /** Seconds into the wave. */
  at: number;
}

/**
 * The device actions that take effect in wave `waveIndex`, by time: those of the wave and of the
 * 條件出兵 switched on in it, whose 隱藏組 is on and that are in no 隨機出兵組 or in its picked
 * candidate. A 純機關 cannot be switched on, so its actions never take effect.
 */
function deviceEvents(level: Level, plan: SpawnPlan, waveIndex: number): DeviceEvent[] {
  return waveActions(level, plan, waveIndex)
    .flatMap(({ action, ref, start, picked }): DeviceEvent[] => {
      if (!picked || (ref.branchIndex !== null && level.branches[ref.branchIndex]!.deviceOnly)) {
        return [];
      }
      if (action.actionType === "ACTIVATE_PREDEFINED") {
        return [{ alias: action.key, activate: true, at: start }];
      }
      if (action.actionType === "WITHDRAW_PREDEFINED") {
        return [{ alias: action.key, activate: false, at: start }];
      }
      return [];
    })
    .sort((x, y) => x.at - y.at);
}

/**
 * Each device's presence in wave `waveIndex`, in level-file order. When the battle starts a device
 * is on the field unless it starts hidden, and the variant's 難度修正 may switch it either way.
 * Each wave's activations put it on from the second they run, its withdrawals take it off from
 * the next wave; activating a device on the field does nothing. A 移除時刻 in an earlier wave
 * removes it all wave; one in this wave, from that second. Removal is final: activations after it
 * do not bring the device back.
 */
export function devicePresence(
  level: Level,
  modifiers: Modifier[],
  plan: SpawnPlan,
  waveIndex: number,
  removals: Removals,
): DevicePresence[] {
  const overrides = startOverrides(modifiers);
  const on = level.devices.map((d) => overrides.get(d.alias) ?? !d.hidden);
  const named = (alias: string) => level.devices.flatMap((d, i) => (d.alias === alias ? [i] : []));
  for (let w = 0; w < waveIndex; w++) {
    for (const { alias, activate } of deviceEvents(level, plan, w)) {
      for (const i of named(alias)) on[i] = activate;
    }
  }
  const runs = on.map((present): PresenceRun[] => [{ from: 0, present }]);
  for (const { alias, activate, at } of deviceEvents(level, plan, waveIndex)) {
    if (!activate) continue;
    for (const i of named(alias)) {
      if (!runs[i]!.at(-1)!.present) runs[i]!.push({ from: at, present: true });
    }
  }
  return level.devices.map((device, i) => {
    const removal = removals.get(i);
    const removedFrom =
      !removal || removal.wave > waveIndex ? null : removal.wave < waveIndex ? 0 : removal.t;
    return { device, runs: runs[i]!, removedFrom };
  });
}

/** Whether the device would be on the field at second `t` were it not removed, by its runs. */
function runsAt({ runs }: DevicePresence, t: number): boolean {
  let present = false;
  for (const run of runs) {
    if (run.from > t) break;
    present = run.present;
  }
  return present;
}

const removedBy = ({ removedFrom }: DevicePresence, t: number) =>
  removedFrom !== null && t >= removedFrom;

/** Whether the device is on the field at second `t`. */
export function presentAt(presence: DevicePresence, t: number): boolean {
  return runsAt(presence, t) && !removedBy(presence, t);
}

/** Whether the device is off the field at second `t` only because it has been removed. */
export function removedAt(presence: DevicePresence, t: number): boolean {
  return runsAt(presence, t) && removedBy(presence, t);
}

/** Every second of the wave at which some device may come on or go off, 0 first. */
export function presenceChanges(devices: DevicePresence[]): number[] {
  const seconds = devices.flatMap((d) => [
    ...d.runs.map((r) => r.from),
    ...(d.removedFrom === null ? [] : [d.removedFrom]),
  ]);
  return [...new Set([0, ...seconds])].sort((a, b) => a - b);
}

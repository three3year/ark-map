// When each 裝置 is on the field in one wave. Pure; no DOM or network.
import type { Device, Level, Modifier } from "../level/index.ts";

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

/**
 * Each device's presence in wave `waveIndex`, in level-file order. A device is on the field at the
 * start unless it starts hidden, and the variant's 難度修正 may switch it either way. Wave and
 * 條件出兵 activation and withdrawal are not modelled yet: a device keeps its start state all wave.
 * A 移除時刻 in an earlier wave removes it all wave; one in this wave, from that second.
 */
export function devicePresence(
  level: Level,
  modifiers: Modifier[],
  waveIndex: number,
  removals: Removals,
): DevicePresence[] {
  const overrides = startOverrides(modifiers);
  return level.devices.map((device, i) => {
    const removal = removals.get(i);
    const removedFrom =
      !removal || removal.wave > waveIndex ? null : removal.wave < waveIndex ? 0 : removal.t;
    return {
      device,
      runs: [{ from: 0, present: overrides.get(device.alias) ?? !device.hidden }],
      removedFrom,
    };
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

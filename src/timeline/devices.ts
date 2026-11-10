// When each 裝置 is on the field in one wave. Pure; no DOM or network.
import type { Device, Level, Modifier } from "../level/index.ts";

/** From second `from` of the wave on, the device is on the field or not, until the next run. */
export interface PresenceRun {
  from: number;
  present: boolean;
}

/** One device's runs in one wave, ordered by `from`; the first starts at 0. */
export interface DevicePresence {
  device: Device;
  runs: PresenceRun[];
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
 * Each device's presence in one wave, in level-file order. A device is on the field at the start
 * unless it starts hidden, and the variant's 難度修正 may switch it either way. Wave and 條件出兵
 * activation and withdrawal are not modelled yet: a device keeps its start state all wave.
 */
export function devicePresence(level: Level, modifiers: Modifier[]): DevicePresence[] {
  const overrides = startOverrides(modifiers);
  return level.devices.map((device) => ({
    device,
    runs: [{ from: 0, present: overrides.get(device.alias) ?? !device.hidden }],
  }));
}

/** Whether the device is on the field at second `t`, by its runs. */
export function presentAt({ runs }: DevicePresence, t: number): boolean {
  let present = false;
  for (const run of runs) {
    if (run.from > t) break;
    present = run.present;
  }
  return present;
}

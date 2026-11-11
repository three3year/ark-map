import {
  deviceActionKind,
  indexedDevices,
  type Device,
  type DeviceIndex,
  type Level,
  type Modifier,
} from "../level/index.ts";
import { waveActions } from "./schedule.ts";
import { valueAt, type Stepwise } from "./stepwise.ts";
import type { SpawnPlan } from "./switches.ts";

export interface RemovalMoment {
  wave: number;
  t: number;
}

export type Removals = ReadonlyMap<DeviceIndex, RemovalMoment>;

export interface DevicePresence {
  index: DeviceIndex;
  device: Device;
  /** On the field or not, before any 移除. */
  presence: Stepwise<boolean>;
  removedFrom: number | null;
}

function startOverrides(modifiers: Modifier[]): Map<string, boolean> {
  const on = new Map<string, boolean>();
  for (const m of modifiers) {
    if (m.key !== "level_predefines_enable") continue;
    for (const { key, value } of m.blackboard) on.set(key, value !== 0);
  }
  return on;
}

interface DeviceEvent {
  alias: string;
  present: boolean;
  /** Second of the wave the action runs. */
  at: number;
  /** An activation shows from `at`; a withdrawal only from the next wave. */
  shows: "fromAt" | "nextWave";
}

function deviceEvents(level: Level, plan: SpawnPlan, waveIndex: number): DeviceEvent[] {
  return waveActions(level, plan, waveIndex)
    .flatMap(({ action, start, picked }): DeviceEvent[] => {
      const kind = deviceActionKind(action);
      if (!picked || kind === null) return [];
      return kind === "activate"
        ? [{ alias: action.key, present: true, at: start, shows: "fromAt" }]
        : [{ alias: action.key, present: false, at: start, shows: "nextWave" }];
    })
    .sort((x, y) => x.at - y.at);
}

export function devicePresence(
  level: Level,
  modifiers: Modifier[],
  plan: SpawnPlan,
  waveIndex: number,
  removals: Removals,
): DevicePresence[] {
  const overrides = startOverrides(modifiers);
  const on = level.devices.map(
    (d) => (d.alias === null ? undefined : overrides.get(d.alias)) ?? !d.hidden,
  );
  const named = (alias: string) => level.devices.flatMap((d, i) => (d.alias === alias ? [i] : []));
  for (let w = 0; w < waveIndex; w++) {
    for (const { alias, present } of deviceEvents(level, plan, w)) {
      for (const i of named(alias)) on[i] = present;
    }
  }
  const presence = on.map((initial): Stepwise<boolean> => ({ initial, changes: [] }));
  for (const { alias, present, at, shows } of deviceEvents(level, plan, waveIndex)) {
    if (shows === "nextWave") continue;
    for (const i of named(alias)) {
      if (valueAt(presence[i]!, at) !== present) {
        presence[i]!.changes.push({ from: at, value: present });
      }
    }
  }
  return indexedDevices(level).map(({ index, device }) => {
    const removal = removals.get(index);
    const removedFrom =
      !removal || removal.wave > waveIndex ? null : removal.wave < waveIndex ? 0 : removal.t;
    return { index, device, presence: presence[index]!, removedFrom };
  });
}

const removedBy = ({ removedFrom }: DevicePresence, t: number) =>
  removedFrom !== null && t >= removedFrom;

export function presentAt(device: DevicePresence, t: number): boolean {
  return valueAt(device.presence, t) && !removedBy(device, t);
}

export function removedAt(device: DevicePresence, t: number): boolean {
  return valueAt(device.presence, t) && removedBy(device, t);
}

/** On the field or removed at some second of the wave. */
export function listedSometime(device: DevicePresence): boolean {
  return device.presence.initial || device.presence.changes.some((c) => c.value);
}

export function presenceChanges(devices: DevicePresence[]): number[] {
  const seconds = devices.flatMap((d) => [
    ...d.presence.changes.map((c) => c.from),
    ...(d.removedFrom === null ? [] : [d.removedFrom]),
  ]);
  return [...new Set([0, ...seconds])].sort((a, b) => a - b);
}

/**
 * What toggling a device's 移除 at `now` does: remove it from `now` when it has no 移除時刻, move
 * its 移除時刻 to `now` when that is earlier, else put it back.
 */
export type RemovalToggle = "remove" | "move" | "restore";

const before = (a: RemovalMoment, b: RemovalMoment) =>
  a.wave < b.wave || (a.wave === b.wave && a.t < b.t);

export function removalToggle(
  removals: Removals,
  index: DeviceIndex,
  now: RemovalMoment,
): RemovalToggle {
  const moment = removals.get(index);
  if (moment === undefined) return "remove";
  return before(now, moment) ? "move" : "restore";
}

export function toggleRemoval(
  removals: Removals,
  index: DeviceIndex,
  now: RemovalMoment,
): Removals {
  const others = [...removals].filter(([i]) => i !== index);
  if (removalToggle(removals, index, now) === "restore") return new Map(others);
  return new Map([...others, [index, now]]);
}

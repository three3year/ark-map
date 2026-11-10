import type { Device, Level, Modifier } from "../level/index.ts";
import { waveActions } from "./schedule.ts";
import type { SpawnPlan } from "./switches.ts";

export interface PresenceRun {
  from: number;
  present: boolean;
}

export interface RemovalMoment {
  wave: number;
  t: number;
}

export type Removals = ReadonlyMap<number, RemovalMoment>;

export interface DevicePresence {
  device: Device;
  runs: PresenceRun[];
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
  activate: boolean;
  at: number;
}

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

export function presentAt(presence: DevicePresence, t: number): boolean {
  return runsAt(presence, t) && !removedBy(presence, t);
}

export function removedAt(presence: DevicePresence, t: number): boolean {
  return runsAt(presence, t) && removedBy(presence, t);
}

export function presenceChanges(devices: DevicePresence[]): number[] {
  const seconds = devices.flatMap((d) => [
    ...d.runs.map((r) => r.from),
    ...(d.removedFrom === null ? [] : [d.removedFrom]),
  ]);
  return [...new Set([0, ...seconds])].sort((a, b) => a - b);
}

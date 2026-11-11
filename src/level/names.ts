// 名稱表: one site file (data/names.json) of enemy display names and the 地形表, so level files
// need not repeat them. A level file keeps an enemy's name only when it differs from the table's.
import type { Device, EnemyRef, HiddenGroupSource, Level } from "./types.ts";

/** A 地形 as the game's stage table describes it. */
export interface TerrainInfo {
  name: string;
  description: string;
  /** The game's `isFunctional`: the terrain does something beyond height and placement. */
  functional: boolean;
}

/** 地形表: `tileKey` -> TW entry, else CN; keys neither server names are absent. */
export type TerrainTable = Record<string, TerrainInfo>;

export interface DeviceInfo {
  name: string;
  description: string | null;
}

export type SourceInfo = Pick<HiddenGroupSource, "name" | "kind">;

export interface NameTable {
  /** Enemy id -> TW handbook name, else the CN database's name. */
  enemies: Record<string, string>;
  terrain: TerrainTable;
  devices: Record<string, DeviceInfo>;
  /** 隱藏組來源 item id -> TW name and kind, else CN. */
  sources: Record<string, SourceInfo>;
}

/** An 敵人 as written to a level file: `name` only when the name table lacks it or differs. */
export type EnemyFile = Omit<EnemyRef, "name"> & { name?: string };

export type DeviceFile = Omit<Device, "name" | "description"> & Partial<DeviceInfo>;

export type HiddenGroupSourceFile = Omit<HiddenGroupSource, "name" | "kind"> & Partial<SourceInfo>;

/** A level as written to the site. */
export type LevelFile = Omit<Level, "enemies" | "devices" | "hiddenGroupSources"> & {
  enemies: Record<string, EnemyFile>;
  devices: DeviceFile[];
  hiddenGroupSources: Record<string, HiddenGroupSourceFile[]>;
};

function mapValues<T, U>(record: Record<string, T>, fn: (value: T) => U): Record<string, U> {
  return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, fn(v)]));
}

/** `level` with every enemy name the table gives left out. */
export function withoutNames(level: Level, names: NameTable): LevelFile {
  const enemies = Object.fromEntries(
    Object.entries(level.enemies).map(([id, { name, ...enemy }]) => [
      id,
      names.enemies[id] === name ? enemy : { ...enemy, name },
    ]),
  );
  const devices = level.devices.map(({ name, description, ...device }): DeviceFile => {
    const info = names.devices[device.key];
    return {
      ...device,
      ...(info?.name === name ? {} : { name }),
      ...(info?.description === description ? {} : { description }),
    };
  });
  const hiddenGroupSources = mapValues(level.hiddenGroupSources, (sources) =>
    sources.map(({ name, kind, ...source }): HiddenGroupSourceFile => {
      const info = names.sources[source.item];
      return {
        ...source,
        ...(info?.name === name ? {} : { name }),
        ...(info?.kind === kind ? {} : { kind }),
      };
    }),
  );
  return { ...level, enemies, devices, hiddenGroupSources };
}

/** The level a level file describes, names filled in from the table. */
export function withNames(file: LevelFile, names: NameTable): Level {
  const enemies = Object.fromEntries(
    Object.entries(file.enemies).map(([id, enemy]) => [
      id,
      { ...enemy, name: enemy.name ?? names.enemies[id] ?? id },
    ]),
  );
  const devices = file.devices.map(({ name, description, ...device }): Device => {
    const info = names.devices[device.key];
    return {
      ...device,
      name: name ?? info?.name ?? device.key,
      description: description !== undefined ? description : (info?.description ?? null),
    };
  });
  const hiddenGroupSources = mapValues(file.hiddenGroupSources, (sources) =>
    sources.map(({ name, kind, ...source }): HiddenGroupSource => {
      const info = names.sources[source.item];
      return { ...source, name: name ?? info?.name ?? source.item, kind: kind ?? info?.kind ?? "" };
    }),
  );
  return { ...file, enemies, devices, hiddenGroupSources };
}

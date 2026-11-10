// 名稱表: one site file (data/names.json) of enemy display names, the 地形表 and 裝置 names and
// descriptions, so level files need not repeat them. A level file keeps an enemy's or a device's
// name (or description) only when it differs from the table's.
import type { Device, EnemyRef, Level } from "./types.ts";

/** A 地形 as the game's stage table describes it. */
export interface TerrainInfo {
  name: string;
  description: string;
  /** The game's `isFunctional`: the terrain does something beyond height and placement. */
  functional: boolean;
}

/** 地形表: `tileKey` -> TW entry, else CN; keys neither server names are absent. */
export type TerrainTable = Record<string, TerrainInfo>;

/** A 裝置 kind as the game's character table describes it. */
export interface DeviceInfo {
  name: string;
  /** Rich-text markup removed; null when the game gives none. */
  description: string | null;
}

export interface NameTable {
  /** Enemy id -> TW handbook name, else the CN database's name. */
  enemies: Record<string, string>;
  terrain: TerrainTable;
  /** Device key -> TW character-table entry, else CN; keys neither server has are absent. */
  devices: Record<string, DeviceInfo>;
}

/** An 敵人 as written to a level file: `name` only when the name table lacks it or differs. */
export type EnemyFile = Omit<EnemyRef, "name"> & { name?: string };

/** A 裝置 as written to a level file: `name` and `description` only when they differ from the table. */
export type DeviceFile = Omit<Device, "name" | "description"> & Partial<DeviceInfo>;

/** A level as written to the site. */
export type LevelFile = Omit<Level, "enemies" | "devices"> & {
  enemies: Record<string, EnemyFile>;
  devices: DeviceFile[];
};

/** `level` with every enemy name, and device name and description, the table gives left out. */
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
  return { ...level, enemies, devices };
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
  return { ...file, enemies, devices };
}

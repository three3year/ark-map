// 名稱表: one site file (data/names.json) of enemy display names and the 地形表, so level files
// need not repeat them. A level file keeps an enemy's name only when it differs from the table's.
import type { EnemyRef, Level } from "./types.ts";

/** A 地形 as the game's stage table describes it. */
export interface TerrainInfo {
  name: string;
  description: string;
  /** The game's `isFunctional`: the terrain does something beyond height and placement. */
  functional: boolean;
}

export interface NameTable {
  /** Enemy id -> TW handbook name, else the CN database's name. */
  enemies: Record<string, string>;
  /** 地形表: `tileKey` -> TW entry, else CN; keys neither server names are absent. */
  terrain: Record<string, TerrainInfo>;
}

/** An 敵人 as written to a level file: `name` only when the name table lacks it or differs. */
export type EnemyFile = Omit<EnemyRef, "name"> & { name?: string };

/** A level as written to the site. */
export type LevelFile = Omit<Level, "enemies"> & { enemies: Record<string, EnemyFile> };

/** `level` with every enemy name the table gives left out. */
export function withoutNames(level: Level, names: NameTable): LevelFile {
  const enemies = Object.fromEntries(
    Object.entries(level.enemies).map(([id, { name, ...enemy }]) => [
      id,
      names.enemies[id] === name ? enemy : { ...enemy, name },
    ]),
  );
  return { ...level, enemies };
}

/** The level a level file describes, names filled in from the table. */
export function withNames(file: LevelFile, names: NameTable): Level {
  const enemies = Object.fromEntries(
    Object.entries(file.enemies).map(([id, enemy]) => [
      id,
      { ...enemy, name: enemy.name ?? names.enemies[id] ?? id },
    ]),
  );
  return { ...file, enemies };
}

// Loads the raw game-data fixtures (copies of real upstream files, refreshed with
// `pnpm fixtures`) and runs them through the pipeline's conversion.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildEnemyCatalog, convertLevel } from "../pipeline/convertLevel.ts";
import type { RawEnemyDatabase, RawEnemyHandbookTable, RawLevel } from "../pipeline/raw.ts";
import type { Level } from "../src/level/index.ts";

const rawDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "raw");

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(path.join(rawDir, file), "utf8")) as T;
}

/** A fresh copy of a raw level fixture, e.g. `rawFixture("level_main_01-07")`. */
export function rawFixture(name: string): RawLevel {
  return readJson<RawLevel>(`${name}.json`);
}

export function rawEnemyDatabase(): RawEnemyDatabase {
  return readJson<RawEnemyDatabase>("enemy_database.json");
}

export function rawEnemyHandbook(): RawEnemyHandbookTable {
  return readJson<RawEnemyHandbookTable>("enemy_handbook_table.tw.json");
}

export function convertFixture(raw: RawLevel, levelId = "fixture"): Level {
  return convertLevel(levelId, raw, buildEnemyCatalog(rawEnemyDatabase(), rawEnemyHandbook()));
}

export function loadFixtureLevel(name: string): Level {
  return convertFixture(rawFixture(name), name);
}

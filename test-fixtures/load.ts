// Loads the raw game-data fixtures (copies of real upstream files, refreshed with
// `pnpm fixtures`) and runs them through the pipeline's conversion.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildDeviceCatalog,
  buildEnemyCatalog,
  controllerKeys,
  convertLevel,
  type DeviceCatalog,
} from "../pipeline/convertLevel.ts";
import type {
  RawActivityTable,
  RawCampaignTable,
  RawCharacterTable,
  RawEnemyDatabase,
  RawEnemyHandbookTable,
  RawLevel,
  RawRoguelikeTopicTable,
  RawStageTable,
  RawZoneTable,
} from "../pipeline/raw.ts";
import type { GameTables, StageIndexTables } from "../pipeline/stageIndex.ts";
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

/** CN and TW stage, zone, activity, campaign and roguelike topic tables, subset to a few zones. */
export function rawTables(): StageIndexTables {
  const tables = (suffix: string): GameTables => ({
    stage: readJson<RawStageTable>(`stage_table${suffix}.json`),
    zone: readJson<RawZoneTable>(`zone_table${suffix}.json`),
    activity: readJson<RawActivityTable>(`activity_table${suffix}.json`),
    campaign: readJson<RawCampaignTable>(`campaign_table${suffix}.json`),
    roguelike: readJson<RawRoguelikeTopicTable>(`roguelike_topic_table${suffix}.json`),
  });
  return { cn: tables(""), tw: tables(".tw") };
}

/** Every raw level fixture, e.g. "level_main_01-07". */
export function fixtureLevelNames(): string[] {
  return readdirSync(rawDir)
    .filter((f) => f.startsWith("level_"))
    .map((f) => f.replace(/.json$/, ""));
}

/** CN and TW character tables, subset to the device keys of the level fixtures. */
export function rawCharacterTables(): { cn: RawCharacterTable; tw: RawCharacterTable } {
  return {
    cn: readJson<RawCharacterTable>("character_table.json"),
    tw: readJson<RawCharacterTable>("character_table.tw.json"),
  };
}

let deviceCatalog: DeviceCatalog | undefined;

/** As the pipeline builds it, with 控制器 judged over every level fixture. */
export function fixtureDeviceCatalog(): DeviceCatalog {
  const { cn, tw } = rawCharacterTables();
  return (deviceCatalog ??= buildDeviceCatalog(
    controllerKeys(fixtureLevelNames().map(rawFixture)),
    cn,
    tw,
  ));
}

export function convertFixture(raw: RawLevel, levelId = "fixture"): Level {
  return convertLevel(levelId, raw, buildEnemyCatalog(rawEnemyDatabase(), rawEnemyHandbook()), {
    devices: fixtureDeviceCatalog(),
  });
}

export function loadFixtureLevel(name: string): Level {
  return convertFixture(rawFixture(name), name);
}

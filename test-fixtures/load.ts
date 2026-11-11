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
import { terrainTable } from "../pipeline/terrainTable.ts";
import type {
  RawActivityTable,
  RawCampaignTable,
  RawCharacterTable,
  RawEnemyDatabase,
  RawEnemyHandbookTable,
  RawLevel,
  RawRangeTable,
  RawRoguelikeTopicTable,
  RawSkillTable,
  RawStageTable,
  RawZoneTable,
} from "../pipeline/raw.ts";
import type { EffectTables } from "../pipeline/effectCells.ts";
import { buildSourceCatalog, type SourceCatalog } from "../pipeline/hiddenGroupSources.ts";
import type { GameTables, StageIndexTables } from "../pipeline/stageIndex.ts";
import type { Level, NameTable } from "../src/level/index.ts";

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

export function fixtureLevelNames(): string[] {
  return readdirSync(rawDir)
    .filter((f) => f.startsWith("level_"))
    .map((f) => f.replace(/.json$/, ""));
}

export function rawCharacterTables(): { cn: RawCharacterTable; tw: RawCharacterTable } {
  return {
    cn: readJson<RawCharacterTable>("character_table.json"),
    tw: readJson<RawCharacterTable>("character_table.tw.json"),
  };
}

export function rawSkillTable(): RawSkillTable {
  return readJson<RawSkillTable>("skill_table.json");
}

export function rawRangeTable(): RawRangeTable {
  return readJson<RawRangeTable>("range_table.json");
}

let deviceCatalog: DeviceCatalog | undefined;

export function fixtureEffectTables(characters: RawCharacterTable): EffectTables {
  return { characters, skills: rawSkillTable(), ranges: rawRangeTable() };
}

export function fixtureDeviceCatalog(): DeviceCatalog {
  const names = rawCharacterTables();
  return (deviceCatalog ??= buildDeviceCatalog(
    controllerKeys(fixtureLevelNames().map(rawFixture)),
    { names, effects: fixtureEffectTables(names.cn) },
  ));
}

let sourceCatalog: SourceCatalog | undefined;

export function fixtureSourceCatalog(): SourceCatalog {
  const { cn, tw } = rawTables();
  return (sourceCatalog ??= buildSourceCatalog(cn.roguelike, tw.roguelike));
}

export function convertFixture(raw: RawLevel, levelId = "fixture"): Level {
  return convertLevel(levelId, raw, buildEnemyCatalog(rawEnemyDatabase(), rawEnemyHandbook()), {
    devices: fixtureDeviceCatalog(),
    sources: fixtureSourceCatalog(),
  });
}

export function loadFixtureLevel(name: string): Level {
  return convertFixture(rawFixture(name), name);
}

let nameTable: NameTable | undefined;

export function fixtureNameTable(): NameTable {
  if (nameTable) return nameTable;
  const catalog = buildEnemyCatalog(rawEnemyDatabase(), rawEnemyHandbook());
  const enemies: Record<string, string> = {};
  for (const [id, levels] of catalog.levels) {
    const name = catalog.twNames.get(id) ?? levels.get(0)?.name?.m_value;
    if (name) enemies[id] = name;
  }
  const { cn, tw } = rawTables();
  const tileKeys = new Set([...Object.keys(cn.stage.tileInfo), ...Object.keys(tw.stage.tileInfo)]);
  return (nameTable = {
    enemies,
    terrain: terrainTable(tileKeys, cn.stage, tw.stage),
    devices: Object.fromEntries(fixtureDeviceCatalog().info),
    sources: Object.fromEntries(
      [...fixtureSourceCatalog().byTheme.values()]
        .flatMap((byTag) => [...byTag.values()].flat())
        .map(({ item, name, kind }) => [item, { name, kind }]),
    ),
  });
}

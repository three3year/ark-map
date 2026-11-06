// Refresh test-fixtures/raw/ from the raw-data cache: copies the listed level files, then
// subsets the enemy database and TW handbook to the enemies referenced by every level file
// in the fixture directory (old and new), the enemies already in the subset, and any
// `--enemy` ids. Also subsets the CN and TW stage, zone, activity and campaign tables to the
// `--zone` ids plus the zones already in the fixture tables, keeping only the fields the
// pipeline reads. The CN and TW roguelike topic tables keep every theme, the numbered zones, and
// the `--rogue` stage ids plus the stages already in the fixture table.
// Usage: pnpm fixtures [<level path under levels/>...] [--enemy <enemy id>...] [--zone <zone id>...]
//                      [--rogue <roguelike stage id>...]
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sources, type RepoSource } from "./config.ts";
import { fetchCached, fetchJson } from "./fetchCached.ts";
import type {
  RawActivityTable,
  RawCampaignTable,
  RawEnemyDatabase,
  RawEnemyHandbookTable,
  RawLevel,
  RawRoguelikeStage,
  RawRoguelikeTopicTable,
  RawStage,
  RawStageTable,
  RawZone,
  RawZoneTable,
} from "./raw.ts";

const fixtureDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "test-fixtures",
  "raw",
);

const args = process.argv.slice(2);
const levelPaths: string[] = [];
const enemyIds = new Set<string>();
const zoneIds = new Set<string>();
const rogueStageIds = new Set<string>();
for (let i = 0; i < args.length; i++) {
  const arg = args[i]!;
  if (arg === "--enemy") enemyIds.add(args[++i]!);
  else if (arg === "--zone") zoneIds.add(args[++i]!);
  else if (arg === "--rogue") rogueStageIds.add(args[++i]!);
  else levelPaths.push(arg);
}

await mkdir(fixtureDir, { recursive: true });
for (const levelPath of levelPaths) {
  const body = await fetchCached(sources.cn, `levels/${levelPath}`);
  if (body === null) throw new Error(`找不到關卡檔 levels/${levelPath}`);
  await writeFile(path.join(fixtureDir, path.basename(levelPath)), body);
}
// Keep enemies an earlier run added with `--enemy`.
const previousDb = await readFile(path.join(fixtureDir, "enemy_database.json"), "utf8").then(
  (text) => JSON.parse(text) as RawEnemyDatabase,
  () => ({ enemies: [] }) as RawEnemyDatabase,
);
for (const enemy of previousDb.enemies) enemyIds.add(enemy.Key);
const levelFiles = (await readdir(fixtureDir)).filter((f) => f.startsWith("level_"));
for (const file of levelFiles) {
  const level = JSON.parse(await readFile(path.join(fixtureDir, file), "utf8")) as RawLevel;
  for (const ref of level.enemyDbRefs ?? []) enemyIds.add(ref.id);
}

const db = await fetchJson<RawEnemyDatabase>(sources.cn, "levels/enemydata/enemy_database.json");
const handbook = await fetchJson<RawEnemyHandbookTable>(
  sources.tw,
  "excel/enemy_handbook_table.json",
);
const subsetDb: RawEnemyDatabase = { enemies: db.enemies.filter((e) => enemyIds.has(e.Key)) };
const subsetHandbook: RawEnemyHandbookTable = {
  enemyData: Object.fromEntries(
    Object.entries(handbook.enemyData).filter(([id]) => enemyIds.has(id)),
  ),
};
await writeFile(path.join(fixtureDir, "enemy_database.json"), JSON.stringify(subsetDb));
await writeFile(
  path.join(fixtureDir, "enemy_handbook_table.tw.json"),
  JSON.stringify(subsetHandbook),
);
console.log(`fixtures: ${levelFiles.length} 個關卡檔、${subsetDb.enemies.length} 種敵人`);

function pick<T extends object>(value: T, keys: (keyof T)[]): T {
  return Object.fromEntries(keys.map((k) => [k, value[k]])) as T;
}

function filterEntries<T>(record: Record<string, T>, keep: (key: string, value: T) => boolean) {
  return Object.fromEntries(Object.entries(record).filter(([k, v]) => keep(k, v)));
}

function mapValues<T>(record: Record<string, T>, fn: (value: T) => T): Record<string, T> {
  return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, fn(v)]));
}

const stageKeys: (keyof RawStage)[] = [
  "stageId",
  "levelId",
  "zoneId",
  "code",
  "name",
  "stageType",
  "difficulty",
  "diffGroup",
  "hardStagedId",
  "sixStarStageId",
  "isStoryOnly",
];
const zoneKeys: (keyof RawZone)[] = [
  "zoneID",
  "zoneIndex",
  "type",
  "zoneNameFirst",
  "zoneNameSecond",
  "zoneNameTitleCurrent",
];

async function writeTables(source: RepoSource, suffix: string): Promise<void> {
  const stage = await fetchJson<RawStageTable>(source, "excel/stage_table.json");
  const zone = await fetchJson<RawZoneTable>(source, "excel/zone_table.json");
  const activity = await fetchJson<RawActivityTable>(source, "excel/activity_table.json");
  const campaign = await fetchJson<RawCampaignTable>(source, "excel/campaign_table.json");
  const zoneToActivity = filterEntries(activity.zoneToActivity, (z) => zoneIds.has(z));
  const actIds = new Set(Object.values(zoneToActivity));
  const tables: Record<string, unknown> = {
    stage_table: {
      stages: mapValues(
        filterEntries(stage.stages, (_, s) => zoneIds.has(s.zoneId)),
        (s) => pick(s, stageKeys),
      ),
    } satisfies RawStageTable,
    zone_table: {
      zones: mapValues(
        filterEntries(zone.zones, (z) => zoneIds.has(z)),
        (z) => pick(z, zoneKeys),
      ),
    } satisfies RawZoneTable,
    activity_table: {
      zoneToActivity,
      basicInfo: mapValues(
        filterEntries(activity.basicInfo, (id) => actIds.has(id)),
        (b) => pick(b, ["id", "type", "name", "startTime"]),
      ),
    } satisfies RawActivityTable,
    campaign_table: {
      campaignZones: filterEntries(campaign.campaignZones, (z) => zoneIds.has(z)),
    } satisfies RawCampaignTable,
  };
  for (const [name, table] of Object.entries(tables)) {
    await writeFile(path.join(fixtureDir, `${name}${suffix}.json`), JSON.stringify(table));
  }
}

const existingZones = await readFile(path.join(fixtureDir, "zone_table.json"), "utf8").then(
  (text) => Object.keys((JSON.parse(text) as RawZoneTable).zones),
  () => [],
);
for (const id of existingZones) zoneIds.add(id);
if (zoneIds.size > 0) {
  await writeTables(sources.cn, "");
  await writeTables(sources.tw, ".tw");
  console.log(`fixtures: ${zoneIds.size} 個區域的關卡表、區域表、活動表、剿滅表`);
}

const rogueStageKeys: (keyof RawRoguelikeStage)[] = [
  "id",
  "linkedStageId",
  "levelId",
  "levelReplaceIds",
  "code",
  "name",
  "eliteDesc",
  "difficulty",
];

async function writeRoguelikeTable(source: RepoSource, suffix: string): Promise<void> {
  const table = await fetchJson<RawRoguelikeTopicTable>(source, "excel/roguelike_topic_table.json");
  const subset: RawRoguelikeTopicTable = {
    topics: mapValues(table.topics, (t) => pick(t, ["id", "name", "sort"])),
    details: mapValues(table.details, (d) => ({
      zones: mapValues(
        filterEntries(d.zones, (z) => /^zone_\d+$/.test(z)),
        (z) => pick(z, ["id", "name"]),
      ),
      stages: mapValues(
        filterEntries(d.stages, (id) => rogueStageIds.has(id)),
        (s) => pick(s, rogueStageKeys),
      ),
    })),
  };
  await writeFile(
    path.join(fixtureDir, `roguelike_topic_table${suffix}.json`),
    JSON.stringify(subset),
  );
}

const existingRogue = await readFile(path.join(fixtureDir, "roguelike_topic_table.json"), "utf8")
  .then((text) => Object.values((JSON.parse(text) as RawRoguelikeTopicTable).details))
  .then(
    (topics) => topics.flatMap((t) => Object.keys(t.stages)),
    () => [],
  );
for (const id of existingRogue) rogueStageIds.add(id);
if (rogueStageIds.size > 0) {
  await writeRoguelikeTable(sources.cn, "");
  await writeRoguelikeTable(sources.tw, ".tw");
  console.log(`fixtures: 集成戰略主題表 ${rogueStageIds.size} 個關卡`);
}

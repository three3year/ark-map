// Refresh test-fixtures/raw/ from the raw-data cache: copies the listed level files, then
// subsets the enemy database and TW handbook to the enemies referenced by every level file
// in the fixture directory (old and new), the enemies already in the subset, and any
// `--enemy` ids. Also subsets the CN and TW stage, zone, activity and campaign tables to the
// `--zone` ids plus the zones already in the fixture tables, keeping only the fields the
// pipeline reads; the activity tables also keep each 復刻's original activity. The stage
// tables' `tileInfo` keeps the tile keys the fixture levels use, the keys already in the
// fixture table, and any `--tile` keys. The CN and TW roguelike topic tables
// keep every theme, the numbered zones, the items that open or close a 隱藏組 with their effects,
// and the `--rogue` stage ids plus the stages already in
// the fixture table.
// Usage: pnpm fixtures [<level path under levels/>...] [--enemy <enemy id>...] [--zone <zone id>...]
//                      [--rogue <roguelike stage id>...] [--tile <tile key>...]
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sources, type RepoSource } from "../src/dataSources.ts";
import { fetchCached, fetchJson } from "./fetchCached.ts";
import type {
  RawActivityTable,
  RawCampaignTable,
  RawCharacter,
  RawCharacterTable,
  RawEnemyDatabase,
  RawEnemyHandbookTable,
  RawLevel,
  RawRangeTable,
  RawRoguelikeRelic,
  RawRoguelikeStage,
  RawRoguelikeTopicTable,
  RawSkillTable,
  RawStage,
  RawStageTable,
  RawZone,
  RawZoneTable,
} from "./raw.ts";
import { rerunOriginal, type GameTables } from "./stageIndex.ts";

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
const tileKeys = new Set<string>();
for (let i = 0; i < args.length; i++) {
  const arg = args[i]!;
  if (arg === "--enemy") enemyIds.add(args[++i]!);
  else if (arg === "--tile") tileKeys.add(args[++i]!);
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
const deviceKeys = new Set<string>();
const levelFiles = (await readdir(fixtureDir)).filter((f) => f.startsWith("level_"));
for (const file of levelFiles) {
  const level = JSON.parse(await readFile(path.join(fixtureDir, file), "utf8")) as RawLevel;
  for (const ref of level.enemyDbRefs ?? []) enemyIds.add(ref.id);
  for (const tile of level.mapData.tiles) tileKeys.add(tile.tileKey);
  for (const token of level.predefines?.tokenInsts ?? []) deviceKeys.add(token.inst.characterKey);
}

function characterFields(character: RawCharacter, withEffects: boolean): RawCharacter {
  const named = pick(character, ["name", "description"]);
  if (!withEffects) return named;
  return {
    ...named,
    phases: character.phases?.map((p) => pick(p, ["rangeId"])) ?? null,
    skills: character.skills?.map((s) => pick(s, ["skillId"])) ?? null,
    talents:
      character.talents?.map((t) => ({
        candidates: t.candidates?.map((c) => pick(c, ["unlockCondition", "rangeId"])) ?? null,
      })) ?? null,
  };
}

function subsetOf<T>(
  table: Record<string, T>,
  ids: Iterable<string>,
  fields: (entry: T) => T,
): Record<string, T> {
  return Object.fromEntries(
    [...ids].sort().flatMap((id) => (table[id] ? [[id, fields(table[id])]] : [])),
  );
}

const rangeIds = new Set<string>();
const skillIds = new Set<string>();
for (const [source, suffix] of [
  [sources.cn, ""],
  [sources.tw, ".tw"],
] as const) {
  const table = await fetchJson<RawCharacterTable>(source, "excel/character_table.json");
  const subset: RawCharacterTable = subsetOf(table, deviceKeys, (character) =>
    characterFields(character, source === sources.cn),
  );
  await writeFile(path.join(fixtureDir, `character_table${suffix}.json`), JSON.stringify(subset));
  if (source !== sources.cn) continue;
  for (const character of Object.values(subset)) {
    const ids = [
      ...(character.phases ?? []).map((p) => p.rangeId),
      ...(character.talents ?? []).flatMap((t) => (t.candidates ?? []).map((c) => c.rangeId)),
    ];
    for (const id of ids) if (id) rangeIds.add(id);
    for (const skill of character.skills ?? []) if (skill.skillId) skillIds.add(skill.skillId);
  }
}
console.log(`fixtures: 角色表 ${deviceKeys.size} 種裝置`);

const skills = await fetchJson<RawSkillTable>(sources.cn, "excel/skill_table.json");
const skillSubset: RawSkillTable = subsetOf(skills, skillIds, (skill) => ({
  levels: skill.levels.map((l) => pick(l, ["rangeId"])),
}));
await writeFile(path.join(fixtureDir, "skill_table.json"), JSON.stringify(skillSubset));
for (const skill of Object.values(skillSubset)) {
  for (const level of skill.levels) if (level.rangeId) rangeIds.add(level.rangeId);
}
console.log(`fixtures: 技能表 ${Object.keys(skillSubset).length} 個技能`);

const ranges = await fetchJson<RawRangeTable>(sources.cn, "excel/range_table.json");
const rangeSubset: RawRangeTable = subsetOf(ranges, rangeIds, (range) => pick(range, ["grids"]));
await writeFile(path.join(fixtureDir, "range_table.json"), JSON.stringify(rangeSubset));
console.log(`fixtures: 範圍表 ${Object.keys(rangeSubset).length} 個範圍`);

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

type ZoneTables = Omit<GameTables, "roguelike">;

async function fetchTables(source: RepoSource): Promise<ZoneTables> {
  return {
    stage: await fetchJson<RawStageTable>(source, "excel/stage_table.json"),
    zone: await fetchJson<RawZoneTable>(source, "excel/zone_table.json"),
    activity: await fetchJson<RawActivityTable>(source, "excel/activity_table.json"),
    campaign: await fetchJson<RawCampaignTable>(source, "excel/campaign_table.json"),
  };
}

/** The original activity of each 復刻 in the fixture zones, read from the CN tables. */
function originalActivityIds({ stage, activity }: ZoneTables): Set<string> {
  const ids = Object.values(stage.stages).flatMap((s) => {
    const actId = zoneIds.has(s.zoneId) ? activity.zoneToActivity[s.zoneId] : undefined;
    const original = actId && rerunOriginal(activity, actId, s.stageId);
    return original ? [original.id] : [];
  });
  return new Set(ids);
}

async function writeTables(
  { stage, zone, activity, campaign }: ZoneTables,
  suffix: string,
  originals: Set<string>,
): Promise<void> {
  const zoneToActivity = filterEntries(activity.zoneToActivity, (z) => zoneIds.has(z));
  const actIds = new Set([...Object.values(zoneToActivity), ...originals]);
  const tables: Record<string, unknown> = {
    stage_table: {
      stages: mapValues(
        filterEntries(stage.stages, (_, s) => zoneIds.has(s.zoneId)),
        (s) => pick(s, stageKeys),
      ),
      tileInfo: filterEntries(stage.tileInfo, (key) => tileKeys.has(key)),
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
        (b) => pick(b, ["id", "type", "name", "startTime", "isReplicate"]),
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
const existingTiles = await readFile(path.join(fixtureDir, "stage_table.json"), "utf8").then(
  (text) => Object.keys((JSON.parse(text) as Partial<RawStageTable>).tileInfo ?? {}),
  () => [],
);
for (const key of existingTiles) tileKeys.add(key);
if (zoneIds.size > 0) {
  const cn = await fetchTables(sources.cn);
  const originals = originalActivityIds(cn);
  await writeTables(cn, "", originals);
  await writeTables(await fetchTables(sources.tw), ".tw", originals);
  console.log(`fixtures: ${zoneIds.size} 個區域的關卡表、區域表、活動表、剿滅表`);
}

const rogueStageKeys: (keyof RawRoguelikeStage)[] = [
  "id",
  "linkedStageId",
  "levelId",
  "levelReplaceIds",
  "code",
  "name",
  "difficulty",
];

const switchesHiddenGroup = (relic: RawRoguelikeRelic) =>
  relic.buffs.some((b) => /^level_hidden_group_(enable|disable)$/.test(b.key));

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
      relics: filterEntries(d.relics, (_, r) => switchesHiddenGroup(r)),
      items: mapValues(
        filterEntries(
          d.items,
          (id) => d.relics[id] !== undefined && switchesHiddenGroup(d.relics[id]),
        ),
        (i) => pick(i, ["id", "name", "type"]),
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

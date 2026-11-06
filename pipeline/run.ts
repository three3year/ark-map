// Data pipeline entry point: fetch raw game data (cached by blob sha), trim every level the
// stage index covers into the site's JSON under public/data/, write the stage index, and copy
// the avatars those levels use.
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { isKnownModifierKey } from "../src/level/index.ts";
import { outDir, rawCacheDir, sources, type RepoSource } from "./config.ts";
import { buildEnemyCatalog, convertLevel } from "./convertLevel.ts";
import { fetchCached, fetchJson, fetchStats, listTree, type TreeListing } from "./fetchCached.ts";
import type {
  RawActivityTable,
  RawCampaignTable,
  RawEnemyDatabase,
  RawEnemyHandbookTable,
  RawLevel,
  RawStageTable,
  RawZoneTable,
} from "./raw.ts";
import {
  buildStageIndex,
  indexedLevelPaths,
  levelFacts,
  type GameTables,
  type LevelFacts,
} from "./stageIndex.ts";

const started = performance.now();
const log = (message: string) => console.log(`[資料管線] ${message}`);

async function writeJson(file: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data));
}

async function forEachLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]!);
  };
  await Promise.all(Array.from({ length: limit }, worker));
}

async function dirSize(dir: string): Promise<{ files: number; bytes: number }> {
  const total = { files: 0, bytes: 0 };
  const entries = await readdir(dir, { withFileTypes: true, recursive: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    total.files++;
    total.bytes += (await stat(path.join(entry.parentPath, entry.name))).size;
  }
  return total;
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

log(`原始檔快取: ${rawCacheDir}`);
const [cnExcel, twExcel, cnLevels, avatarFiles] = await Promise.all([
  listTree(sources.cn, "excel"),
  listTree(sources.tw, "excel"),
  listTree(sources.cn, "levels"),
  listTree(sources.avatars),
]);

function table<T>(source: RepoSource, listing: TreeListing | null, name: string): Promise<T> {
  return fetchJson<T>(source, `excel/${name}.json`, listing?.get(`${name}.json`));
}

async function gameTables(source: RepoSource, listing: TreeListing | null): Promise<GameTables> {
  return {
    stage: await table<RawStageTable>(source, listing, "stage_table"),
    zone: await table<RawZoneTable>(source, listing, "zone_table"),
    activity: await table<RawActivityTable>(source, listing, "activity_table"),
    campaign: await table<RawCampaignTable>(source, listing, "campaign_table"),
  };
}

const tables = {
  cn: await gameTables(sources.cn, cnExcel),
  tw: await gameTables(sources.tw, twExcel),
};
const catalog = buildEnemyCatalog(
  await fetchJson<RawEnemyDatabase>(
    sources.cn,
    "levels/enemydata/enemy_database.json",
    cnLevels?.get("enemydata/enemy_database.json"),
  ),
  await table<RawEnemyHandbookTable>(sources.tw, twExcel, "enemy_handbook_table"),
);

await rm(outDir, { recursive: true, force: true });

/** Copy an enemy's avatar into the site the first time a level uses it. */
const avatars = new Map<string, Promise<string | null>>();
function avatarFor(enemyId: string): Promise<string | null> {
  let avatar = avatars.get(enemyId);
  if (!avatar) {
    const file = `${enemyId}.png`;
    avatar =
      avatarFiles && !avatarFiles.has(file)
        ? Promise.resolve(null)
        : fetchCached(sources.avatars, file, avatarFiles?.get(file)).then(async (png) => {
            if (!png) return null;
            await mkdir(path.join(outDir, "avatars"), { recursive: true });
            await writeFile(path.join(outDir, "avatars", file), png);
            return `data/avatars/${file}`;
          });
    avatars.set(enemyId, avatar);
  }
  return avatar;
}

// Files the listing does not have are left out up front; the index reports their stages.
const wanted = indexedLevelPaths(tables).filter((p) => !cnLevels || cnLevels.has(`${p}.json`));
log(`關卡檔 ${wanted.length} 個(抓取中,已快取的不重抓)`);
const facts = new Map<string, LevelFacts>();
const failures: string[] = [];
/** 難度修正 key -> how many modifiers in the converted level files use it. */
const modifierKeys = new Map<string, number>();
let done = 0;
await forEachLimit(wanted, 8, async (levelPath) => {
  const file = `${levelPath}.json`;
  const body = await fetchCached(sources.cn, `levels/${file}`, cnLevels?.get(file));
  if (body) {
    const raw = JSON.parse(body.toString("utf8")) as RawLevel;
    try {
      const level = convertLevel(levelPath, raw, catalog);
      // Level-local enemies are drawn as their prefab, a database enemy.
      const prefabs = new Map(
        (raw.enemyDbRefs ?? []).map((r) => [r.id, r.overwrittenData?.prefabKey?.m_value]),
      );
      for (const enemy of Object.values(level.enemies)) {
        const prefab = prefabs.get(enemy.id);
        enemy.avatar = (await avatarFor(enemy.id)) ?? (prefab ? await avatarFor(prefab) : null);
      }
      await writeJson(path.join(outDir, "levels", file), level);
      facts.set(levelPath, levelFacts(raw));
      for (const { key } of level.modifiers)
        modifierKeys.set(key, (modifierKeys.get(key) ?? 0) + 1);
    } catch (e) {
      failures.push(`${levelPath}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (++done % 250 === 0) log(`  ${done}/${wanted.length}`);
});

const { index, skipped } = buildStageIndex(tables, facts);
await writeJson(path.join(outDir, "index.json"), index);

const missing = skipped.filter((s) => !failures.some((f) => f.startsWith(`${s.levelPath}:`)));
if (missing.length > 0) {
  log(`略過 ${missing.length} 個關卡(上游沒有關卡檔):`);
  for (const s of missing) console.log(`  ${s.stageId} -> levels/${s.levelPath}.json`);
}
if (failures.length > 0) {
  console.warn(`[資料管線] ${failures.length} 個關卡檔轉換失敗,未列入索引:`);
  for (const f of failures) console.warn(`  ${f}`);
}

const keyCounts = [...modifierKeys].sort((a, b) => b[1] - a[1]);
log(`難度修正鍵 ${keyCounts.length} 種:` + keyCounts.map(([key, n]) => `${key} ×${n}`).join("、"));
const unknownKeys = keyCounts.filter(([key]) => !isKnownModifierKey(key));
if (unknownKeys.length > 0) {
  console.warn(
    `[資料管線] ${unknownKeys.length} 種難度修正鍵不在已知清單(src/level/modifiers.ts),` +
      `畫面只顯示原始鍵名、不套用:`,
  );
  for (const [key, n] of unknownKeys) console.warn(`  ${key} ×${n}`);
}

const stageCount = index.areas.reduce(
  (n, a) => n + a.sections.reduce((m, s) => m + s.stages.length, 0),
  0,
);
const avatarCount = (await Promise.all(avatars.values())).filter(Boolean).length;
const [levelsSize, avatarsSize, total] = await Promise.all([
  dirSize(path.join(outDir, "levels")),
  dirSize(path.join(outDir, "avatars")),
  dirSize(outDir),
]);
const indexSize = (await stat(path.join(outDir, "index.json"))).size;
log(
  `完成: ${index.areas.length} 個區域、${stageCount} 個關卡、${facts.size} 個關卡檔、` +
    `${avatarCount}/${avatars.size} 種敵人有頭像`,
);
log(
  `站內資料 ${mb(total.bytes)}(${total.files} 檔):索引 ${(indexSize / 1024).toFixed(0)} KB、` +
    `關卡 ${mb(levelsSize.bytes)}、頭像 ${mb(avatarsSize.bytes)}`,
);
log(
  `原始檔: 快取命中 ${fetchStats.cached}、下載 ${fetchStats.downloaded}、重試 ${fetchStats.retried};` +
    `耗時 ${((performance.now() - started) / 1000).toFixed(1)} 秒`,
);

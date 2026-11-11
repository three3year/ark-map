// Data pipeline entry point: fetch raw game data (cached by blob sha), trim every level the
// stage index covers into the site's JSON under public/data/, write the stage index and the
// 名稱表, and copy the avatars those levels use.
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { isKnownModifierKey, type NameTable } from "../src/level/index.ts";
import { sources, type RepoSource } from "../src/dataSources.ts";
import { outDir, rawCacheDir } from "./config.ts";
import {
  buildDeviceCatalog,
  buildEnemyCatalog,
  controllerKeys,
  convertLevel,
  siteLevelFile,
} from "./convertLevel.ts";
import { fetchCached, fetchJson, fetchStats, listTree, type TreeListing } from "./fetchCached.ts";
import { pipelineOutcome, type ConversionFailure } from "./outcome.ts";
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
} from "./raw.ts";
import {
  buildStageIndex,
  indexedLevelPaths,
  levelFacts,
  roguelikeLevelPaths,
  skipReasonMessage,
  type GameTables,
  type LevelFacts,
} from "./stageIndex.ts";
import { terrainTable } from "./terrainTable.ts";

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
const [cnExcel, twExcel, cnLevels, avatarFiles, deviceImageFiles] = await Promise.all([
  listTree(sources.cn, "excel"),
  listTree(sources.tw, "excel"),
  listTree(sources.cn, "levels"),
  listTree(sources.avatars),
  listTree(sources.devices),
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
    roguelike: await table<RawRoguelikeTopicTable>(source, listing, "roguelike_topic_table"),
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

function siteImages(source: RepoSource, listing: TreeListing | null, dir: string) {
  const images = new Map<string, Promise<string | null>>();
  function imageFor(key: string): Promise<string | null> {
    let image = images.get(key);
    if (!image) {
      const file = `${key}.png`;
      image =
        listing && !listing.has(file)
          ? Promise.resolve(null)
          : fetchCached(source, file, listing?.get(file)).then(async (png) => {
              if (!png) return null;
              await mkdir(path.join(outDir, dir), { recursive: true });
              await writeFile(path.join(outDir, dir, file), png);
              return `data/${dir}/${file}`;
            });
      images.set(key, image);
    }
    return image;
  }
  return { images, imageFor };
}
const { images: avatars, imageFor: avatarFor } = siteImages(
  sources.avatars,
  avatarFiles,
  "avatars",
);
const { images: deviceImages, imageFor: deviceImageFor } = siteImages(
  sources.devices,
  deviceImageFiles,
  "devices",
);

// 集成戰略: the theme table should name every file under obt/roguelike/ and nothing else.
if (cnLevels) {
  const referenced = roguelikeLevelPaths(tables.cn.roguelike);
  const upstream = [...cnLevels.keys()]
    .filter((f) => f.startsWith("obt/roguelike/"))
    .map((f) => f.replace(/\.json$/, ""));
  const unreferenced = upstream.filter((p) => !referenced.includes(p));
  const absent = referenced.filter((p) => !cnLevels.has(`${p}.json`));
  log(
    `集成戰略: 主題表引用 ${referenced.length} 個關卡檔,上游 obt/roguelike/ 有 ${upstream.length} 檔;` +
      `缺檔 ${absent.length}、未被引用 ${unreferenced.length}`,
  );
  for (const p of unreferenced) console.log(`  未被引用: levels/${p}.json`);
}

// Files the listing does not have are left out up front; the index reports their stages.
const wanted = indexedLevelPaths(tables).filter((p) => !cnLevels || cnLevels.has(`${p}.json`));
log(`關卡檔 ${wanted.length} 個(抓取中,已快取的不重抓)`);
const bodies = new Map<string, Buffer>();
await forEachLimit(wanted, 8, async (levelPath) => {
  const file = `${levelPath}.json`;
  const body = await fetchCached(sources.cn, `levels/${file}`, cnLevels?.get(file));
  if (body) bodies.set(levelPath, body);
});
const controllers = controllerKeys(
  [...bodies.values()].map((body) => ({
    predefines: (JSON.parse(body.toString("utf8")) as RawLevel).predefines,
  })),
);
const devices = buildDeviceCatalog(
  controllers,
  await table<RawCharacterTable>(sources.cn, cnExcel, "character_table"),
  await table<RawCharacterTable>(sources.tw, twExcel, "character_table"),
);
log(`控制器 ${controllers.size} 種:${[...controllers].sort().join("、")}`);
const facts = new Map<string, LevelFacts>();
const failures: ConversionFailure[] = [];
const names: NameTable = { enemies: {}, terrain: {}, devices: {} };
/** Every `tileKey` the converted level files use. */
const tileKeys = new Set<string>();
/** 難度修正 key -> how many modifiers in the converted level files use it. */
const modifierKeys = new Map<string, number>();
/** "field = value" of enum values with no known name -> the level files they appear in. */
const unknownEnums = new Map<string, Set<string>>();
const unknownDevices = new Map<string, Set<string>>();
const deviceKeys = new Set<string>();
const record = (seen: Map<string, Set<string>>, key: string, levelPath: string) => {
  if (!seen.has(key)) seen.set(key, new Set());
  seen.get(key)!.add(levelPath);
};
let done = 0;
await forEachLimit(wanted, 8, async (levelPath) => {
  const file = `${levelPath}.json`;
  const body = bodies.get(levelPath);
  if (body) {
    try {
      const raw = JSON.parse(body.toString("utf8")) as RawLevel;
      const level = convertLevel(levelPath, raw, catalog, {
        devices,
        onUnknownEnum: (field, value) => record(unknownEnums, `${field} = ${value}`, levelPath),
        onUnknownDevice: (key) => record(unknownDevices, key, levelPath),
      });
      // Level-local enemies are drawn as their prefab, a database enemy.
      const prefabs = new Map(
        (raw.enemyDbRefs ?? []).map((r) => [r.id, r.overwrittenData?.prefabKey?.m_value]),
      );
      for (const enemy of Object.values(level.enemies)) {
        const prefab = prefabs.get(enemy.id);
        enemy.avatar = (await avatarFor(enemy.id)) ?? (prefab ? await avatarFor(prefab) : null);
      }
      for (const device of level.devices) {
        device.image = await deviceImageFor(device.key);
        deviceKeys.add(device.key);
      }
      await writeJson(
        path.join(outDir, "levels", file),
        siteLevelFile(level, catalog, names, devices),
      );
      facts.set(levelPath, levelFacts(raw));
      for (const tile of level.map.tiles) tileKeys.add(tile.tileKey);
      for (const { key } of level.modifiers)
        modifierKeys.set(key, (modifierKeys.get(key) ?? 0) + 1);
    } catch (e) {
      failures.push({ levelPath, message: e instanceof Error ? e.message : String(e) });
    }
  }
  if (++done % 250 === 0) log(`  ${done}/${wanted.length}`);
});

const { index, skipped } = buildStageIndex(tables, facts);
await writeJson(path.join(outDir, "index.json"), index);
const sortedNames = Object.keys(names.enemies).sort();
const terrain = terrainTable([...tileKeys].sort(), tables.cn.stage, tables.tw.stage);
await writeJson(path.join(outDir, "names.json"), {
  enemies: Object.fromEntries(sortedNames.map((id) => [id, names.enemies[id]!])),
  terrain,
  devices: Object.fromEntries(
    Object.keys(names.devices)
      .sort()
      .map((key) => [key, names.devices[key]!]),
  ),
} satisfies NameTable);
const unnamedTiles = [...tileKeys].filter((key) => !terrain[key]);
log(
  `地形 ${tileKeys.size} 種,地形表收錄 ${Object.keys(terrain).length} 種;` +
    `台服、國服都沒有名稱 ${unnamedTiles.length} 種`,
);

const outcome = pipelineOutcome(skipped, failures);
if (outcome.missing.length > 0) {
  log(`略過 ${outcome.missing.length} 個關卡:`);
  for (const s of outcome.missing) {
    console.log(`  ${s.stageId} -> levels/${s.levelPath}.json(${skipReasonMessage[s.reason]})`);
  }
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

const deviceImageCount = (await Promise.all(deviceImages.values())).filter(Boolean).length;
log(
  `裝置 ${deviceKeys.size} 種、${deviceImageCount} 種有圖;名稱表收錄 ${Object.keys(names.devices).length} 種`,
);
if (unknownDevices.size > 0) {
  console.warn(
    `[資料管線] ${unknownDevices.size} 種裝置不在擋路或不擋路清單(pipeline/deviceKinds.ts),當作不擋路:`,
  );
  for (const [key, levels] of unknownDevices) {
    const sample = [...levels].slice(0, 3).join("、");
    console.warn(`  ${key}:${levels.size} 個關卡檔,例如 ${sample}`);
  }
}

if (unknownEnums.size > 0) {
  console.warn(
    `[資料管線] ${unknownEnums.size} 種列舉值沒有已知對應(pipeline/convertLevel.ts、src/level/enums.ts),` +
      `站內 JSON 寫成 UNKNOWN_<值>:`,
  );
  for (const [key, levels] of unknownEnums) {
    const sample = [...levels].slice(0, 3).join("、");
    console.warn(`  ${key}:${levels.size} 個關卡檔,例如 ${sample}`);
  }
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

if (outcome.failures.length > 0) {
  console.error(`[資料管線] 失敗:${outcome.failures.length} 個關卡檔轉換失敗,未列入索引:`);
  for (const f of outcome.failures) console.error(`  ${f.levelPath}: ${f.message}`);
}
process.exitCode = outcome.exitCode;

// Data pipeline entry point: fetch raw game data (cached), trim it into the site's JSON
// under public/data/, and copy the avatars the published levels use.
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Level, StageIndex } from "../src/level/index.ts";
import { outDir, rawCacheDir, sources, stageIds } from "./config.ts";
import { buildEnemyCatalog, convertLevel } from "./convertLevel.ts";
import { fetchCached, fetchJson } from "./fetchCached.ts";
import type { RawEnemyDatabase, RawEnemyHandbookTable, RawLevel, RawStageTable } from "./raw.ts";

async function writeJson(file: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data));
}

console.log(`[資料管線] 原始檔快取: ${rawCacheDir}`);
const stageTable = await fetchJson<RawStageTable>(sources.cn, "excel/stage_table.json");
const catalog = buildEnemyCatalog(
  await fetchJson<RawEnemyDatabase>(sources.cn, "levels/enemydata/enemy_database.json"),
  await fetchJson<RawEnemyHandbookTable>(sources.tw, "excel/enemy_handbook_table.json"),
);

await rm(outDir, { recursive: true, force: true });
const index: StageIndex = { stages: [] };
const avatars = new Map<string, string | null>();

for (const stageId of stageIds) {
  const stage = stageTable.stages[stageId];
  if (!stage?.levelId) throw new Error(`關卡表沒有 ${stageId} 或它沒有關卡檔`);
  // Raw paths are case-sensitive and lowercase upstream.
  const levelPath = stage.levelId.toLowerCase();
  const level: Level = convertLevel(
    stage.levelId,
    await fetchJson<RawLevel>(sources.cn, `levels/${levelPath}.json`),
    catalog,
  );
  for (const enemy of Object.values(level.enemies)) {
    if (!avatars.has(enemy.id)) {
      const png = await fetchCached(sources.avatars, `${enemy.id}.png`);
      const site = png ? `data/avatars/${enemy.id}.png` : null;
      if (png) {
        await mkdir(path.join(outDir, "avatars"), { recursive: true });
        await writeFile(path.join(outDir, "avatars", `${enemy.id}.png`), png);
      }
      avatars.set(enemy.id, site);
    }
    enemy.avatar = avatars.get(enemy.id) ?? null;
  }
  const levelFile = `data/levels/${levelPath}.json`;
  await writeJson(path.join(outDir, "levels", `${levelPath}.json`), level);
  index.stages.push({ id: stageId, code: stage.code, name: stage.name, levelFile });
  console.log(`[資料管線] ${stage.code} ${stage.name} -> ${levelFile}`);
}

await writeJson(path.join(outDir, "index.json"), index);
console.log(`[資料管線] 完成: ${index.stages.length} 個關卡、${avatars.size} 種敵人頭像`);

// Refresh test-fixtures/raw/ from the raw-data cache: copies the listed level files, then
// subsets the enemy database and TW handbook to the enemies referenced by every level file
// in the fixture directory (old and new), the enemies already in the subset, and any
// `--enemy` ids.
// Usage: pnpm fixtures [<level path under levels/>...] [--enemy <enemy id>...]
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sources } from "./config.ts";
import { fetchCached, fetchJson } from "./fetchCached.ts";
import type { RawEnemyDatabase, RawEnemyHandbookTable, RawLevel } from "./raw.ts";

const fixtureDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "test-fixtures",
  "raw",
);

const args = process.argv.slice(2);
const levelPaths: string[] = [];
const enemyIds = new Set<string>();
for (let i = 0; i < args.length; i++) {
  const arg = args[i]!;
  if (arg === "--enemy") enemyIds.add(args[++i]!);
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

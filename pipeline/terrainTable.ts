// The 名稱表's 地形表, from the stage tables' `tileInfo`.
import type { TerrainTable } from "../src/level/index.ts";
import type { RawStageTable } from "./raw.ts";

/** The game's rich-text markup, `<@ba.kw>…</>`; plain `<荒季>` brackets are text and stay. */
const richTextTag = /<[@$][^>]*>|<\/>/g;

/** `tileKey` -> the TW entry, else the CN one; keys neither table has are left out. */
export function terrainTable(
  tileKeys: Iterable<string>,
  cn: RawStageTable,
  tw: RawStageTable,
): TerrainTable {
  const table: TerrainTable = {};
  for (const key of tileKeys) {
    const info = tw.tileInfo[key] ?? cn.tileInfo[key];
    if (!info) continue;
    table[key] = {
      name: info.name,
      description: info.description.replace(richTextTag, ""),
      functional: info.isFunctional,
    };
  }
  return table;
}

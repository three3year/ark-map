// 地形 marks drawn over a cell's base colour, and the legend entries of the marks a map has.
import type { LevelMap, TerrainInfo } from "../level/index.ts";

/** Hand-drawn structure icons; `TerrainIcon.svelte` draws each. */
export type TerrainIcon = "start" | "flystart" | "end" | "tunnelIn" | "tunnelOut";

/**
 * The tile keys each icon is drawn on. A key the 地形表 has no entry for borrows the name and
 * description of the row's first key.
 */
const drawnIcons: { icon: TerrainIcon; tileKeys: string[] }[] = [
  {
    icon: "start",
    tileKeys: ["tile_start", "tile_start_cooperate", "tile_start_dqq", "tile_ftstart"],
  },
  { icon: "flystart", tileKeys: ["tile_flystart"] },
  { icon: "end", tileKeys: ["tile_end", "tile_end_cooperate", "tile_end_dqq"] },
  { icon: "tunnelIn", tileKeys: ["tile_telin"] },
  { icon: "tunnelOut", tileKeys: ["tile_telout"] },
];

/** What a cell shows over its base colour, named as the legend lists it. */
export interface TerrainMark {
  kind: "icon";
  icon: TerrainIcon;
  name: string;
  description: string;
}

/** The mark drawn on a `tileKey` cell; null when the cell shows its base colour only. */
export function terrainMark(
  tileKey: string,
  terrain: Record<string, TerrainInfo>,
): TerrainMark | null {
  const drawn = drawnIcons.find((d) => d.tileKeys.includes(tileKey));
  if (!drawn) return null;
  const info = terrain[tileKey] ?? terrain[drawn.tileKeys[0]!];
  if (!info) return null;
  return { kind: "icon", icon: drawn.icon, name: info.name, description: info.description };
}

/** The distinct marks on `map`, in the legend's order. */
export function legendMarks(map: LevelMap, terrain: Record<string, TerrainInfo>): TerrainMark[] {
  const marks = new Map<string, TerrainMark>();
  for (const tileKey of new Set(map.tiles.map((t) => t.tileKey))) {
    const mark = terrainMark(tileKey, terrain);
    if (mark) marks.set(`${mark.icon}\n${mark.name}\n${mark.description}`, mark);
  }
  const order = (mark: TerrainMark) => drawnIcons.findIndex((d) => d.icon === mark.icon);
  return [...marks.values()].sort((a, b) => order(a) - order(b));
}

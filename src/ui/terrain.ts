// 地形 marks drawn over a cell's base colour, and the legend entries of the marks a map has.
import type { LevelMap, TerrainTable } from "../level/index.ts";
import { strings } from "./strings.ts";

/** Hand-drawn structure icons; `TerrainIcon.svelte` draws each. */
export type TerrainIcon =
  | "incursion"
  | "airIncursion"
  | "protectTarget"
  | "tunnelIn"
  | "tunnelOut"
  | "hole"
  | "fence"
  | "fenceBound"
  | "deepWater"
  | "grass"
  | "infection";

/**
 * The tile keys each icon is drawn on, whether or not the 地形表 calls them functional. A key the
 * 地形表 has no entry for borrows the name and description of the row's first key; when that is
 * missing too, the icon still shows, under its built-in name.
 */
const drawnIcons: { icon: TerrainIcon; tileKeys: string[] }[] = [
  {
    icon: "incursion",
    tileKeys: ["tile_start", "tile_start_cooperate", "tile_start_dqq", "tile_ftstart"],
  },
  { icon: "airIncursion", tileKeys: ["tile_flystart"] },
  { icon: "protectTarget", tileKeys: ["tile_end", "tile_end_cooperate", "tile_end_dqq"] },
  { icon: "tunnelIn", tileKeys: ["tile_telin"] },
  { icon: "tunnelOut", tileKeys: ["tile_telout"] },
  { icon: "hole", tileKeys: ["tile_hole"] },
  { icon: "fence", tileKeys: ["tile_fence"] },
  { icon: "fenceBound", tileKeys: ["tile_fence_bound"] },
  { icon: "deepWater", tileKeys: ["tile_deepsea", "tile_deepwater"] },
  { icon: "grass", tileKeys: ["tile_grass"] },
  { icon: "infection", tileKeys: ["tile_infection"] },
];

/**
 * What a cell shows over its base colour, named as the legend lists it: a hand-drawn icon, or for
 * any other functional 地形 the first character of its name. `description` is the 地形表's; null
 * when it has none.
 */
export type TerrainMark = { name: string; description: string | null } & (
  { kind: "icon"; icon: TerrainIcon } | { kind: "glyph"; glyph: string }
);

/** The first letter of `name`, skipping the quotes some 地形表 names open with. */
const firstLetter = (name: string) => name.match(/[\p{L}\p{N}]/u)?.[0] ?? name.slice(0, 1);

/** The mark drawn on a `tileKey` cell; null when the cell shows its base colour only. */
export function terrainMark(tileKey: string, terrain: TerrainTable): TerrainMark | null {
  const drawn = drawnIcons.find((d) => d.tileKeys.includes(tileKey));
  if (drawn) {
    const info = terrain[tileKey] ?? terrain[drawn.tileKeys[0]!];
    const { icon } = drawn;
    if (!info) return { kind: "icon", icon, name: strings.terrainIcon[icon], description: null };
    return { kind: "icon", icon, name: info.name, description: info.description };
  }
  const info = terrain[tileKey];
  if (!info?.functional) return null;
  const { name, description } = info;
  return { kind: "glyph", glyph: firstLetter(name), name, description };
}

const markKey = (mark: TerrainMark) =>
  `${mark.kind === "icon" ? mark.icon : mark.glyph}\n${mark.name}\n${mark.description}`;

/** Icons in the hand-drawn table's order, then glyphs by name. */
function legendOrder(a: TerrainMark, b: TerrainMark): number {
  const rank = (mark: TerrainMark) =>
    mark.kind === "icon" ? drawnIcons.findIndex((d) => d.icon === mark.icon) : drawnIcons.length;
  return rank(a) - rank(b) || a.name.localeCompare(b.name, "zh-Hant");
}

/** The distinct marks on `map`, in the legend's order. */
export function legendMarks(map: LevelMap, terrain: TerrainTable): TerrainMark[] {
  const marks = new Map<string, TerrainMark>();
  for (const tileKey of new Set(map.tiles.map((t) => t.tileKey))) {
    const mark = terrainMark(tileKey, terrain);
    if (mark) marks.set(markKey(mark), mark);
  }
  return [...marks.values()].sort(legendOrder);
}

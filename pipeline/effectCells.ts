// 作用範圍: the cells a device's effect covers, from the CN character and range tables.
import type { Cell, Direction, LevelMap } from "../src/level/index.ts";
import type { RawCharacterTable, RawEnum, RawRangeTable, RawTokenInst } from "./raw.ts";

/** The CN tables 作用範圍 come from. */
export interface EffectTables {
  characters: RawCharacterTable;
  ranges: RawRangeTable;
}

export const noEffectTables: EffectTables = { characters: {}, ranges: {} };

/** Called for each range id a device names that the range table lacks. */
export type UnknownRangeIdHandler = (rangeId: string, key: string) => void;

/** "PHASE_1", or 1 in older files -> 1; absent -> 0. */
function phaseIndex(phase: RawEnum | undefined): number {
  if (phase === undefined) return 0;
  if (typeof phase === "number") return phase;
  return Number(phase.replace("PHASE_", "")) || 0;
}

/**
 * The range ids a device may take its 作用範圍 from, in the order they are tried: the
 * character table's 階段 first.
 */
function rangeIdCandidates(tables: EffectTables, token: RawTokenInst): (string | null)[] {
  const character = tables.characters[token.inst.characterKey];
  if (!character) return [];
  const phases = character.phases ?? [];
  // The 階段 of the device; past the last 階段 the table lists, the last one.
  const phase = phases[phaseIndex(token.inst.phase)] ?? phases.at(-1);
  return [phase?.rangeId ?? null];
}

/** The device's range offsets: the first candidate covering a cell besides its own. */
function chosenOffsets(
  tables: EffectTables,
  token: RawTokenInst,
  onUnknownRangeId: UnknownRangeIdHandler,
): Cell[] {
  for (const id of rangeIdCandidates(tables, token)) {
    if (id === null) continue;
    const range = tables.ranges[id];
    if (!range) {
      onUnknownRangeId(id, token.inst.characterKey);
      continue;
    }
    if (range.grids.some((g) => g.row !== 0 || g.col !== 0)) return range.grids;
  }
  return [];
}

/** The range table stores offsets facing right (`col` forward); turn them to `direction`. */
function rotate({ row, col }: Cell, direction: Direction): Cell {
  switch (direction) {
    case "UP":
      return { row: col, col: -row };
    case "DOWN":
      return { row: -col, col: row };
    case "LEFT":
      return { row: -row, col: -col };
    default:
      return { row, col };
  }
}

/**
 * The 作用範圍 of a device placed by `token` facing `direction`: its range turned to the
 * direction it is placed facing, moved to its cell, cut to the map. Empty when it has none.
 */
export function effectCells(
  tables: EffectTables,
  token: RawTokenInst,
  direction: Direction,
  map: Pick<LevelMap, "width" | "height">,
  onUnknownRangeId: UnknownRangeIdHandler,
): Cell[] {
  return chosenOffsets(tables, token, onUnknownRangeId)
    .map((offset) => rotate(offset, direction))
    .map((d) => ({ row: token.position.row + d.row, col: token.position.col + d.col }))
    .filter(({ row, col }) => row >= 0 && row < map.height && col >= 0 && col < map.width);
}

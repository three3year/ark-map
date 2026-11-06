// 尋路: map + target cell + motion mode -> nextNode table. Pure; no DOM or network.
import type { Cell, LevelMap, MotionMode } from "../level/index.ts";

/** For each cell, the cell an enemy there heads for next on its way to the target. */
export type NextNodeTable = (cell: Cell) => Cell;

/** Looks up (and caches) the nextNode table for a motion mode and target cell. */
export type NextNodeLookup = (mode: MotionMode, target: Cell) => NextNodeTable;

/**
 * Placeholder until ticket 03 (SPFA + smoothing): every cell heads straight for the target.
 */
export function createNextNodeLookup(_map: LevelMap): NextNodeLookup {
  return (_mode, target) => () => target;
}

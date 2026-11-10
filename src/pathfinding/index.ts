// 尋路: map + target cell + motion mode -> nextNode table. Pure; no DOM or network.
// Rules from HANDOFF.md part 1 §2-4 (the 全解析 and 寻路规则补充 articles): SPFA from the
// target, then in-place smoothing along a modified Bresenham line of sight.
import {
  cellKey,
  isWalkable,
  type Cell,
  type LevelMap,
  type MotionMode,
  type Tile,
} from "../level/index.ts";

/** For each cell, the cell an enemy there heads for next on its way to the target. */
export type NextNodeTable = (cell: Cell) => Cell;

/**
 * Looks up (and caches) the nextNode table for a motion mode, target cell and diagonal flag.
 * `blockers` are the 擋路格, as {@link cellKey}s; flying ignores them.
 */
export type NextNodeLookup = (
  mode: MotionMode,
  target: Cell,
  allowDiagonalMove: boolean,
  blockers?: ReadonlySet<string>,
) => NextNodeTable;

export interface PathfindingOptions {
  /**
   * 全解析's "2×x rectangle" rule: when the two cells differ by one row or one column, every
   * cell of their bounding rectangle must be clear. Stronghold-Protocol's reading omits it.
   * Default on.
   */
  rectangleRule?: boolean;
}

/** SPFA edge cost of stepping onto a `tile_hole` (an obstacle, not impassable). */
const HOLE_COST = 1_000_000;

/** SPFA edge cost of stepping onto a 擋路格: crossed only when no way round is cheaper. */
const BLOCKER_COST = 1_000;

const noBlockers: ReadonlySet<string> = new Set();

/** Neighbour scan order: up, right, down, left. */
const FOUR_WAYS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
] as const;

export function createNextNodeLookup(
  map: LevelMap,
  options: PathfindingOptions = {},
): NextNodeLookup {
  const cache = new Map<string, NextNodeTable>();
  return (mode, target, allowDiagonalMove, blockers = noBlockers) => {
    const fly = mode === "FLY";
    const blocked = fly ? noBlockers : blockers;
    const key = `${mode}|${target.row},${target.col}|${allowDiagonalMove}|${[...blocked].sort().join(";")}`;
    let table = cache.get(key);
    if (!table) {
      table = buildTable(map, fly ? flyGrid : walkGrid, blocked, target, {
        allowDiagonalMove,
        rectangleRule: options.rectangleRule ?? true,
      });
      cache.set(key, table);
    }
    return table;
  };
}

/** Per-cell passability and SPFA cost for one motion mode; obstacles are cost > 1. */
interface Grid {
  passable: (tile: Tile) => boolean;
  cost: (tile: Tile) => number;
}

const walkGrid: Grid = {
  passable: isWalkable,
  cost: (t) => (t.tileKey === "tile_hole" ? HOLE_COST : 1),
};

/** Flying: no obstacles, every step costs 1. */
const flyGrid: Grid = {
  passable: (t) => t.passableMask === "ALL" || t.passableMask === "FLY_ONLY",
  cost: () => 1,
};

function buildTable(
  map: LevelMap,
  grid: Grid,
  blockers: ReadonlySet<string>,
  target: Cell,
  los: { allowDiagonalMove: boolean; rectangleRule: boolean },
): NextNodeTable {
  const { width, height } = map;
  const inside = (row: number, col: number) => row >= 0 && row < height && col >= 0 && col < width;
  if (!inside(target.row, target.col)) return (cell) => cell;
  const n = width * height;
  // A 擋路格 only raises the cost of a cell the ground could walk anyway; a hole stays a hole.
  const cost = map.tiles.map((t, i) => {
    if (!grid.passable(t)) return Infinity;
    const blocked = blockers.has(cellKey({ row: Math.floor(i / width), col: i % width }));
    return blocked ? Math.max(grid.cost(t), BLOCKER_COST) : grid.cost(t);
  });
  /** Passable and not an obstacle (hole, 擋路格): what a line of sight may cross. */
  const clear = (row: number, col: number) => inside(row, col) && cost[row * width + col] === 1;

  // SPFA from the target: FIFO, no duplicates in the queue, strict improvement only.
  const t = target.row * width + target.col;
  const dist = new Array<number>(n).fill(Infinity);
  const next = Array.from({ length: n }, (_, i) => i);
  const inQueue = new Uint8Array(n);
  const queue = [t];
  dist[t] = 0;
  inQueue[t] = 1;
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head]!;
    inQueue[cur] = 0;
    const row = Math.floor(cur / width);
    const col = cur % width;
    for (const [dr, dc] of FOUR_WAYS) {
      if (!inside(row + dr, col + dc)) continue;
      const nb = cur + dr * width + dc;
      const d = dist[cur]! + cost[nb]!;
      if (d < dist[nb]!) {
        dist[nb] = d;
        next[nb] = cur;
        if (!inQueue[nb]) {
          inQueue[nb] = 1;
          queue.push(nb);
        }
      }
    }
  }

  // Smoothing, in cell-number order (row 0 first, left to right), updating in place: pull each
  // cell's nextNode along the chain while the cell still sees the one after it.
  const sees = (a: number, b: number) => {
    const [r0, c0, r1, c1] = [Math.floor(a / width), a % width, Math.floor(b / width), b % width];
    return los.allowDiagonalMove
      ? bresenhamClear(r0, c0, r1, c1, clear, los.rectangleRule)
      : segmentClear(r0, c0, r1, c1, clear);
  };
  for (let i = 0; i < n; i++) {
    if (i === t || dist[i] === Infinity) continue;
    let b = next[i]!;
    while (b !== t && sees(i, next[b]!)) b = next[b]!;
    next[i] = b;
  }

  return (cell) => {
    if (!inside(cell.row, cell.col)) return cell;
    const i = next[cell.row * width + cell.col]!;
    return { row: Math.floor(i / width), col: i % width };
  };
}

type Clear = (row: number, col: number) => boolean;

/** Without diagonal moves: only a straight row or column of clear cells. */
function segmentClear(r0: number, c0: number, r1: number, c1: number, clear: Clear): boolean {
  return (r0 === r1 || c0 === c1) && rectClear(r0, c0, r1, c1, clear);
}

/**
 * The modified Bresenham line of sight from the cell being smoothed, (r0, c0), to the cell it
 * tries to link to: every cell the line covers must be clear; where the minor axis steps, the
 * two cells beside that diagonal step must be clear too; and (rectangle rule) cells one row or
 * one column apart need their whole 2×x rectangle clear.
 *
 * The line is walked from (r0, c0) along the major axis with the minor offset rounded down
 * (integer division), so it lags at the start and makes its last diagonal step into the far
 * cell. That rounding is what reproduces 寻路规则补充's worked table; a centred Bresenham (as
 * drawn in 全解析's figure) lets e.g. (2,6) see (4,1) there, which the table rules out.
 */
function bresenhamClear(
  r0: number,
  c0: number,
  r1: number,
  c1: number,
  clear: Clear,
  rectangleRule: boolean,
): boolean {
  if (rectangleRule && (Math.abs(r1 - r0) === 1 || Math.abs(c1 - c0) === 1)) {
    return rectClear(r0, c0, r1, c1, clear);
  }
  const colMajor = Math.abs(c1 - c0) >= Math.abs(r1 - r0);
  const [dm, dk] = colMajor
    ? [Math.abs(c1 - c0), Math.abs(r1 - r0)]
    : [Math.abs(r1 - r0), Math.abs(c1 - c0)];
  const [sm, sk] = colMajor
    ? [Math.sign(c1 - c0), Math.sign(r1 - r0)]
    : [Math.sign(r1 - r0), Math.sign(c1 - c0)];
  /** The cell `i` major steps and `k` minor steps from (r0, c0). */
  const at = (i: number, k: number) =>
    colMajor ? clear(r0 + sk * k, c0 + sm * i) : clear(r0 + sm * i, c0 + sk * k);
  let k = 0;
  if (!at(0, 0)) return false;
  for (let i = 1; i <= dm; i++) {
    const nk = Math.floor((i * dk) / dm);
    if (nk !== k) {
      if (!at(i, k) || !at(i - 1, nk)) return false;
      k = nk;
    }
    if (!at(i, k)) return false;
  }
  return true;
}

function rectClear(r0: number, c0: number, r1: number, c1: number, clear: Clear): boolean {
  for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) {
    for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) if (!clear(r, c)) return false;
  }
  return true;
}

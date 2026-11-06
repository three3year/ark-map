// The level model: the site's level JSON, written by the data pipeline and read by the
// browser. Vocabulary follows GLOSSARY.md.

/** 格: row 0 is the bottom row, col 0 the left column. */
export interface Cell {
  row: number;
  col: number;
}

/** 座標: cell centres sit on integer points, x = col, y = row. */
export interface Vec2 {
  x: number;
  y: number;
}

export interface Tile {
  tileKey: string;
  /** "LOWLAND" | "HIGHLAND" */
  heightType: string;
  /** "ALL" | "WALK_ONLY" | "FLY_ONLY" | "NONE" */
  passableMask: string;
  buildableType: string;
}

export interface LevelMap {
  width: number;
  height: number;
  /** Row-major from the bottom row: the tile of (row, col) is `tiles[row * width + col]`. */
  tiles: Tile[];
}

/** 移動模式. "E_NUM" marks a placeholder route that never spawns anything. */
export type MotionMode = "WALK" | "FLY" | "E_NUM";

export interface Checkpoint {
  type: string;
  time: number;
  position: Cell;
  reachOffset: Vec2;
  reachDistance: number;
}

export interface Route {
  motionMode: MotionMode;
  start: Cell;
  end: Cell;
  spawnOffset: Vec2;
  checkpoints: Checkpoint[];
  allowDiagonalMove: boolean;
  visitEveryTileCenter: boolean;
  visitEveryNodeCenter: boolean;
  visitEveryCheckPoint: boolean;
}

/** 出兵動作, or a non-spawn action (story, preview...) kept for fragment timing. */
export interface Action {
  actionType: string;
  /** Enemy id for SPAWN actions. */
  key: string;
  count: number;
  preDelay: number;
  interval: number;
  routeIndex: number;
  hiddenGroup: string | null;
  randomSpawnGroupKey: string | null;
  randomSpawnGroupPackKey: string | null;
  weight: number;
  /** isUnharmfulAndAlwaysCountAsKilled */
  harmless: boolean;
}

/** 片段 */
export interface Fragment {
  preDelay: number;
  actions: Action[];
}

/** 波次 */
export interface Wave {
  preDelay: number;
  postDelay: number;
  /** 限時: seconds before the next wave starts anyway; null = wait until this wave is cleared. */
  timeLimit: number | null;
  fragments: Fragment[];
}

/** An 敵人 (kind + level) after level fallback and the level's `overwrittenData`. */
export interface EnemyRef {
  id: string;
  level: number;
  /** TW name when the TW handbook has one, else the CN name. */
  name: string;
  /** 屬性移速 */
  moveSpeed: number;
  motion: string;
  levelType: string;
  maxHp: number;
  atk: number;
  def: number;
  notCountInTotal: boolean;
  /** Site-relative avatar path, or null when no avatar was found. */
  avatar: string | null;
}

export interface LevelOptions {
  characterLimit: number;
  maxLifePoint: number;
  initialCost: number;
  maxCost: number;
  /** Level move-speed multiplier, usually 0.5. */
  moveMultiplier: number;
}

export interface Level {
  levelId: string;
  options: LevelOptions;
  map: LevelMap;
  /** Indexed by `Action.routeIndex`; placeholder routes keep their slot. */
  routes: Route[];
  extraRoutes: Route[];
  waves: Wave[];
  /** Keyed by enemy id (`Action.key`). */
  enemies: Record<string, EnemyRef>;
}

/** One stage in the site's stage index. */
export interface StageEntry {
  /** Stage id used in URLs, e.g. "main_01-07". */
  id: string;
  code: string;
  name: string;
  /** Site-relative path of the level JSON. */
  levelFile: string;
}

export interface StageIndex {
  stages: StageEntry[];
}

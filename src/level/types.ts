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
  /** TW handbook code, e.g. "B1"; shown in place of a missing avatar. */
  code: string | null;
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

/** Difficulty a variant runs at; 難度修正 whose mask matches it apply. */
export type Difficulty = "NORMAL" | "FOUR_STAR" | "SIX_STAR" | "EASY";

/** 關卡變體 kinds. Normal, challenge, six-star and easy share one level file; tough has its own. */
export type VariantId = "normal" | "challenge" | "sixStar" | "easy" | "tough";

export interface Variant {
  /** Used in URLs; unique within its stage. */
  id: VariantId;
  /** The stage-table entry this variant comes from. */
  sourceStageId: string;
  /** Site-relative path of the level JSON. */
  levelFile: string;
  difficulty: Difficulty;
}

/** One stage in the site's stage index. */
export interface StageEntry {
  /** Stage id used in URLs: the stage-table id of the base variant, e.g. "main_01-07". */
  id: string;
  /** Display code, e.g. "6-16". */
  code: string;
  name: string;
  /** Base variant first. */
  variants: Variant[];
}

/** A titled run of stages inside an area, e.g. one zone of an activity. */
export interface Section {
  /** null when the area has a single section. */
  name: string | null;
  stages: StageEntry[];
}

export type AreaKind = "MAINLINE" | "ACTIVITY" | "CAMPAIGN";

/** 區域: a mainline chapter, an activity or a campaign region. */
export interface Area {
  id: string;
  kind: AreaKind;
  /** Short label, e.g. "第六章"; null when the area has none. */
  code: string | null;
  name: string;
  sections: Section[];
}

/** Areas in display order: mainline chapters, activities newest first, campaign regions. */
export interface StageIndex {
  areas: Area[];
}

// The level model: the site's level JSON, written by the data pipeline and read by the
// browser. Vocabulary follows GLOSSARY.md.
import type { ActionType, CheckpointType } from "./enums.ts";

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
  type: CheckpointType;
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
  actionType: ActionType;
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

/**
 * 條件出兵: a branch of the level file, run when a device or an enemy skill triggers it. Its
 * phases run like a wave's fragments from the trigger second; SPAWN actions' `routeIndex`
 * points into `Level.extraRoutes`.
 */
export interface Branch {
  key: string;
  phases: Fragment[];
  /** No SPAWN action (devices such as ballistae, or previews): listed, never on the snapshot. */
  deviceOnly: boolean;
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

export interface BlackboardEntry {
  key: string;
  value: number;
  valueStr: string | null;
}

/** 難度修正: applies to a variant whose difficulty is in `difficulties`. */
export interface Modifier {
  /** Decoded mask; ALL lists every difficulty, NONE none. */
  difficulties: Difficulty[];
  key: string;
  blackboard: BlackboardEntry[];
}

export interface Level {
  levelId: string;
  options: LevelOptions;
  /** 難度修正 in level-file order, for every difficulty. */
  modifiers: Modifier[];
  map: LevelMap;
  /** Indexed by `Action.routeIndex`; placeholder routes keep their slot. */
  routes: Route[];
  /** Routes of 條件出兵 spawns, indexed by their actions' `routeIndex`. */
  extraRoutes: Route[];
  waves: Wave[];
  /** 條件出兵, in level-file order. */
  branches: Branch[];
  /** Keyed by enemy id (`Action.key`). */
  enemies: Record<string, EnemyRef>;
}

/** Difficulty a variant runs at; 難度修正 whose mask matches it apply. */
export type Difficulty = "NORMAL" | "FOUR_STAR" | "SIX_STAR" | "EASY";

/**
 * 關卡變體 kinds. Normal, challenge, six-star and easy share one level file; tough has its own.
 * 集成戰略: a node's emergency variant (緊急作戰) shares its normal file, at FOUR_STAR. A node's
 * 內容拓展 are no variants: see {@link StageEntry.expansions}.
 */
export type VariantId = "normal" | "challenge" | "sixStar" | "easy" | "tough" | "emergency";

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
  /** 集成戰略 nodes with an emergency variant (緊急作戰): its condition text, "附加條件:…". */
  emergencyCondition?: string;
  /** 集成戰略 nodes: their 內容拓展, by ascending number; absent when there are none. */
  expansions?: Expansion[];
}

/** One 內容拓展 of a 集成戰略 node: its own level file, for every variant of the node. */
export interface Expansion {
  /** 拓展編號, from the file name: `_r2` and `_dlc2` are both 2. */
  number: number;
  /** Site-relative path of the level JSON. */
  levelFile: string;
}

/** A titled run of stages inside an area, e.g. one zone of an activity. */
export interface Section {
  /**
   * null when the area has a single section, and for 集成戰略 stages that belong to no zone
   * (bosses, events, ...).
   */
  name: string | null;
  stages: StageEntry[];
}

export type AreaKind = "MAINLINE" | "ACTIVITY" | "CAMPAIGN" | "ROGUELIKE";

/** 區域: a mainline chapter, an activity, a campaign region or a 集成戰略 theme. */
export interface Area {
  id: string;
  kind: AreaKind;
  /** Short label, e.g. "第六章"; null when the area has none. */
  code: string | null;
  name: string;
  sections: Section[];
}

/** Areas in display order: mainline chapters, activities newest first, campaign regions, themes. */
export interface StageIndex {
  areas: Area[];
}

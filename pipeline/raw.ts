// Shapes of the raw game-data files, limited to the fields the pipeline reads.

/** An enum field: a name, or a number in older activity files (decoded in convertLevel.ts). */
export type RawEnum = string | number;

export interface RawCell {
  row: number;
  col: number;
}

export interface RawVec2 {
  x: number;
  y: number;
}

export interface RawTile {
  tileKey: string;
  heightType: RawEnum;
  buildableType: RawEnum;
  passableMask: RawEnum;
}

export interface RawCheckpoint {
  type: RawEnum;
  time: number;
  position: RawCell;
  reachOffset: RawVec2;
  reachDistance: number;
}

export interface RawRoute {
  motionMode: RawEnum;
  startPosition: RawCell;
  endPosition: RawCell;
  spawnOffset: RawVec2;
  checkpoints: RawCheckpoint[] | null;
  allowDiagonalMove: boolean;
  visitEveryTileCenter: boolean;
  visitEveryNodeCenter: boolean;
  visitEveryCheckPoint: boolean;
}

export interface RawAction {
  actionType: RawEnum;
  key: string;
  count: number;
  preDelay: number;
  interval: number;
  routeIndex: number;
  hiddenGroup: string | null;
  randomSpawnGroupKey: string | null;
  randomSpawnGroupPackKey: string | null;
  weight: number;
  isUnharmfulAndAlwaysCountAsKilled: boolean;
}

export interface RawWave {
  preDelay: number;
  postDelay: number;
  /** -1 = the next wave waits until this one is cleared. */
  maxTimeWaitingForNextWave: number;
  fragments: { preDelay: number; actions: RawAction[] }[];
}

/** One `{m_defined, m_value}` slot; undefined slots fall back to a lower layer. */
export interface Slot<T> {
  m_defined: boolean;
  m_value: T;
}

/** Enemy data as stored in the enemy database and in a level's `overwrittenData`. */
export interface RawEnemyData {
  name?: Slot<string | null>;
  /** The database enemy a level-local enemy (useDb false) is drawn as. */
  prefabKey?: Slot<string | null>;
  attributes?: {
    maxHp?: Slot<number>;
    atk?: Slot<number>;
    def?: Slot<number>;
    magicResistance?: Slot<number>;
    baseAttackTime?: Slot<number>;
    attackSpeed?: Slot<number>;
    moveSpeed?: Slot<number>;
    massLevel?: Slot<number>;
  };
  rangeRadius?: Slot<number>;
  lifePointReduce?: Slot<number>;
  motion?: Slot<RawEnum>;
  levelType?: Slot<RawEnum>;
  notCountInTotal?: Slot<boolean>;
}

export interface RawEnemyDbRef {
  useDb: boolean;
  id: string;
  level: number;
  overwrittenData: RawEnemyData | null;
}

export interface RawRune {
  /** "NORMAL" | "FOUR_STAR" | "SIX_STAR" | "EASY" | "ALL" | "NONE", or flags in older files. */
  difficultyMask: RawEnum;
  key: string;
  blackboard?: { key: string; value: number; valueStr: string | null }[] | null;
}

export interface RawTokenInst {
  position: RawCell;
  direction: RawEnum;
  hidden: boolean;
  /** Wave and 條件出兵 actions, and 難度修正, name the token by it; not always unique. */
  alias: string | null;
  inst: { characterKey: string; phase?: RawEnum; level?: number };
  skillIndex?: number;
  mainSkillLvl?: number;
}

export interface RawLevel {
  options: {
    characterLimit: number;
    maxLifePoint: number;
    initialCost: number;
    maxCost: number;
    moveMultiplier: number;
  };
  mapData: { map: number[][]; tiles: RawTile[] };
  /** Older activity files have null placeholders. */
  routes: (RawRoute | null)[] | null;
  extraRoutes: (RawRoute | null)[] | null;
  enemyDbRefs: RawEnemyDbRef[] | null;
  waves: RawWave[];
  /** 條件出兵 by branch key. */
  branches?: Record<string, { phases: { preDelay: number; actions: RawAction[] }[] | null }> | null;
  /** 難度修正. Older activity files give the mask as flags: 1 NORMAL, 2 FOUR_STAR. */
  runes?: RawRune[] | null;
  predefines?: { tokenInsts: RawTokenInst[] | null } | null;
}

export interface RawEnemyDatabase {
  enemies: { Key: string; Value: { level: number; enemyData: RawEnemyData }[] }[];
}

export interface RawEnemyHandbookTable {
  /** `enemyIndex` is the handbook code shown in game, e.g. "B1". */
  enemyData: Record<string, { enemyId: string; name: string; enemyIndex: string }>;
}

export interface RawTalentCandidate {
  unlockCondition: { phase: RawEnum; level: number };
  rangeId: string | null;
}

export interface RawCharacter {
  name: string;
  description: string | null;
  phases?: { rangeId: string | null }[] | null;
  skills?: { skillId: string | null }[] | null;
  talents?: { candidates: RawTalentCandidate[] | null }[] | null;
}

export type RawCharacterTable = Record<string, RawCharacter>;

export type RawSkillTable = Record<string, { levels: { rangeId: string | null }[] }>;

/**
 * Range table: the cells of a range, stored facing right: `col` is the distance forward and
 * `row` the offset to the side, both relative to the character's own cell.
 */
export type RawRangeTable = Record<string, { grids: RawCell[] }>;

export interface RawStage {
  stageId: string;
  /** Mixed case, e.g. "Obt/Main/level_main_01-07"; null for story-only stages. */
  levelId: string | null;
  zoneId: string;
  code: string | null;
  name: string | null;
  stageType: string;
  /** "NORMAL" | "FOUR_STAR" | "SIX_STAR" */
  difficulty: string;
  /** "NONE" | "NORMAL" | "TOUGH" | "EASY" | "ALL" */
  diffGroup: string;
  /** The challenge (`#f#`) entry of this stage. */
  hardStagedId: string | null;
  /** The six-star (`#s`) entry of this stage. */
  sixStarStageId: string | null;
  isStoryOnly: boolean;
}

/** A 地形's name and description; descriptions may hold rich-text tags (`<@ba.kw>…</>`). */
export interface RawTileInfo {
  tileKey: string;
  name: string;
  description: string;
  isFunctional: boolean;
}

export interface RawStageTable {
  stages: Record<string, RawStage>;
  tileInfo: Record<string, RawTileInfo>;
}

export interface RawZone {
  zoneID: string;
  zoneIndex: number;
  /** "MAINLINE" | "MAINLINE_ACTIVITY" | "ACTIVITY" | "CAMPAIGN" | ... */
  type: string;
  /** "第六章" for chapters; the English title for MAINLINE_ACTIVITY; null for activities. */
  zoneNameFirst: string | null;
  zoneNameSecond: string | null;
  /** Chapter number, "06". */
  zoneNameTitleCurrent: string | null;
}

export interface RawZoneTable {
  zones: Record<string, RawZone>;
}

export interface RawActivity {
  id: string;
  type: string;
  name: string;
  startTime: number;
  isReplicate: boolean;
}

export interface RawActivityTable {
  zoneToActivity: Record<string, string>;
  basicInfo: Record<string, RawActivity>;
}

export interface RawCampaignTable {
  campaignZones: Record<string, { id: string; name: string }>;
}

export interface RawRoguelikeStage {
  id: string;
  /** For an emergency operation (緊急作戰, `roN_e_…`): the stage it is the harder run of. */
  linkedStageId: string;
  /** Mixed case, e.g. "Obt/Roguelike/RO1/level_rogue1_1-1". */
  levelId: string;
  /** The node's 內容拓展 files, as level ids ending in `_rN` or `_dlcN`. */
  levelReplaceIds: string[];
  code: string;
  name: string;
  /** "NORMAL" | "FOUR_STAR" */
  difficulty: string;
}

export interface RawRoguelikeTopic {
  /** Zones keyed `zone_<n>`, plus hidden and special zones; no order field. */
  zones: Record<string, { id: string; name: string }>;
  /** No zone or order field: normal nodes are `roN_n_<zone>_<i>`, emergencies `roN_e_…`. */
  stages: Record<string, RawRoguelikeStage>;
}

/** 集成戰略: themes (主題) with their zones and stages. */
export interface RawRoguelikeTopicTable {
  topics: Record<string, { id: string; name: string; sort: number }>;
  details: Record<string, RawRoguelikeTopic>;
}

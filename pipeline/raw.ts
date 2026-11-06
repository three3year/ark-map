// Shapes of the raw game-data files, limited to the fields the pipeline reads.

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
  heightType: string;
  buildableType: string;
  passableMask: string;
}

export interface RawCheckpoint {
  type: string;
  time: number;
  position: RawCell;
  reachOffset: RawVec2;
  reachDistance: number;
}

export interface RawRoute {
  motionMode: string;
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
  actionType: string;
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
  attributes?: {
    maxHp?: Slot<number>;
    atk?: Slot<number>;
    def?: Slot<number>;
    moveSpeed?: Slot<number>;
  };
  motion?: Slot<string>;
  levelType?: Slot<string>;
  notCountInTotal?: Slot<boolean>;
}

export interface RawEnemyDbRef {
  useDb: boolean;
  id: string;
  level: number;
  overwrittenData: RawEnemyData | null;
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
  routes: RawRoute[] | null;
  extraRoutes: RawRoute[] | null;
  enemyDbRefs: RawEnemyDbRef[] | null;
  waves: RawWave[];
}

export interface RawEnemyDatabase {
  enemies: { Key: string; Value: { level: number; enemyData: RawEnemyData }[] }[];
}

export interface RawEnemyHandbookTable {
  enemyData: Record<string, { enemyId: string; name: string }>;
}

export interface RawStageTable {
  stages: Record<string, { stageId: string; levelId: string | null; code: string; name: string }>;
}

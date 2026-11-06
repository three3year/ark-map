// Raw level file + enemy database -> level model (the site's level JSON).
import type { Action, EnemyRef, Level, LevelMap, MotionMode, Route } from "../src/level/index.ts";
import type {
  RawAction,
  RawEnemyData,
  RawEnemyDatabase,
  RawEnemyDbRef,
  RawEnemyHandbookTable,
  RawLevel,
  RawRoute,
  Slot,
} from "./raw.ts";

export interface EnemyCatalog {
  /** Enemy id -> enemy data by level. */
  levels: Map<string, Map<number, RawEnemyData>>;
  /** Enemy id -> TW name. */
  twNames: Map<string, string>;
  /** Enemy id -> TW handbook code, e.g. "B1". */
  twCodes: Map<string, string>;
}

export function buildEnemyCatalog(
  db: RawEnemyDatabase,
  handbook: RawEnemyHandbookTable,
): EnemyCatalog {
  return {
    levels: new Map(
      db.enemies.map((e) => [e.Key, new Map(e.Value.map((v) => [v.level, v.enemyData]))]),
    ),
    twNames: new Map(Object.entries(handbook.enemyData).map(([id, e]) => [id, e.name])),
    twCodes: new Map(Object.entries(handbook.enemyData).map(([id, e]) => [id, e.enemyIndex])),
  };
}

type EnemyStats = Omit<EnemyRef, "id" | "level" | "code" | "avatar">;

/** Overlay the slots a layer defines onto `stats`. With `base`, take every slot's value. */
function overlay(stats: EnemyStats, data: RawEnemyData, base = false): EnemyStats {
  const pick = <T>(slot: Slot<T> | undefined, current: T): T =>
    slot && (base || slot.m_defined) && slot.m_value !== null ? slot.m_value : current;
  const attrs = data.attributes ?? {};
  return {
    name: pick(data.name, stats.name) ?? stats.name,
    moveSpeed: pick(attrs.moveSpeed, stats.moveSpeed),
    motion: pick(data.motion, stats.motion),
    levelType: pick(data.levelType, stats.levelType),
    maxHp: pick(attrs.maxHp, stats.maxHp),
    atk: pick(attrs.atk, stats.atk),
    def: pick(attrs.def, stats.def),
    notCountInTotal: pick(data.notCountInTotal, stats.notCountInTotal),
  };
}

const emptyStats: EnemyStats = {
  name: "",
  moveSpeed: 0,
  motion: "WALK",
  levelType: "NORMAL",
  maxHp: 0,
  atk: 0,
  def: 0,
  notCountInTotal: false,
};

/**
 * Level 0 is the base; level n overrides the slots it defines; the level's
 * `overwrittenData` overrides again. A level-local enemy (`useDb` false) is wholly its
 * `overwrittenData`. The TW handbook name wins over the CN name.
 */
export function resolveEnemy(catalog: EnemyCatalog, ref: RawEnemyDbRef): EnemyRef {
  const name = catalog.twNames.get(ref.id);
  const code = catalog.twCodes.get(ref.id) ?? null;
  if (!ref.useDb && ref.overwrittenData) {
    const stats = overlay(emptyStats, ref.overwrittenData, true);
    return { id: ref.id, level: ref.level, ...stats, name: name ?? stats.name, code, avatar: null };
  }
  const byLevel = catalog.levels.get(ref.id);
  const level0 = byLevel?.get(0);
  if (!byLevel || !level0) throw new Error(`敵人資料庫沒有 ${ref.id}`);
  let stats = overlay(emptyStats, level0, true);
  const levelN = ref.level === 0 ? undefined : byLevel.get(ref.level);
  if (levelN) stats = overlay(stats, levelN);
  if (ref.overwrittenData) stats = overlay(stats, ref.overwrittenData);
  return { id: ref.id, level: ref.level, ...stats, name: name ?? stats.name, code, avatar: null };
}

function convertAction(raw: RawAction): Action {
  return {
    actionType: raw.actionType,
    key: raw.key,
    count: raw.count,
    preDelay: raw.preDelay,
    interval: raw.interval,
    routeIndex: raw.routeIndex,
    hiddenGroup: raw.hiddenGroup,
    randomSpawnGroupKey: raw.randomSpawnGroupKey,
    randomSpawnGroupPackKey: raw.randomSpawnGroupPackKey,
    weight: raw.weight,
    harmless: raw.isUnharmfulAndAlwaysCountAsKilled,
  };
}

/** `mapData.map[0]` is the top row; the model counts rows from the bottom. */
function convertMap(raw: RawLevel["mapData"]): LevelMap {
  const height = raw.map.length;
  const width = raw.map[0]?.length ?? 0;
  const tiles = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const { tileKey, heightType, passableMask, buildableType } =
        raw.tiles[raw.map[height - 1 - row]![col]!]!;
      tiles.push({ tileKey, heightType, passableMask, buildableType });
    }
  }
  return { width, height, tiles };
}

/** A null route keeps its index slot as an E_NUM placeholder. */
const placeholderRoute: Route = {
  motionMode: "E_NUM",
  start: { row: 0, col: 0 },
  end: { row: 0, col: 0 },
  spawnOffset: { x: 0, y: 0 },
  checkpoints: [],
  allowDiagonalMove: false,
  visitEveryTileCenter: false,
  visitEveryNodeCenter: false,
  visitEveryCheckPoint: false,
};

function convertRoute(raw: RawRoute | null): Route {
  if (raw === null) return placeholderRoute;
  return {
    motionMode: raw.motionMode as MotionMode,
    start: raw.startPosition,
    end: raw.endPosition,
    spawnOffset: raw.spawnOffset,
    checkpoints: (raw.checkpoints ?? []).map(
      ({ type, time, position, reachOffset, reachDistance }) => ({
        type,
        time,
        position,
        reachOffset,
        reachDistance,
      }),
    ),
    allowDiagonalMove: raw.allowDiagonalMove,
    visitEveryTileCenter: raw.visitEveryTileCenter,
    visitEveryNodeCenter: raw.visitEveryNodeCenter,
    visitEveryCheckPoint: raw.visitEveryCheckPoint,
  };
}

export function convertLevel(levelId: string, raw: RawLevel, catalog: EnemyCatalog): Level {
  const { characterLimit, maxLifePoint, initialCost, maxCost, moveMultiplier } = raw.options;
  return {
    levelId,
    options: { characterLimit, maxLifePoint, initialCost, maxCost, moveMultiplier },
    map: convertMap(raw.mapData),
    routes: (raw.routes ?? []).map(convertRoute),
    extraRoutes: (raw.extraRoutes ?? []).map(convertRoute),
    waves: raw.waves.map((w) => ({
      preDelay: w.preDelay,
      postDelay: w.postDelay,
      fragments: w.fragments.map((f) => ({
        preDelay: f.preDelay,
        actions: f.actions.map(convertAction),
      })),
    })),
    enemies: Object.fromEntries(
      (raw.enemyDbRefs ?? []).map((ref) => [ref.id, resolveEnemy(catalog, ref)]),
    ),
  };
}

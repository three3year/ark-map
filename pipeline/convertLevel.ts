// Raw level file + enemy database -> level model (the site's level JSON).
import {
  actionTypes,
  checkpointTypes,
  isSpawn,
  type ActionType,
  type CheckpointType,
} from "../src/level/index.ts";
import type {
  Action,
  Branch,
  Difficulty,
  EnemyRef,
  Fragment,
  Level,
  LevelMap,
  Modifier,
  MotionMode,
  Route,
} from "../src/level/index.ts";
import type {
  RawAction,
  RawEnemyData,
  RawEnemyDatabase,
  RawEnemyDbRef,
  RawEnemyHandbookTable,
  RawEnum,
  RawLevel,
  RawRoute,
  RawRune,
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

/**
 * Older activity files (act1bossrush … act15d5) store enums as numbers. Only the numbers seen
 * in the CN data with evidence for their name are listed (evidence: ticket 13); any other
 * number is reported through `onUnknownEnum`, not guessed. 難度修正 masks are bit flags
 * (`maskFlags` below).
 */
const numericEnums = {
  heightType: { 0: "LOWLAND", 1: "HIGHLAND" },
  passableMask: { 2: "FLY_ONLY", 3: "ALL" },
  buildableType: { 0: "NONE", 1: "MELEE", 2: "RANGED", 3: "ALL" },
  motionMode: { 0: "WALK", 1: "FLY" },
  checkpointType: {
    0: "MOVE",
    1: "WAIT_FOR_SECONDS",
    3: "WAIT_CURRENT_FRAGMENT_TIME",
    4: "WAIT_CURRENT_WAVE_TIME",
    5: "DISAPPEAR",
    6: "APPEAR_AT_POS",
  } satisfies Record<number, CheckpointType>,
  actionType: {
    0: "SPAWN",
    1: "PREVIEW_CURSOR",
    2: "STORY",
    4: "PLAY_BGM",
    5: "DISPLAY_ENEMY_INFO",
    6: "ACTIVATE_PREDEFINED",
    8: "TRIGGER_PREDEFINED",
  } satisfies Record<number, ActionType>,
  enemyLevelType: { 0: "NORMAL", 1: "ELITE" },
  enemyMotion: {},
} satisfies Record<string, Record<number, string>>;

/** Fields whose names the level model types: any other name is unknown too. */
const knownNames: { [F in keyof Named]: readonly string[] } = {
  actionType: actionTypes,
  checkpointType: checkpointTypes,
};

interface Named {
  actionType: ActionType;
  checkpointType: CheckpointType;
}

/** 難度修正 mask bit flags used by older activity files in place of names. */
const maskFlags: [number, string][] = [
  [1, "NORMAL"],
  [2, "FOUR_STAR"],
];

const knownMaskBits = maskFlags.reduce((bits, [bit]) => bits | bit, 0);

/** The names a 難度修正 mask lists, as written: may include "ALL" and "NONE". */
export function maskNames(mask: RawEnum): string[] {
  if (typeof mask === "number") return maskFlags.filter(([bit]) => mask & bit).map(([, n]) => n);
  return mask.split(/[\s,|]+/).filter(Boolean);
}

export type NumericEnumField = keyof typeof numericEnums | "difficultyMask";

/**
 * Called once per enum value with no known name: a number, or a name the level model does not
 * type (action and checkpoint types). The value is written as `UNKNOWN_<value>`.
 */
export type UnknownEnumHandler = (field: NumericEnumField, value: number | string) => void;

type EnumField = keyof typeof numericEnums;
type Decode = <F extends EnumField>(
  field: F,
  value: RawEnum,
) => F extends keyof Named ? Named[F] : string;

function enumDecoder(onUnknown: UnknownEnumHandler): Decode {
  const decode = (field: EnumField, value: RawEnum): string => {
    const name =
      typeof value === "string" ? value : (numericEnums[field] as Record<number, string>)[value];
    const known = (knownNames as Partial<Record<EnumField, readonly string[]>>)[field];
    if (name !== undefined && (!known || known.includes(name))) return name;
    onUnknown(field, value);
    return `UNKNOWN_${value}`;
  };
  return decode as Decode;
}

const warnUnknownEnum: UnknownEnumHandler = (field, value) =>
  console.warn(`未知的數字列舉 ${field} = ${value}`);

/** Enemy fields as layered from the raw slots; `motion` and `levelType` still undecoded. */
type EnemyStats = Omit<EnemyRef, "id" | "level" | "code" | "avatar" | "motion" | "levelType"> & {
  motion: RawEnum;
  levelType: RawEnum;
};

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
function resolveEnemy(catalog: EnemyCatalog, ref: RawEnemyDbRef, decode: Decode): EnemyRef {
  const stats = layeredStats(catalog, ref);
  return {
    id: ref.id,
    level: ref.level,
    ...stats,
    name: catalog.twNames.get(ref.id) ?? stats.name,
    motion: decode("enemyMotion", stats.motion),
    levelType: decode("enemyLevelType", stats.levelType),
    code: catalog.twCodes.get(ref.id) ?? null,
    avatar: null,
  };
}

function layeredStats(catalog: EnemyCatalog, ref: RawEnemyDbRef): EnemyStats {
  if (!ref.useDb && ref.overwrittenData) return overlay(emptyStats, ref.overwrittenData, true);
  const byLevel = catalog.levels.get(ref.id);
  const level0 = byLevel?.get(0);
  if (!byLevel || !level0) throw new Error(`敵人資料庫沒有 ${ref.id}`);
  let stats = overlay(emptyStats, level0, true);
  const levelN = ref.level === 0 ? undefined : byLevel.get(ref.level);
  if (levelN) stats = overlay(stats, levelN);
  if (ref.overwrittenData) stats = overlay(stats, ref.overwrittenData);
  return stats;
}

function convertAction(raw: RawAction, decode: Decode): Action {
  return {
    actionType: decode("actionType", raw.actionType),
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
function convertMap(raw: RawLevel["mapData"], decode: Decode): LevelMap {
  const height = raw.map.length;
  const width = raw.map[0]?.length ?? 0;
  const tiles = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const { tileKey, heightType, passableMask, buildableType } =
        raw.tiles[raw.map[height - 1 - row]![col]!]!;
      tiles.push({
        tileKey,
        heightType: decode("heightType", heightType),
        passableMask: decode("passableMask", passableMask),
        buildableType: decode("buildableType", buildableType),
      });
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

function convertRoute(raw: RawRoute | null, decode: Decode): Route {
  if (raw === null) return placeholderRoute;
  return {
    motionMode: decode("motionMode", raw.motionMode) as MotionMode,
    start: raw.startPosition,
    end: raw.endPosition,
    spawnOffset: raw.spawnOffset,
    checkpoints: (raw.checkpoints ?? []).map(
      ({ type, time, position, reachOffset, reachDistance }) => ({
        type: decode("checkpointType", type),
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

const allDifficulties: Difficulty[] = ["NORMAL", "FOUR_STAR", "SIX_STAR", "EASY"];

function maskDifficulties(mask: RawEnum): Difficulty[] {
  const names = maskNames(mask);
  if (names.includes("ALL")) return allDifficulties;
  return allDifficulties.filter((d) => names.includes(d));
}

function convertModifier(raw: RawRune, onUnknown: UnknownEnumHandler): Modifier {
  const mask = raw.difficultyMask;
  if (typeof mask === "number" && (mask & ~knownMaskBits) !== 0) onUnknown("difficultyMask", mask);
  return {
    difficulties: maskDifficulties(mask),
    key: raw.key,
    blackboard: (raw.blackboard ?? []).map(({ key, value, valueStr }) => ({
      key,
      value,
      valueStr,
    })),
  };
}

/** Numeric enums come out as names; a number with no known name goes to `onUnknownEnum`. */
export function convertLevel(
  levelId: string,
  raw: RawLevel,
  catalog: EnemyCatalog,
  onUnknownEnum: UnknownEnumHandler = warnUnknownEnum,
): Level {
  const decode = enumDecoder(onUnknownEnum);
  const route = (r: RawRoute | null) => convertRoute(r, decode);
  const fragment = (f: { preDelay: number; actions: RawAction[] }): Fragment => ({
    preDelay: f.preDelay,
    actions: f.actions.map((a) => convertAction(a, decode)),
  });
  const { characterLimit, maxLifePoint, initialCost, maxCost, moveMultiplier } = raw.options;
  const branches: Branch[] = Object.entries(raw.branches ?? {}).map(([key, b]) => {
    const phases = (b.phases ?? []).map(fragment);
    const spawns = phases.some((p) => p.actions.some(isSpawn));
    return { key, phases, deviceOnly: !spawns };
  });
  const refs = raw.enemyDbRefs ?? [];
  // Some branches spawn enemies the level does not list (24 CN files; wave actions never do):
  // take them from the database at level 0.
  const listed = new Set(refs.map((r) => r.id));
  const branchOnly = branches
    .flatMap((b) => b.phases.flatMap((p) => p.actions))
    .filter((a) => isSpawn(a) && !listed.has(a.key) && catalog.levels.has(a.key))
    .map((a): RawEnemyDbRef => ({ useDb: true, id: a.key, level: 0, overwrittenData: null }));
  return {
    levelId,
    options: { characterLimit, maxLifePoint, initialCost, maxCost, moveMultiplier },
    modifiers: (raw.runes ?? []).map((r) => convertModifier(r, onUnknownEnum)),
    map: convertMap(raw.mapData, decode),
    routes: (raw.routes ?? []).map(route),
    extraRoutes: (raw.extraRoutes ?? []).map(route),
    waves: raw.waves.map((w) => ({
      preDelay: w.preDelay,
      postDelay: w.postDelay,
      timeLimit: w.maxTimeWaitingForNextWave < 0 ? null : w.maxTimeWaitingForNextWave,
      fragments: w.fragments.map(fragment),
    })),
    branches,
    enemies: Object.fromEntries(
      [...refs, ...branchOnly].map((ref) => [ref.id, resolveEnemy(catalog, ref, decode)]),
    ),
  };
}

// Raw level file + enemy database -> level model (the site's level JSON).
import {
  actionTypes,
  checkpointTypes,
  directions,
  isSpawn,
  withoutNames,
  type ActionType,
  type CheckpointType,
  type DeviceInfo,
  type Direction,
  type LevelFile,
  type NameTable,
  type UnknownEnum,
} from "../src/level/index.ts";
import type {
  Action,
  Branch,
  Device,
  Difficulty,
  EnemyRef,
  Fragment,
  Level,
  LevelMap,
  Modifier,
  MotionMode,
  Route,
} from "../src/level/index.ts";
import { blockerKeys, nonBlockerKeys } from "./deviceKinds.ts";
import {
  effectCells,
  noEffectTables,
  warnUnknownRangeId,
  type EffectContext,
  type EffectTables,
  type UnknownRangeIdHandler,
} from "./effectCells.ts";
import { plainText } from "./plainText.ts";
import type {
  RawAction,
  RawCharacterTable,
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
  // Evidence: the same device at the same cell of a same-sized map in an older and a newer file
  // reads 0 / UP 33 times, 1 / RIGHT twice and 3 / LEFT once (ballistae aiming along their lane);
  // 2 is DOWN, the one left in the game's UP, RIGHT, DOWN, LEFT order.
  direction: { 0: "UP", 1: "RIGHT", 2: "DOWN", 3: "LEFT" },
  // Evidence: 0 is the only number (384 devices); all 29 kinds placed with it read PHASE_0, and
  // never another 階段, in the newer files.
  phase: { 0: "PHASE_0" },
} satisfies Record<string, Record<number, string>>;

const phases = ["PHASE_0", "PHASE_1", "PHASE_2"] as const;

/** Fields with a closed list of names: any other name is unknown too. */
const knownNames: { [F in keyof Named]: readonly string[] } = {
  actionType: actionTypes,
  checkpointType: checkpointTypes,
  direction: directions,
  phase: phases,
};

interface Named {
  actionType: ActionType;
  checkpointType: CheckpointType;
  direction: Direction;
  phase: (typeof phases)[number] | UnknownEnum;
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
    magicResistance: pick(attrs.magicResistance, stats.magicResistance),
    baseAttackTime: pick(attrs.baseAttackTime, stats.baseAttackTime),
    attackSpeed: pick(attrs.attackSpeed, stats.attackSpeed),
    rangeRadius: pick(data.rangeRadius, stats.rangeRadius),
    applyWay: pick(data.applyWay, stats.applyWay),
    massLevel: pick(attrs.massLevel, stats.massLevel),
    lifePointReduce: pick(data.lifePointReduce, stats.lifePointReduce),
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
  magicResistance: 0,
  baseAttackTime: 0,
  attackSpeed: 0,
  rangeRadius: 0,
  applyWay: "NONE",
  massLevel: 0,
  lifePointReduce: 0,
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

export interface DeviceCatalog {
  controllers: ReadonlySet<string>;
  info: Map<string, DeviceInfo>;
  effects: EffectTables;
}

const noDevices: DeviceCatalog = {
  controllers: new Set(),
  info: new Map(),
  effects: noEffectTables,
};

export function controllerKeys(levels: Iterable<Pick<RawLevel, "predefines">>): Set<string> {
  const counts = new Map<string, { atOrigin: number; total: number }>();
  for (const level of levels) {
    for (const token of level.predefines?.tokenInsts ?? []) {
      const key = token.inst.characterKey;
      const count = counts.get(key) ?? { atOrigin: 0, total: 0 };
      if (token.position.row === 0 && token.position.col === 0) count.atOrigin++;
      count.total++;
      counts.set(key, count);
    }
  }
  return new Set([...counts].filter(([, c]) => c.atOrigin * 2 > c.total).map(([key]) => key));
}

export interface DeviceTables {
  names: { cn: RawCharacterTable; tw: RawCharacterTable };
  effects: EffectTables;
}

export function buildDeviceCatalog(
  controllers: ReadonlySet<string>,
  { names: { cn, tw }, effects }: DeviceTables,
): DeviceCatalog {
  const info = new Map<string, DeviceInfo>();
  for (const key of new Set([...Object.keys(cn), ...Object.keys(tw)])) {
    const { name, description } = tw[key] ?? cn[key]!;
    info.set(key, { name, description: description && plainText(description) });
  }
  return { controllers, info, effects };
}

export type UnknownDeviceHandler = (key: string) => void;

const warnUnknownDevice: UnknownDeviceHandler = (key) =>
  console.warn(`裝置 ${key} 不在擋路或不擋路清單(pipeline/deviceKinds.ts),當作不擋路`);

function convertDevices(
  raw: RawLevel,
  map: LevelMap,
  devices: DeviceCatalog,
  decode: Decode,
  onUnknownDevice: UnknownDeviceHandler,
  onUnknownRangeId: UnknownRangeIdHandler,
): Device[] {
  const tokens = (raw.predefines?.tokenInsts ?? []).filter(
    (t) => !devices.controllers.has(t.inst.characterKey),
  );
  const unknown = new Set<string>();
  const effects: EffectContext = {
    tables: devices.effects,
    map,
    phaseIndex: (phase) => {
      const index = (phases as readonly string[]).indexOf(decode("phase", phase));
      return index < 0 ? undefined : index;
    },
    onUnknownRangeId,
  };
  return tokens.map((token) => {
    const { alias, inst, position, hidden } = token;
    const key = inst.characterKey;
    const direction = decode("direction", token.direction);
    const blocker = blockerKeys.has(key);
    if (!blocker && !nonBlockerKeys.has(key) && !unknown.has(key)) {
      unknown.add(key);
      onUnknownDevice(key);
    }
    const info = devices.info.get(key);
    return {
      alias,
      key,
      cell: { row: position.row, col: position.col },
      direction,
      hidden,
      blocker,
      name: info?.name ?? key,
      description: info?.description ?? null,
      image: null,
      effectCells: effectCells(effects, token, direction),
    };
  });
}

export interface ConvertOptions {
  devices?: DeviceCatalog;
  onUnknownEnum?: UnknownEnumHandler;
  onUnknownDevice?: UnknownDeviceHandler;
  onUnknownRangeId?: UnknownRangeIdHandler;
}

/** Numeric enums come out as names; a number with no known name goes to `onUnknownEnum`. */
export function convertLevel(
  levelId: string,
  raw: RawLevel,
  catalog: EnemyCatalog,
  {
    devices = noDevices,
    onUnknownEnum = warnUnknownEnum,
    onUnknownDevice = warnUnknownDevice,
    onUnknownRangeId = warnUnknownRangeId,
  }: ConvertOptions = {},
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
  const map = convertMap(raw.mapData, decode);
  return {
    levelId,
    options: { characterLimit, maxLifePoint, initialCost, maxCost, moveMultiplier },
    modifiers: (raw.runes ?? []).map((r) => convertModifier(r, onUnknownEnum)),
    map,
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
    devices: convertDevices(raw, map, devices, decode, onUnknownDevice, onUnknownRangeId),
  };
}

/**
 * The level file the site ships: names the 名稱表 gives are left out. Adds the level's enemies to
 * `names` first, with the TW handbook name, else the CN database's level-0 name; a level-local
 * enemy (not in the database) gets no entry and keeps its name in the level file.
 */
export function siteLevelFile(
  level: Level,
  catalog: EnemyCatalog,
  names: NameTable,
  devices: DeviceCatalog = noDevices,
): LevelFile {
  for (const id of Object.keys(level.enemies)) {
    const name = catalog.twNames.get(id) ?? catalog.levels.get(id)?.get(0)?.name?.m_value;
    if (name) names.enemies[id] = name;
  }
  for (const { key } of level.devices) {
    const info = devices.info.get(key);
    if (info) names.devices[key] = info;
  }
  return withoutNames(level, names);
}

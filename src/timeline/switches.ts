// 開關狀態: which spawn actions produce individuals, given the 隱藏組 switched on, each
// 隨機出兵組's picked candidate and the 條件出兵 switched on. Pure; no DOM or network.
import {
  isSpawn,
  variantModifiers,
  type Action,
  type Difficulty,
  type Fragment,
  type Level,
} from "../level/index.ts";

/** A 隱藏組 with at least one spawn action, in a wave or a 條件出兵. */
export interface HiddenGroup {
  name: string;
  /** On by default: the variant's 難度修正 enable it (level_hidden_group_enable, then _disable). */
  defaultOn: boolean;
}

/** Where a fragment sits in the level file: in a wave, or (`branchIndex` set) a 條件出兵's phase. */
export type FragmentRef =
  | { branchIndex: null; waveIndex: number; fragmentIndex: number }
  | { branchIndex: number; fragmentIndex: number };

/** Where an action sits in the level file. */
export type ActionRef = FragmentRef & { actionIndex: number };

/** One way a 隨機出兵組 can go: actions that spawn together. */
export interface RandomCandidate {
  /** The keyed actions of one pack (or one unpacked keyed action), then the pack's keyless members. */
  actions: ActionRef[];
  /** Sum of the keyed actions' weights. */
  weight: number;
  /** The weight's share of the group's total; 0 when the total is 0. */
  share: number;
}

/**
 * 隨機出兵組: the actions of one fragment (or 條件出兵 phase) sharing a randomSpawnGroupKey. Keyed
 * actions sharing a randomSpawnGroupPackKey form one candidate, joined by the keyless actions of
 * that pack.
 */
export type RandomGroup = FragmentRef & {
  key: string;
  candidates: RandomCandidate[];
  /** The highest-weight candidate; the first in level-file order on ties. */
  defaultPick: number;
};

/** The switches a level offers, in level-file order: waves first, then 條件出兵. */
export interface LevelGroups {
  hidden: HiddenGroup[];
  /** Groups with at least one spawn action; indices into this list name groups in URLs. */
  random: RandomGroup[];
}

/** When a switched-on 條件出兵 is triggered: second `t` of wave `wave`. */
export interface ConditionalTrigger {
  wave: number;
  t: number;
}

/** 開關狀態. Anything left out takes the variant's default. */
export interface SpawnSwitches {
  /** 隱藏組 switched on. */
  hiddenOn?: readonly string[];
  /** Index into {@link LevelGroups.random} -> picked candidate index. */
  picks?: Readonly<Record<number, number>>;
  /** 條件出兵 switched on (all are off by default): index into `Level.branches` -> trigger. */
  conditional?: Readonly<Record<number, ConditionalTrigger>>;
}

/** A run of fragments: a wave's, or a 條件出兵's phases, which run like a wave's fragments. */
interface FragmentRun {
  fragments: Fragment[];
  at(fragmentIndex: number): FragmentRef;
}

/** Every run of fragments in the level: the waves, then the 條件出兵. */
function fragmentRuns(level: Level): FragmentRun[] {
  return [
    ...level.waves.map((wave, waveIndex) => ({
      fragments: wave.fragments,
      at: (fragmentIndex: number): FragmentRef => ({ branchIndex: null, waveIndex, fragmentIndex }),
    })),
    ...level.branches.map((branch, branchIndex) => ({
      fragments: branch.phases,
      at: (fragmentIndex: number): FragmentRef => ({ branchIndex, fragmentIndex }),
    })),
  ];
}

function* allActions(level: Level): Generator<{ ref: ActionRef; action: Action }> {
  for (const run of fragmentRuns(level)) {
    for (const [fragmentIndex, fragment] of run.fragments.entries()) {
      for (const [actionIndex, action] of fragment.actions.entries()) {
        yield { ref: { ...run.at(fragmentIndex), actionIndex }, action };
      }
    }
  }
}

export function actionAt(level: Level, ref: ActionRef): Action {
  const fragments =
    ref.branchIndex === null
      ? level.waves[ref.waveIndex]!.fragments
      : level.branches[ref.branchIndex]!.phases;
  return fragments[ref.fragmentIndex]!.actions[ref.actionIndex]!;
}

function defaultHiddenOn(level: Level, difficulty: Difficulty): Set<string> {
  const on = new Set<string>();
  for (const m of variantModifiers(level.modifiers, difficulty)) {
    const group = m.blackboard.find((b) => b.key === "key")?.valueStr;
    if (!group) continue;
    if (m.key === "level_hidden_group_enable") on.add(group);
    else if (m.key === "level_hidden_group_disable") on.delete(group);
  }
  return on;
}

function hiddenGroups(level: Level, difficulty: Difficulty): HiddenGroup[] {
  const on = defaultHiddenOn(level, difficulty);
  const names = new Set<string>();
  for (const { action } of allActions(level)) {
    if (isSpawn(action) && action.hiddenGroup) names.add(action.hiddenGroup);
  }
  return [...names].map((name) => ({ name, defaultOn: on.has(name) }));
}

/** The 隱藏組 switched on: the switches' set, else the groups on by default. */
function hiddenOnOf(groups: HiddenGroup[], switches: SpawnSwitches): Set<string> {
  return new Set(switches.hiddenOn ?? groups.filter((g) => g.defaultOn).map((g) => g.name));
}

/** A fragment's groups, by group key, with their candidates by pack key. */
type FragmentGroups = Map<string, { group: RandomGroup; packs: Map<string, RandomCandidate> }>;

/**
 * Inferred from the level files, unverified against the game: groups are scoped to one fragment
 * (the same key in another fragment is another draw); a keyless pack member joins the
 * candidates of its pack in its own fragment, else in the nearest earlier fragment of the wave
 * (or 條件出兵), else it always spawns.
 */
function randomGroups(level: Level): RandomGroup[] {
  const groups: RandomGroup[] = [];
  for (const run of fragmentRuns(level)) {
    const fragments: FragmentGroups[] = [];
    run.fragments.forEach((fragment, fragmentIndex) => {
      const at = run.at(fragmentIndex);
      const byKey: FragmentGroups = new Map();
      fragments.push(byKey);
      fragment.actions.forEach((action, actionIndex) => {
        const key = action.randomSpawnGroupKey;
        if (!key) return;
        let entry = byKey.get(key);
        if (!entry) {
          entry = { group: { ...at, key, candidates: [], defaultPick: 0 }, packs: new Map() };
          byKey.set(key, entry);
          groups.push(entry.group);
        }
        const pack = action.randomSpawnGroupPackKey;
        let candidate = pack === null ? undefined : entry.packs.get(pack);
        if (!candidate) {
          candidate = { actions: [], weight: 0, share: 0 };
          entry.group.candidates.push(candidate);
          if (pack !== null) entry.packs.set(pack, candidate);
        }
        candidate.actions.push({ ...at, actionIndex });
        candidate.weight += action.weight;
      });
      fragment.actions.forEach((action, actionIndex) => {
        const pack = action.randomSpawnGroupPackKey;
        if (action.randomSpawnGroupKey || pack === null) return;
        for (const candidate of packCandidates(fragments, pack)) {
          candidate.actions.push({ ...at, actionIndex });
        }
      });
    });
  }
  for (const group of groups) {
    const weights = group.candidates.map((c) => c.weight);
    const total = weights.reduce((sum, w) => sum + w, 0);
    for (const c of group.candidates) c.share = total > 0 ? c.weight / total : 0;
    group.defaultPick = weights.indexOf(Math.max(...weights));
  }
  return groups.filter((g) =>
    g.candidates.some((c) => c.actions.some((ref) => isSpawn(actionAt(level, ref)))),
  );
}

/** The candidates of `pack` in the latest fragment (of those so far) that has any. */
function packCandidates(fragments: FragmentGroups[], pack: string): RandomCandidate[] {
  for (let f = fragments.length - 1; f >= 0; f--) {
    const found = [...fragments[f]!.values()].flatMap(({ packs }) => packs.get(pack) ?? []);
    if (found.length > 0) return found;
  }
  return [];
}

export function levelGroups(level: Level, difficulty: Difficulty): LevelGroups {
  return { hidden: hiddenGroups(level, difficulty), random: randomGroups(level) };
}

/** `switches` with `field` set to `value`, or dropped when `value` is undefined. */
function withSwitch<K extends keyof SpawnSwitches>(
  switches: SpawnSwitches,
  field: K,
  value: SpawnSwitches[K] | undefined,
): SpawnSwitches {
  const next = { ...switches };
  delete next[field];
  return value === undefined ? next : { ...next, [field]: value };
}

const nonEmpty = <T extends object>(record: T): T | undefined =>
  Object.keys(record).length > 0 ? record : undefined;

/**
 * `switches` with hidden group `name` switched on or off. The on-set is stored in level order,
 * and dropped when it equals the variant's default, so the URL only carries changes.
 */
export function switchHidden(
  level: Level,
  difficulty: Difficulty,
  switches: SpawnSwitches,
  name: string,
  on: boolean,
): SpawnSwitches {
  const groups = hiddenGroups(level, difficulty);
  const current = hiddenOnOf(groups, switches);
  if (on) current.add(name);
  else current.delete(name);
  const isDefault = groups.every((g) => g.defaultOn === current.has(g.name));
  const hiddenOn = groups.map((g) => g.name).filter((n) => current.has(n));
  return withSwitch(switches, "hiddenOn", isDefault ? undefined : hiddenOn);
}

/** `switches` with random group `group` picking `candidate`; default picks drop out. */
export function switchPick(
  level: Level,
  switches: SpawnSwitches,
  group: number,
  candidate: number,
): SpawnSwitches {
  const picks = { ...switches.picks };
  if (randomGroups(level)[group]?.defaultPick === candidate) delete picks[group];
  else picks[group] = candidate;
  return withSwitch(switches, "picks", nonEmpty(picks));
}

/** `switches` with 條件出兵 `branch` triggered at `trigger`, or switched off with null. */
export function switchConditional(
  switches: SpawnSwitches,
  branch: number,
  trigger: ConditionalTrigger | null,
): SpawnSwitches {
  const conditional = { ...switches.conditional };
  if (trigger) conditional[branch] = trigger;
  else delete conditional[branch];
  return withSwitch(switches, "conditional", nonEmpty(conditional));
}

/** A random-group candidate an action belongs to. */
export interface Membership {
  group: number;
  candidate: number;
}

/** 開關狀態 resolved against a level: what each action does. */
export interface SpawnPlan {
  groups: LevelGroups;
  /** 隱藏組 switched on. */
  hiddenOn: ReadonlySet<string>;
  /** Picked candidate of each random group, by index. */
  picks: readonly number[];
  /** 條件出兵 switched on, by index into `Level.branches`. */
  conditional: Readonly<Record<number, ConditionalTrigger>>;
  /** Whether the action is in no random group, or in a picked candidate of one. */
  picked(ref: ActionRef): boolean;
  /** The random-group candidates the action belongs to (more than one only for keyless members). */
  memberships(ref: ActionRef): Membership[];
}

const refKey = (ref: ActionRef) =>
  `${ref.branchIndex === null ? `w${ref.waveIndex}` : `b${ref.branchIndex}`}/${ref.fragmentIndex}/${ref.actionIndex}`;

export function spawnPlan(
  level: Level,
  difficulty: Difficulty,
  switches: SpawnSwitches = {},
): SpawnPlan {
  const groups = levelGroups(level, difficulty);
  const picks = groups.random.map((g, i) => {
    const pick = switches.picks?.[i];
    return pick !== undefined && pick >= 0 && pick < g.candidates.length ? pick : g.defaultPick;
  });
  const members = new Map<string, Membership[]>();
  groups.random.forEach((g, group) =>
    g.candidates.forEach((c, candidate) => {
      for (const ref of c.actions) {
        const key = refKey(ref);
        members.set(key, [...(members.get(key) ?? []), { group, candidate }]);
      }
    }),
  );
  const memberships = (ref: ActionRef) => members.get(refKey(ref)) ?? [];
  return {
    groups,
    hiddenOn: hiddenOnOf(groups.hidden, switches),
    picks,
    conditional: switches.conditional ?? {},
    memberships,
    picked(ref) {
      const of = memberships(ref);
      return of.length === 0 || of.some((m) => picks[m.group] === m.candidate);
    },
  };
}

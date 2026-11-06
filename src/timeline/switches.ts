// 開關狀態: which spawn actions produce individuals, given the 隱藏組 switched on and each
// 隨機出兵組's picked candidate. Pure; no DOM or network.
import {
  isSpawn,
  variantModifiers,
  type Action,
  type Branch,
  type Difficulty,
  type Level,
} from "../level/index.ts";

/** A 隱藏組 with at least one spawn action. */
export interface HiddenGroup {
  name: string;
  /** On by default: the variant's 難度修正 enable it (level_hidden_group_enable, then _disable). */
  defaultOn: boolean;
}

/** Where an action sits in the level file. */
export interface ActionRef {
  waveIndex: number;
  fragmentIndex: number;
  actionIndex: number;
}

/** One way a 隨機出兵組 can go: actions that spawn together. */
export interface RandomCandidate {
  /** The keyed actions of one pack (or one unpacked keyed action), then the pack's keyless members. */
  actions: ActionRef[];
  /** Sum of the keyed actions' weights. */
  weight: number;
}

/**
 * 隨機出兵組: the actions of one fragment sharing a randomSpawnGroupKey. Keyed actions sharing a
 * randomSpawnGroupPackKey form one candidate, joined by the keyless actions of that pack.
 */
export interface RandomGroup {
  waveIndex: number;
  fragmentIndex: number;
  key: string;
  candidates: RandomCandidate[];
  /** The highest-weight candidate; the first in level-file order on ties. */
  defaultPick: number;
}

/** The switches a level offers, in level-file order. */
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

/** A switched-on 條件出兵, run as a level of one wave: see {@link triggeredBranches}. */
export interface TriggeredBranch {
  branchIndex: number;
  /** Trigger second in the wave; the branch's wave 0 starts here. */
  t: number;
  level: Level;
  plan: SpawnPlan;
}

/**
 * The 條件出兵 switched on in `waveIndex`. Each runs as a level of one wave whose fragments are
 * the branch's phases, so its timing, 隱藏組 and 隨機出兵組 (default picks only) follow the rules
 * of a wave.
 */
export function triggeredBranches(
  level: Level,
  difficulty: Difficulty,
  switches: SpawnSwitches,
  waveIndex: number,
): TriggeredBranch[] {
  return Object.entries(switches.conditional ?? {}).flatMap(([index, trigger]) => {
    const branch: Branch | undefined = level.branches[Number(index)];
    if (!branch || trigger.wave !== waveIndex) return [];
    const wave = { preDelay: 0, postDelay: 0, timeLimit: null, fragments: branch.phases };
    const sub: Level = { ...level, waves: [wave], branches: [] };
    const plan = spawnPlan(sub, difficulty, { hiddenOn: switches.hiddenOn });
    return [{ branchIndex: Number(index), t: trigger.t, level: sub, plan }];
  });
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
  const next = { ...switches };
  delete next.conditional;
  return Object.keys(conditional).length > 0 ? { ...next, conditional } : next;
}

function* allActions(level: Level): Generator<ActionRef & { action: Action }> {
  for (const [waveIndex, wave] of level.waves.entries()) {
    for (const [fragmentIndex, fragment] of wave.fragments.entries()) {
      for (const [actionIndex, action] of fragment.actions.entries()) {
        yield { waveIndex, fragmentIndex, actionIndex, action };
      }
    }
  }
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

/** A fragment's groups, by group key, with their candidates by pack key. */
type FragmentGroups = Map<string, { group: RandomGroup; packs: Map<string, RandomCandidate> }>;

/**
 * Inferred from the level files, unverified against the game: groups are scoped to one fragment
 * (the same key in another fragment is another draw); a keyless pack member joins the
 * candidates of its pack in its own fragment, else in the nearest earlier fragment of the wave,
 * else it always spawns.
 */
function randomGroups(level: Level): RandomGroup[] {
  const groups: RandomGroup[] = [];
  level.waves.forEach((wave, waveIndex) => {
    const fragments: FragmentGroups[] = [];
    wave.fragments.forEach((fragment, fragmentIndex) => {
      const byKey: FragmentGroups = new Map();
      fragments.push(byKey);
      fragment.actions.forEach((action, actionIndex) => {
        const key = action.randomSpawnGroupKey;
        if (!key) return;
        let entry = byKey.get(key);
        if (!entry) {
          entry = {
            group: { waveIndex, fragmentIndex, key, candidates: [], defaultPick: 0 },
            packs: new Map(),
          };
          byKey.set(key, entry);
          groups.push(entry.group);
        }
        const pack = action.randomSpawnGroupPackKey;
        let candidate = pack === null ? undefined : entry.packs.get(pack);
        if (!candidate) {
          candidate = { actions: [], weight: 0 };
          entry.group.candidates.push(candidate);
          if (pack !== null) entry.packs.set(pack, candidate);
        }
        candidate.actions.push({ waveIndex, fragmentIndex, actionIndex });
        candidate.weight += action.weight;
      });
      fragment.actions.forEach((action, actionIndex) => {
        const pack = action.randomSpawnGroupPackKey;
        if (action.randomSpawnGroupKey || pack === null) return;
        for (const candidate of packCandidates(fragments, pack)) {
          candidate.actions.push({ waveIndex, fragmentIndex, actionIndex });
        }
      });
    });
  });
  for (const group of groups) {
    const weights = group.candidates.map((c) => c.weight);
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

function actionAt(level: Level, ref: ActionRef): Action {
  return level.waves[ref.waveIndex]!.fragments[ref.fragmentIndex]!.actions[ref.actionIndex]!;
}

export function levelGroups(level: Level, difficulty: Difficulty): LevelGroups {
  return { hidden: hiddenGroups(level, difficulty), random: randomGroups(level) };
}

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
  const current = new Set(
    switches.hiddenOn ?? groups.filter((g) => g.defaultOn).map((g) => g.name),
  );
  if (on) current.add(name);
  else current.delete(name);
  const next = { ...switches };
  delete next.hiddenOn;
  if (groups.every((g) => g.defaultOn === current.has(g.name))) return next;
  return { ...next, hiddenOn: groups.map((g) => g.name).filter((n) => current.has(n)) };
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
  const next = { ...switches };
  delete next.picks;
  return Object.keys(picks).length > 0 ? { ...next, picks } : next;
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
  /** Whether the action produces individuals: its hidden group is on and its candidate picked. */
  spawns(ref: ActionRef): boolean;
  /** The random-group candidates the action belongs to (more than one only for keyless members). */
  memberships(ref: ActionRef): Membership[];
}

const refKey = ({ waveIndex, fragmentIndex, actionIndex }: ActionRef) =>
  `${waveIndex}/${fragmentIndex}/${actionIndex}`;

export function spawnPlan(
  level: Level,
  difficulty: Difficulty,
  switches: SpawnSwitches = {},
): SpawnPlan {
  const groups = levelGroups(level, difficulty);
  const hiddenOn = new Set(
    switches.hiddenOn ?? groups.hidden.filter((g) => g.defaultOn).map((g) => g.name),
  );
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
    hiddenOn,
    picks,
    memberships,
    spawns(ref) {
      const { hiddenGroup } = actionAt(level, ref);
      if (hiddenGroup !== null && !hiddenOn.has(hiddenGroup)) return false;
      const of = memberships(ref);
      return of.length === 0 || of.some((m) => picks[m.group] === m.candidate);
    },
  };
}

import { describe, expect, it } from "vitest";
import { loadFixtureLevel } from "../../test-fixtures/load.ts";
import {
  indexedDevices,
  type Action,
  type Device,
  type Level,
  type Tile,
  type Wave,
} from "../level/index.ts";
import { buildTimeline, levelGroups, type Timeline, type TimelineOptions } from "./index.ts";

const road: Tile = {
  tileKey: "tile_road",
  heightType: "LOWLAND",
  passableMask: "ALL",
  buildableType: "MELEE",
};

const stone: Device = {
  alias: "stone",
  key: "trap_027_stone",
  cell: { row: 0, col: 2 },
  direction: "UP",
  hidden: true,
  blocker: true,
  name: "碎石",
  description: null,
  image: null,
  effectCells: [],
};

const action = (fields: Partial<Action>): Action => ({
  actionType: "SPAWN",
  key: "enemy_test",
  count: 1,
  preDelay: 0,
  interval: 0,
  routeIndex: 0,
  hiddenGroup: null,
  randomSpawnGroupKey: null,
  randomSpawnGroupPackKey: null,
  weight: 0,
  harmless: false,
  ...fields,
});
const spawn = (preDelay = 0) => action({ preDelay });
const activate = (fields: Partial<Action> = {}) =>
  action({ actionType: "ACTIVATE_PREDEFINED", key: "stone", ...fields });
const withdraw = (fields: Partial<Action> = {}) =>
  action({ actionType: "WITHDRAW_PREDEFINED", key: "stone", ...fields });

const wave = (actions: Action[], fragmentDelay = 0): Wave => ({
  preDelay: 0,
  postDelay: 0,
  timeLimit: null,
  fragments: [{ preDelay: fragmentDelay, actions }],
});

function field(waves: Wave[], device: Partial<Device> = {}): Level {
  return {
    levelId: "test/devices",
    options: {
      characterLimit: 8,
      maxLifePoint: 3,
      initialCost: 10,
      maxCost: 99,
      moveMultiplier: 1,
    },
    modifiers: [],
    map: { width: 5, height: 2, tiles: Array.from({ length: 10 }, () => road) },
    routes: [
      {
        motionMode: "WALK",
        start: { row: 0, col: 0 },
        end: { row: 0, col: 4 },
        spawnOffset: { x: 0, y: 0 },
        checkpoints: [],
        allowDiagonalMove: false,
        visitEveryTileCenter: false,
        visitEveryNodeCenter: false,
        visitEveryCheckPoint: false,
      },
    ],
    extraRoutes: [],
    branches: [],
    devices: [{ ...stone, ...device }],
    waves,
    enemies: {
      enemy_test: {
        id: "enemy_test",
        level: 0,
        name: "測試",
        code: null,
        moveSpeed: 1,
        motion: "WALK",
        levelType: "NORMAL",
        maxHp: 1,
        atk: 0,
        def: 0,
        magicResistance: 0,
        baseAttackTime: 0,
        attackSpeed: 100,
        rangeRadius: 0,
        massLevel: 0,
        lifePointReduce: 1,
        notCountInTotal: false,
        avatar: null,
      },
    },
  };
}

function stoneOn(level: Level, waveIndex: number, t: number, options: TimelineOptions = {}) {
  return buildTimeline(level, { ...options, waveIndex }).devicesAt(t).length > 0;
}

describe("波次啟動: a wave's ACTIVATE_PREDEFINED", () => {
  const level = field([wave([spawn()]), wave([spawn(), activate({ preDelay: 1 })], 2), wave([])]);

  it("puts the hidden device on from the second the action runs", () => {
    expect(stoneOn(level, 1, 2.9)).toBe(false);
    expect(stoneOn(level, 1, 3)).toBe(true);
  });

  it("leaves the waves before it without the device", () => {
    expect(stoneOn(level, 0, 0)).toBe(false);
    expect(stoneOn(level, 0, 100)).toBe(false);
  });

  it("keeps it on in later waves, from their start", () => {
    expect(stoneOn(level, 2, 0)).toBe(true);
  });
});

describe("擋路裝置 activated mid-wave", () => {
  const level = field([wave([spawn(), activate({ preDelay: 1 })])]);
  const bare = field([wave([spawn()])]);
  const [walker] = buildTimeline(level).individuals;
  const [straight] = buildTimeline(bare).individuals;

  it("leaves the way before the activation as it was", () => {
    for (const t of [0, 0.5, 1]) expect(walker!.stateAt(t)).toEqual(straight!.stateAt(t));
  });

  it("turns the individual on the field from that second: round by the top row, 2 s longer", () => {
    expect(straight!.leakTime).toBe(4);
    expect(walker!.leakTime).toBe(6);
    expect(walker!.stateAt(2)).toMatchObject({ position: { x: 1, y: 1 } });
  });
});

describe("撤走: a wave's WITHDRAW_PREDEFINED", () => {
  const level = field([wave([spawn(), withdraw({ preDelay: 1 })]), wave([spawn()])], {
    hidden: false,
  });

  it("keeps the device on all through the wave that withdraws it", () => {
    expect(stoneOn(level, 0, 0)).toBe(true);
    expect(stoneOn(level, 0, 100)).toBe(true);
  });

  it("takes it off from the next wave on, ground routes included", () => {
    const next = buildTimeline(level, { waveIndex: 1 });
    expect(next.devicesAt(0)).toEqual([]);
    expect(next.individuals[0]!.leakTime).toBe(4);
  });
});

describe("activating a device that is on the field", () => {
  it("does nothing: it stays on, routes as they were", () => {
    const shown = { hidden: false };
    const again = field([wave([spawn(), activate({ preDelay: 1 })]), wave([spawn()])], shown);
    const plain = field([wave([spawn()]), wave([spawn()])], shown);
    for (const waveIndex of [0, 1]) {
      const timeline = buildTimeline(again, { waveIndex });
      expect(timeline.devicesAt(0)).toHaveLength(1);
      expect(timeline.individuals[0]!.leakTime).toBe(
        buildTimeline(plain, { waveIndex }).individuals[0]!.leakTime,
      );
    }
  });
});

describe("移除 is final", () => {
  it("a device removed in one wave stays off though a later wave activates it again", () => {
    const level = field([wave([activate()]), wave([spawn(), activate({ preDelay: 1 })])]);
    const removals = new Map([[indexedDevices(level)[0]!.index, { wave: 0, t: 5 }]]);
    const later = buildTimeline(level, { waveIndex: 1, removals });
    expect(later.devicesAt(2)).toEqual([]);
    expect(later.individuals[0]!.leakTime).toBe(4);
  });
});

describe("device actions obey the 開關狀態", () => {
  describe("隱藏組", () => {
    const level = field([wave([spawn(), activate({ hiddenGroup: "g" })])]);

    it("a group with only device actions is listed, off unless a 難度修正 turns it on", () => {
      expect(levelGroups(level, "NORMAL").hidden).toEqual([{ name: "g", defaultOn: false }]);
      const enabled = {
        ...level,
        modifiers: [
          {
            difficulties: ["NORMAL" as const],
            key: "level_hidden_group_enable",
            blackboard: [{ key: "key", value: 0, valueStr: "g" }],
          },
        ],
      };
      expect(levelGroups(enabled, "NORMAL").hidden).toEqual([{ name: "g", defaultOn: true }]);
      expect(stoneOn(enabled, 0, 0)).toBe(true);
    });

    it("an activation in a group switched off does not run; switched on, it does", () => {
      expect(stoneOn(level, 0, 0)).toBe(false);
      expect(stoneOn(level, 0, 0, { switches: { hiddenOn: ["g"] } })).toBe(true);
    });

    it("so does a withdrawal", () => {
      const shown = field([wave([withdraw({ hiddenGroup: "g" })]), wave([])], { hidden: false });
      expect(stoneOn(shown, 1, 0)).toBe(true);
      expect(stoneOn(shown, 1, 0, { switches: { hiddenOn: ["g"] } })).toBe(false);
    });
  });

  describe("隨機出兵組", () => {
    const random = (fields: Partial<Action>) => ({ randomSpawnGroupKey: "r", ...fields });
    const level = field([
      wave([
        spawn(),
        activate(random({ weight: 1 })),
        action(random({ actionType: "EMPTY", key: "", weight: 3 })),
      ]),
    ]);

    it("a group with only device actions is listed, the heaviest candidate picked by default", () => {
      const [group] = levelGroups(level, "NORMAL").random;
      expect(group?.candidates.map((c) => c.weight)).toEqual([1, 3]);
      expect(group?.defaultPick).toBe(1);
    });

    it("an activation outside the picked candidate does not run", () => {
      expect(stoneOn(level, 0, 0)).toBe(false);
      expect(stoneOn(level, 0, 0, { switches: { picks: { 0: 0 } } })).toBe(true);
    });

    it("so does a withdrawal", () => {
      const shown = field(
        [
          wave([
            withdraw(random({ weight: 1 })),
            action(random({ weight: 3, actionType: "EMPTY" })),
          ]),
          wave([]),
        ],
        { hidden: false },
      );
      expect(stoneOn(shown, 1, 0)).toBe(true);
      expect(stoneOn(shown, 1, 0, { switches: { picks: { 0: 0 } } })).toBe(false);
    });
  });
});

describe("條件出兵 activation", () => {
  describe("EP-8: HidenCnnon puts the hidden 加農炮 #3 on from its trigger second", () => {
    const level = loadFixtureLevel("level_act39side_08");
    const branch = level.branches.findIndex((b) => b.key === "HidenCnnon");
    const cannons = (timeline: Timeline, t: number) =>
      timeline.devicesAt(t).map(({ device }) => device.alias);
    const on = { switches: { conditional: { [branch]: { wave: 0, t: 20 } } } };

    it("is off while the 條件出兵 is off", () => {
      expect(cannons(buildTimeline(level), 100)).not.toContain("trap_196_cnnon#3");
    });

    it("switched on, comes on at the trigger second", () => {
      const timeline = buildTimeline(level, on);
      expect(cannons(timeline, 19.9)).toEqual(["trap_196_cnnon#1", "trap_196_cnnon#2"]);
      expect(cannons(timeline, 20)).toContain("trap_196_cnnon#3");
    });

    it("stays on in the waves after", () => {
      expect(cannons(buildTimeline(level, { ...on, waveIndex: 1 }), 0)).toContain(
        "trap_196_cnnon#3",
      );
    });
  });

  it("5-10: the ballistae its 純機關 faust_ballis activates stay off, even were it switched on", () => {
    const level = loadFixtureLevel("level_main_05-10");
    const branch = level.branches.findIndex((b) => b.key === "faust_ballis");
    expect(level.branches[branch]!.deviceOnly).toBe(true);
    const conditional = { [branch]: { wave: 0, t: 0 } };
    level.waves.forEach((_, waveIndex) => {
      const timeline = buildTimeline(level, { waveIndex, switches: { conditional } });
      expect(timeline.devicesAt(0)).toEqual([]);
      expect(timeline.devicesAt(1000)).toEqual([]);
    });
  });

  it("a 純機關's device actions get no switch: they never run", () => {
    const level = field([wave([spawn()])]);
    level.branches = [
      {
        key: "machine",
        deviceOnly: true,
        phases: [
          { preDelay: 0, actions: [activate({ hiddenGroup: "m", randomSpawnGroupKey: "r" })] },
        ],
      },
    ];
    expect(levelGroups(level, "NORMAL")).toEqual({ hidden: [], random: [] });
  });
});

describe("a device with no alias", () => {
  it("act1dp_01: its 20 绒绒云团 have a null alias and are on the field from the start", () => {
    const level = loadFixtureLevel("level_act1dp_01");
    expect(level.devices.map((d) => d.alias)).toEqual(Array.from({ length: 20 }, () => null));
    expect(buildTimeline(level).devicesAt(0)).toHaveLength(20);
  });

  it("no withdrawal or 難度修正, even keyed by an empty alias, reaches it", () => {
    const level = field([wave([withdraw({ key: "" })]), wave([])], {
      alias: null,
      hidden: false,
    });
    level.modifiers = [
      {
        difficulties: ["NORMAL"],
        key: "level_predefines_enable",
        blackboard: [{ key: "", value: 0, valueStr: null }],
      },
    ];
    expect(stoneOn(level, 0, 0)).toBe(true);
    expect(stoneOn(level, 1, 0)).toBe(true);
  });
});

it("a hidden device nothing activates is never on the field and changes no route", () => {
  const level = field([wave([spawn()]), wave([spawn()])]);
  for (const waveIndex of [0, 1]) {
    const timeline = buildTimeline(level, { waveIndex });
    expect(timeline.devicesAt(0)).toEqual([]);
    expect(timeline.devicesAt(100)).toEqual([]);
    expect(timeline.individuals[0]!.leakTime).toBe(4);
  }
});

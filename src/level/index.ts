import type {
  Action,
  Cell,
  DeviceIndex,
  IndexedDevice,
  Level,
  LevelMap,
  Tile,
  Vec2,
} from "./types.ts";

export type * from "./types.ts";
export * from "./enums.ts";
export * from "./expansion.ts";
export * from "./modifiers.ts";
export * from "./names.ts";

/** An 出兵動作, as opposed to the story, preview and device actions kept for fragment timing. */
export function isSpawn(action: Action): boolean {
  return action.actionType === "SPAWN";
}

export type DeviceActionKind = "activate" | "withdraw";

/** What a device action does to the devices its key names; null for any other action. */
export function deviceActionKind(action: Action): DeviceActionKind | null {
  switch (action.actionType) {
    case "ACTIVATE_PREDEFINED":
      return "activate";
    case "WITHDRAW_PREDEFINED":
      return "withdraw";
    default:
      return null;
  }
}

export const isDeviceAction = (action: Action): boolean => deviceActionKind(action) !== null;

export const indexedDevices = ({ devices }: Pick<Level, "devices">): IndexedDevice[] =>
  devices.map((device, i) => ({ index: i as DeviceIndex, device }));

/** "row,col": unique within one map. */
export function cellKey({ row, col }: Cell): string {
  return `${row},${col}`;
}

export function tileAt(map: LevelMap, cell: Cell): Tile | undefined {
  if (cell.row < 0 || cell.row >= map.height || cell.col < 0 || cell.col >= map.width) {
    return undefined;
  }
  return map.tiles[cell.row * map.width + cell.col];
}

export function cellCenter(cell: Cell): Vec2 {
  return { x: cell.col, y: cell.row };
}

export function isWalkable(tile: Tile): boolean {
  return tile.passableMask === "ALL" || tile.passableMask === "WALK_ONLY";
}

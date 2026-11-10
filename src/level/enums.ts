// Names the level model uses for action and checkpoint types: every value in the CN level files
// (2,713 files, ticket 14). The pipeline writes any other value as `UNKNOWN_<value>` and warns.

export const actionTypes = [
  "SPAWN",
  "PREVIEW_CURSOR",
  "STORY",
  "PLAY_BGM",
  "DISPLAY_ENEMY_INFO",
  "ACTIVATE_PREDEFINED",
  "TRIGGER_PREDEFINED",
  "WITHDRAW_PREDEFINED",
  "PLAY_OPERA",
  "DIALOG",
  "BATTLE_EVENTS",
  "EMPTY",
] as const;

export const checkpointTypes = [
  "MOVE",
  "PATROL_MOVE",
  "MAP_OFFSET_MOVE",
  "WAIT_FOR_SECONDS",
  "WAIT_CURRENT_FRAGMENT_TIME",
  "WAIT_CURRENT_WAVE_TIME",
  "WAIT_BOSSRUSH_WAVE",
  "DISAPPEAR",
  "APPEAR_AT_POS",
] as const;

export const directions = ["UP", "RIGHT", "DOWN", "LEFT"] as const;

/** A value with no known name: a number of the older numeric files, or a new name. */
export type UnknownEnum = `UNKNOWN_${string}`;

export type ActionType = (typeof actionTypes)[number] | UnknownEnum;
export type CheckpointType = (typeof checkpointTypes)[number] | UnknownEnum;
export type Direction = (typeof directions)[number] | UnknownEnum;

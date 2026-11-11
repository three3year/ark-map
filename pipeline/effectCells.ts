import { directions, type Cell, type Direction, type LevelMap } from "../src/level/index.ts";
import type {
  RawCharacter,
  RawCharacterTable,
  RawEnum,
  RawRangeTable,
  RawSkillTable,
  RawTalentCandidate,
  RawTokenInst,
} from "./raw.ts";

export interface EffectTables {
  characters: RawCharacterTable;
  skills: RawSkillTable;
  ranges: RawRangeTable;
}

export const noEffectTables: EffectTables = { characters: {}, skills: {}, ranges: {} };

export type UnknownRangeIdHandler = (rangeId: string, key: string) => void;

export const warnUnknownRangeId: UnknownRangeIdHandler = (rangeId, key) =>
  console.warn(`裝置 ${key} 的作用範圍 id ${rangeId} 不在範圍表,當作沒有作用範圍`);

/** A 階段 as its index; undefined for a 階段 with no known name. */
export type PhaseIndex = (phase: RawEnum) => number | undefined;

export interface EffectContext {
  tables: EffectTables;
  map: Pick<LevelMap, "width" | "height">;
  phaseIndex: PhaseIndex;
  onUnknownRangeId: UnknownRangeIdHandler;
}

function talentRangeIds(
  character: RawCharacter,
  token: RawTokenInst,
  phase: number,
  phaseIndex: PhaseIndex,
): (string | null)[] {
  const level = token.inst.level ?? 1;
  const unlocked = ({ unlockCondition: c }: RawTalentCandidate) => {
    const at = phaseIndex(c.phase);
    return at !== undefined && (at < phase || (at === phase && c.level <= level));
  };
  return (character.talents ?? []).map(
    (talent) => (talent.candidates ?? []).filter(unlocked).at(-1)?.rangeId ?? null,
  );
}

function rangeIdCandidates(
  { tables, phaseIndex }: EffectContext,
  token: RawTokenInst,
): (string | null)[] {
  const character = tables.characters[token.inst.characterKey];
  if (!character) return [];
  const phase = phaseIndex(token.inst.phase ?? "PHASE_0");
  if (phase === undefined) return [];
  const phases = character.phases ?? [];
  const phaseRange = phases[phase] ?? phases.at(-1);
  return [
    phaseRange?.rangeId ?? null,
    skillRangeId(tables.skills, character, token),
    ...talentRangeIds(character, token, phase, phaseIndex),
  ];
}

function skillRangeId(
  skills: RawSkillTable,
  character: RawCharacter,
  { skillIndex = 0, mainSkillLvl = 1 }: RawTokenInst,
): string | null {
  if (skillIndex === -1) return null;
  const skillId = character.skills?.[skillIndex]?.skillId;
  const levels = (skillId && skills[skillId]?.levels) || [];
  return (levels[mainSkillLvl - 1] ?? levels.at(-1))?.rangeId ?? null;
}

interface Offset {
  row: number;
  col: number;
}

function chosenOffsets(context: EffectContext, token: RawTokenInst): Offset[] {
  const { tables, onUnknownRangeId } = context;
  for (const id of rangeIdCandidates(context, token)) {
    if (id === null) continue;
    const range = tables.ranges[id];
    if (!range) {
      onUnknownRangeId(id, token.inst.characterKey);
      return [];
    }
    if (range.grids.some((g) => g.row !== 0 || g.col !== 0)) return range.grids;
  }
  return [];
}

type Facing = (typeof directions)[number];

const isFacing = (direction: Direction): direction is Facing =>
  (directions as readonly string[]).includes(direction);

function rotate({ row, col }: Offset, facing: Facing): Offset {
  switch (facing) {
    case "RIGHT":
      return { row, col };
    case "UP":
      return { row: col, col: -row };
    case "DOWN":
      return { row: -col, col: row };
    case "LEFT":
      return { row: -row, col: -col };
  }
}

export function effectCells(
  context: EffectContext,
  token: RawTokenInst,
  direction: Direction,
): Cell[] {
  const { map } = context;
  if (!isFacing(direction)) return [];
  return chosenOffsets(context, token)
    .map((offset) => rotate(offset, direction))
    .map((d) => ({ row: token.position.row + d.row, col: token.position.col + d.col }))
    .filter(({ row, col }) => row >= 0 && row < map.height && col >= 0 && col < map.width);
}

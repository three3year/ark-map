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

function phaseIndex(phase: RawEnum | undefined): number {
  if (phase === undefined) return 0;
  if (typeof phase === "number") return phase;
  return Number(phase.replace("PHASE_", "")) || 0;
}

function talentRangeIds(character: RawCharacter, token: RawTokenInst): (string | null)[] {
  const phase = phaseIndex(token.inst.phase);
  const level = token.inst.level ?? 1;
  const unlocked = ({ unlockCondition: c }: RawTalentCandidate) => {
    const at = phaseIndex(c.phase);
    return at < phase || (at === phase && c.level <= level);
  };
  return (character.talents ?? []).map(
    (talent) => (talent.candidates ?? []).filter(unlocked).at(-1)?.rangeId ?? null,
  );
}

function rangeIdCandidates(tables: EffectTables, token: RawTokenInst): (string | null)[] {
  const character = tables.characters[token.inst.characterKey];
  if (!character) return [];
  const phases = character.phases ?? [];
  const phase = phases[phaseIndex(token.inst.phase)] ?? phases.at(-1);
  return [
    phase?.rangeId ?? null,
    skillRangeId(tables.skills, character, token),
    ...talentRangeIds(character, token),
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

function chosenOffsets(
  tables: EffectTables,
  token: RawTokenInst,
  onUnknownRangeId: UnknownRangeIdHandler,
): Cell[] {
  for (const id of rangeIdCandidates(tables, token)) {
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

function rotate({ row, col }: Cell, facing: Facing): Cell {
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
  tables: EffectTables,
  token: RawTokenInst,
  direction: Direction,
  map: Pick<LevelMap, "width" | "height">,
  onUnknownRangeId: UnknownRangeIdHandler,
): Cell[] {
  if (!isFacing(direction)) return [];
  return chosenOffsets(tables, token, onUnknownRangeId)
    .map((offset) => rotate(offset, direction))
    .map((d) => ({ row: token.position.row + d.row, col: token.position.col + d.col }))
    .filter(({ row, col }) => row >= 0 && row < map.height && col >= 0 && col < map.width);
}

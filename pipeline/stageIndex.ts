// Stage, zone, activity and campaign tables -> the site's stage index (區域 -> 關卡 -> 變體).
import type {
  Area,
  AreaKind,
  Difficulty,
  Expansion,
  Section,
  StageEntry,
  StageIndex,
  Variant,
  VariantId,
} from "../src/level/index.ts";
import { maskNames } from "./convertLevel.ts";
import type {
  RawActivity,
  RawActivityTable,
  RawCampaignTable,
  RawLevel,
  RawRoguelikeStage,
  RawRoguelikeTopicTable,
  RawStage,
  RawStageTable,
  RawZone,
  RawZoneTable,
} from "./raw.ts";

export interface GameTables {
  stage: RawStageTable;
  zone: RawZoneTable;
  activity: RawActivityTable;
  campaign: RawCampaignTable;
  roguelike: RawRoguelikeTopicTable;
}

/** CN tables are the data; TW tables only supply names and lag CN, so every lookup falls back. */
export interface StageIndexTables {
  cn: GameTables;
  tw: GameTables;
}

/** What the index needs to know about a level file that exists. */
export interface LevelFacts {
  /** Difficulties named by the file's 難度修正 masks. */
  difficulties: string[];
}

export function levelFacts(raw: RawLevel): LevelFacts {
  const masks = (raw.runes ?? []).flatMap((r) => maskNames(r.difficultyMask));
  return { difficulties: [...new Set(masks.filter(Boolean))] };
}

/**
 * A stage, or one 內容拓展 of it, left out of the index: by default because its level file is
 * missing upstream; `unlinkedEmergency` is a 緊急作戰 whose `linkedStageId` names no node of its
 * theme; `unnumberedExpansion` is a 內容拓展 file whose name ends in neither `_rN` nor `_dlcN`.
 */
export interface SkippedStage {
  stageId: string;
  levelPath: string;
  reason?: "unlinkedEmergency" | "unnumberedExpansion";
}

/** Raw paths are case-sensitive and lowercase upstream: "obt/main/level_main_01-07". */
export function levelPath(levelId: string): string {
  return levelId.toLowerCase();
}

export function siteLevelFile(path: string): string {
  return `data/levels/${path}.json`;
}

/**
 * The activity a stage was made for: its id up to the first "_" (act21side_01 -> act21side).
 * A 復刻's stages keep their original's ids, so this names the original activity.
 */
export function stageActivityId(stageId: string): string {
  return stageId.split("_")[0]!;
}

/**
 * The original of activity `actId` when it is a 復刻: the activity its stage `stageId` was
 * made for, if the activity table has it. Undefined for other activities and for reruns whose
 * original the table lacks.
 */
export function rerunOriginal(
  activity: RawActivityTable,
  actId: string,
  stageId: string,
): RawActivity | undefined {
  if (!activity.basicInfo[actId]?.isReplicate) return undefined;
  return activity.basicInfo[stageActivityId(stageId)];
}

/** Where a stage-table stage is listed: the area, and the section (zone) inside it. */
interface Placement {
  kind: Exclude<AreaKind, "ROGUELIKE">;
  areaId: string;
  sectionId: string;
}

/** Activity types out of scope (spec 範圍外): multiplayer and Garrison Protocol (衛戍協議). */
function excludedActivity(actId: string, type: string): boolean {
  return /^MULTIPLAY/.test(type) || /AUTOCHESS/.test(type) || /autochess/.test(actId);
}

/**
 * Mainline chapters by zone (chapters 15+ are MAINLINE_ACTIVITY zones; early activity stages
 * filed under a chapter zone stay there), activities by `zoneToActivity`, campaign regions by
 * zone. Anything else is out of scope.
 */
function placement(tables: StageIndexTables, stage: RawStage): Placement | null {
  const zone = tables.cn.zone.zones[stage.zoneId];
  switch (zone?.type) {
    case "MAINLINE":
    case "MAINLINE_ACTIVITY":
      return { kind: "MAINLINE", areaId: stage.zoneId, sectionId: stage.zoneId };
    case "CAMPAIGN":
      return { kind: "CAMPAIGN", areaId: stage.zoneId, sectionId: stage.zoneId };
    case "ACTIVITY": {
      const actId = tables.cn.activity.zoneToActivity[stage.zoneId];
      const info = actId ? tables.cn.activity.basicInfo[actId] : undefined;
      if (!info || excludedActivity(info.id, info.type)) return null;
      return { kind: "ACTIVITY", areaId: info.id, sectionId: stage.zoneId };
    }
    default:
      return null;
  }
}

/** Stages with a level file in the areas the index covers. Story-only stages have no file. */
function selectStages(tables: StageIndexTables): { stage: RawStage; place: Placement }[] {
  return Object.values(tables.cn.stage.stages).flatMap((stage) => {
    const place = stage.levelId === null ? null : placement(tables, stage);
    return place ? [{ stage, place }] : [];
  });
}

/** Every level file the index may point at. `easy_` entries name files that do not exist. */
export function indexedLevelPaths(tables: StageIndexTables): string[] {
  const links = variantLinks(tables.cn.stage.stages);
  const paths = selectStages(tables)
    .filter(({ stage }) => links.get(stage.stageId)?.id !== "easy")
    .map(({ stage }) => levelPath(stage.levelId!));
  return [...new Set([...paths, ...roguelikeLevelPaths(tables.cn.roguelike)])];
}

/** 集成戰略 level files: every stage's own file and its 內容拓展 files. */
export function roguelikeLevelPaths(table: RawRoguelikeTopicTable): string[] {
  const paths = Object.values(table.details).flatMap((topic) =>
    Object.values(topic.stages).flatMap((s) => [s.levelId, ...s.levelReplaceIds].map(levelPath)),
  );
  return [...new Set(paths)];
}

interface VariantLink {
  baseId: string;
  id: StageTableVariantId;
}

/**
 * Stage-table entries that are a variant of another entry. Challenge and six-star entries are
 * named by their base (`hardStagedId`, `sixStarStageId`); `tough_X` and `easy_X` are linked
 * by name to `X` or `main_X` in the same zone.
 */
function variantLinks(stages: Record<string, RawStage>): Map<string, VariantLink> {
  const links = new Map<string, VariantLink>();
  for (const s of Object.values(stages)) {
    if (s.hardStagedId) links.set(s.hardStagedId, { baseId: s.stageId, id: "challenge" });
    if (s.sixStarStageId) links.set(s.sixStarStageId, { baseId: s.stageId, id: "sixStar" });
    const named = /^(tough|easy)_(.*)$/.exec(s.stageId);
    if (named) {
      const [, kind, rest] = named;
      const baseId = [rest!, `main_${rest}`].find((id) => stages[id]?.zoneId === s.zoneId);
      if (baseId) links.set(s.stageId, { baseId, id: kind as "tough" | "easy" });
    }
  }
  return links;
}

type StageTableVariantId = "normal" | "challenge" | "sixStar" | "easy" | "tough";

const variantOrder: VariantId[] = ["normal", "challenge", "sixStar", "easy", "tough"];

const variantDifficulty: Record<StageTableVariantId, Difficulty> = {
  normal: "NORMAL",
  challenge: "FOUR_STAR",
  sixStar: "SIX_STAR",
  easy: "EASY",
  tough: "NORMAL",
};

const kindOrder: AreaKind[] = ["MAINLINE", "ACTIVITY", "CAMPAIGN", "ROGUELIKE"];

const numerals = "零一二三四五六七八九";

/** 17 -> "十七", 23 -> "二十三". */
function chineseNumber(n: number): string {
  if (n < 10) return numerals[n]!;
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return `${tens === 1 ? "" : numerals[tens]}十${ones === 0 ? "" : numerals[ones]}`;
}

/** "第六章" from the table; chapters 15+ carry an English title there, so build it. */
function chapterCode(zone: RawZone): string | null {
  if (zone.zoneNameFirst && /\p{Script=Han}/u.test(zone.zoneNameFirst)) return zone.zoneNameFirst;
  const n = Number(zone.zoneNameTitleCurrent);
  return Number.isInteger(n) ? `第${chineseNumber(n)}章` : zone.zoneNameFirst;
}

/** 區域代號: the letters every stage code starts with (IS-1 -> IS); null when they differ. */
function activityCode(stages: StageEntry[]): string | null {
  const prefixes = new Set(stages.map((s) => /^[A-Za-z]*/.exec(s.code)![0]));
  const [only] = prefixes;
  return prefixes.size === 1 && only ? only : null;
}

/** An area while its stages are collected: section (zone) id -> stages, in table order. */
interface AreaDraft {
  place: Placement;
  sections: Map<string, StageEntry[]>;
}

export function buildStageIndex(
  tables: StageIndexTables,
  facts: Map<string, LevelFacts>,
): { index: StageIndex; skipped: SkippedStage[] } {
  const { cn, tw } = tables;
  const links = variantLinks(cn.stage.stages);
  const selected = selectStages(tables);
  const derived = new Map<string, RawStage[]>();
  for (const { stage } of selected) {
    const link = links.get(stage.stageId);
    if (link) derived.set(link.baseId, [...(derived.get(link.baseId) ?? []), stage]);
  }
  const skipped: SkippedStage[] = [];

  /** null when the level file is missing; easy also needs EASY modifiers in the base file. */
  function toVariant(stage: RawStage, id: StageTableVariantId, basePath: string): Variant | null {
    const path = id === "easy" ? basePath : levelPath(stage.levelId!);
    const fileFacts = facts.get(path);
    if (!fileFacts) {
      if (id !== "easy") skipped.push({ stageId: stage.stageId, levelPath: path });
      return null;
    }
    if (id === "easy" && !fileFacts.difficulties.includes("EASY")) return null;
    return {
      id,
      sourceStageId: stage.stageId,
      levelFile: siteLevelFile(path),
      difficulty: variantDifficulty[id],
    };
  }

  function zoneName(zoneId: string): string | null {
    return tw.zone.zones[zoneId]?.zoneNameSecond ?? cn.zone.zones[zoneId]?.zoneNameSecond ?? null;
  }

  function toArea({ place: { kind, areaId }, sections }: AreaDraft): SortedArea {
    const base = {
      id: areaId,
      kind,
      sections: [...sections].map(([zoneId, stages]) => ({
        name: sections.size > 1 ? zoneName(zoneId) : null,
        stages,
      })),
    };
    switch (kind) {
      case "MAINLINE": {
        const zone = tw.zone.zones[areaId] ?? cn.zone.zones[areaId]!;
        return {
          area: { ...base, code: chapterCode(zone), name: zoneName(areaId) ?? areaId },
          sortKey: Number(cn.zone.zones[areaId]!.zoneNameTitleCurrent),
        };
      }
      case "ACTIVITY": {
        // A 復刻 is listed as its original, named by its first stage's id; the area keeps its id.
        const stages = [...sections.values()].flat();
        const listed =
          rerunOriginal(cn.activity, areaId, stages[0]!.id) ?? cn.activity.basicInfo[areaId]!;
        return {
          area: {
            ...base,
            code: activityCode(stages),
            name: tw.activity.basicInfo[listed.id]?.name ?? listed.name,
          },
          sortKey: -listed.startTime,
        };
      }
      case "CAMPAIGN": {
        const zone = tw.campaign.campaignZones[areaId] ?? cn.campaign.campaignZones[areaId];
        return {
          area: { ...base, code: null, name: zone?.name ?? areaId },
          sortKey: Number(/\d+$/.exec(areaId)?.[0] ?? 0),
        };
      }
    }
  }

  const drafts = new Map<string, AreaDraft>();
  for (const { stage, place } of selected) {
    if (links.has(stage.stageId)) continue;
    const basePath = levelPath(stage.levelId!);
    const baseVariant = toVariant(
      stage,
      stage.diffGroup === "TOUGH" ? "tough" : "normal",
      basePath,
    );
    if (!baseVariant) continue;
    const variants = [baseVariant];
    for (const d of derived.get(stage.stageId) ?? []) {
      const v = toVariant(d, links.get(d.stageId)!.id, basePath);
      if (v) variants.push(v);
    }
    variants.sort((a, b) => variantOrder.indexOf(a.id) - variantOrder.indexOf(b.id));
    const twStage = tw.stage.stages[stage.stageId];
    const entry: StageEntry = {
      id: stage.stageId,
      code: twStage?.code ?? stage.code ?? "",
      name: twStage?.name ?? stage.name ?? "",
      variants,
    };
    let draft = drafts.get(place.areaId);
    if (!draft) {
      draft = { place, sections: new Map() };
      drafts.set(place.areaId, draft);
    }
    const section = draft.sections.get(place.sectionId) ?? [];
    section.push(entry);
    draft.sections.set(place.sectionId, section);
  }

  const sorted: SortedArea[] = [
    ...[...drafts.values()].map(toArea),
    ...roguelikeAreas(tables, facts, skipped),
  ];
  const areas = sorted
    .sort(
      (a, b) =>
        kindOrder.indexOf(a.area.kind) - kindOrder.indexOf(b.area.kind) || a.sortKey - b.sortKey,
    )
    .map(({ area }) => area);
  return { index: { areas }, skipped };
}

interface SortedArea {
  area: Area;
  sortKey: number;
}

/** Normal nodes are `roN_n_<zone>_<i>...`; other stages (bosses, events, ...) have no zone. */
function roguelikeZone(stageId: string): string | null {
  const zone = /^ro\d+_n_(\d+)_\d+/.exec(stageId)?.[1];
  return zone ? `zone_${zone}` : null;
}

/**
 * A 內容拓展 file's 拓展編號, from its name's `_rN` or `_dlcN` ending: level_rogue4_1-1_r2 and
 * level_rogue5_7-1_dlc2 are both 2. Null when the name has neither.
 */
function expansionNumber(path: string): number | null {
  const n = /_(?:r|dlc)([1-9]\d*)$/.exec(path)?.[1];
  return n ? Number(n) : null;
}

/** A 集成戰略 stage's own difficulty: 緊急作戰 run at FOUR_STAR. */
function roguelikeDifficulty(stage: RawRoguelikeStage): Difficulty {
  return stage.difficulty === "FOUR_STAR" ? "FOUR_STAR" : "NORMAL";
}

/**
 * 集成戰略: one area per theme, ordered by the theme's `sort`. Each zone lists its nodes; stages
 * with no zone come last. A node's 緊急作戰 is its `emergency` variant, on the node's file. Its
 * 內容拓展, numbered by file name, are listed on the node for every variant. A 緊急作戰 that
 * links to no node, and a 內容拓展 file missing or named without a number, are skipped and
 * reported.
 */
function roguelikeAreas(
  { cn, tw }: StageIndexTables,
  facts: Map<string, LevelFacts>,
  skipped: SkippedStage[],
): SortedArea[] {
  return Object.values(cn.roguelike.topics).flatMap((topic) => {
    const detail = cn.roguelike.details[topic.id]!;
    const twDetail = tw.roguelike.details[topic.id];
    const isNode = (stage: RawRoguelikeStage | undefined) => stage?.linkedStageId === "";

    /** Node id -> its 緊急作戰, wherever either comes in the table. */
    const emergencies = new Map<string, RawRoguelikeStage>();
    for (const stage of Object.values(detail.stages)) {
      if (isNode(stage)) continue;
      if (isNode(detail.stages[stage.linkedStageId])) {
        emergencies.set(stage.linkedStageId, stage);
      } else {
        skipped.push({
          stageId: stage.id,
          levelPath: levelPath(stage.levelId),
          reason: "unlinkedEmergency",
        });
      }
    }

    const sections = new Map<string, Section>();
    // Keys sort into display order: zone_1, zone_2, ..., then "~" (no zone).
    const sectionFor = (zone: string | null): Section => {
      const key = zone ?? "~";
      let section = sections.get(key);
      if (!section) {
        const name = zone
          ? (twDetail?.zones[zone]?.name ?? detail.zones[zone]?.name ?? zone)
          : null;
        section = { name, stages: [] };
        sections.set(key, section);
      }
      return section;
    };

    for (const stage of Object.values(detail.stages).filter(isNode)) {
      const emergency = emergencies.get(stage.id);
      const [basePath, ...expansionPaths] = [stage.levelId, ...stage.levelReplaceIds].map(
        levelPath,
      );
      if (!facts.has(basePath!)) {
        for (const s of [stage, ...(emergency ? [emergency] : [])]) {
          skipped.push({ stageId: s.id, levelPath: basePath! });
        }
        continue;
      }
      const variant = (id: VariantId, source: RawRoguelikeStage, path: string): Variant => ({
        id,
        sourceStageId: source.id,
        levelFile: siteLevelFile(path),
        difficulty: roguelikeDifficulty(source),
      });
      const variants = [variant("normal", stage, basePath!)];
      if (emergency) variants.push(variant("emergency", emergency, basePath!));
      const expansions = expansionPaths.flatMap((path): Expansion[] => {
        const number = expansionNumber(path);
        if (number === null) {
          skipped.push({ stageId: stage.id, levelPath: path, reason: "unnumberedExpansion" });
          return [];
        }
        if (!facts.has(path)) {
          skipped.push({ stageId: stage.id, levelPath: path });
          return [];
        }
        return [{ number, levelFile: siteLevelFile(path) }];
      });
      expansions.sort((a, b) => a.number - b.number);
      const twStage = twDetail?.stages[stage.id];
      const condition =
        emergency && (twDetail?.stages[emergency.id]?.eliteDesc ?? emergency.eliteDesc);
      const entry: StageEntry = {
        id: stage.id,
        code: twStage?.code ?? stage.code,
        name: twStage?.name ?? stage.name,
        variants,
        ...(condition ? { emergencyCondition: condition } : {}),
        ...(expansions.length > 0 ? { expansions } : {}),
      };
      sectionFor(roguelikeZone(stage.id)).stages.push(entry);
    }
    if (sections.size === 0) return [];

    const ordered = [...sections.keys()].sort().map((key) => sections.get(key)!);
    return [
      {
        sortKey: topic.sort,
        area: {
          id: topic.id,
          kind: "ROGUELIKE",
          code: null,
          name: tw.roguelike.topics[topic.id]?.name ?? topic.name,
          sections: ordered,
        },
      },
    ];
  });
}

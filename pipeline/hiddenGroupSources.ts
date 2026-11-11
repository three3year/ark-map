import {
  hiddenGroupSwitch,
  type HiddenGroupSource,
  type HiddenGroupSourceKind,
} from "../src/level/index.ts";
import { topicLevelIds, type RawRoguelikeTopic, type RawRoguelikeTopicTable } from "./raw.ts";

export interface HiddenGroupSourceCatalog {
  /** Level file name (no directory, lower case) -> the id of the theme whose stages use it. */
  themeOfLevel: Map<string, string>;
  /** Theme id -> 隱藏組 tag -> its sources, in theme-table order. */
  byTheme: Map<string, Map<string, HiddenGroupSource[]>>;
}

export const noHiddenGroupSources: HiddenGroupSourceCatalog = {
  themeOfLevel: new Map(),
  byTheme: new Map(),
};

/** Theme tables name levels in mixed case ("Obt/Roguelike/RO4/level_rogue4_1-2"). */
const fileName = (levelId: string) => levelId.toLowerCase().replace(/^.*\//, "");

/** Called once per item that switches a 隱藏組 but has no kind the site knows; it is left out. */
export type UnknownHiddenGroupSourceKindHandler = (item: string, kind: string | null) => void;

export const warnUnknownHiddenGroupSourceKind: UnknownHiddenGroupSourceKindHandler = (item, kind) =>
  console.warn(`[資料管線] 隱藏組來源 ${item} 的種類 ${kind ?? "(無)"} 不在已知清單,略過`);

const hiddenGroupSourceKinds: readonly string[] = [
  "RELIC",
  "COPPER_BUFF",
  "TOTEM_EFFECT",
  "FEATURE",
] satisfies HiddenGroupSourceKind[];

const isHiddenGroupSourceKind = (kind: string): kind is HiddenGroupSourceKind =>
  hiddenGroupSourceKinds.includes(kind);

function themeSources(
  cn: RawRoguelikeTopic | undefined,
  tw: RawRoguelikeTopic | undefined,
  onUnknownKind: UnknownHiddenGroupSourceKindHandler,
): Map<string, HiddenGroupSource[]> {
  const byTag = new Map<string, HiddenGroupSource[]>();
  const ids = new Set([...Object.keys(cn?.relics ?? {}), ...Object.keys(tw?.relics ?? {})]);
  for (const item of ids) {
    const relic = cn?.relics[item] ?? tw!.relics[item]!;
    const info = tw?.items[item] ?? cn?.items[item];
    if (!info || !isHiddenGroupSourceKind(info.type)) {
      if (relic.buffs.some((b) => hiddenGroupSwitch(b.key)))
        onUnknownKind(item, info?.type ?? null);
      continue;
    }
    const { name, type: kind } = info;
    for (const buff of relic.buffs) {
      const switched = hiddenGroupSwitch(buff.key);
      if (!switched) continue;
      const tags = buff.blackboard
        .filter((b) => b.key === "key")
        .flatMap((b) => (b.valueStr ?? "").split("|"));
      for (const tag of tags) {
        const source: HiddenGroupSource = { item, opens: switched === "open", name, kind };
        byTag.set(tag, [...(byTag.get(tag) ?? []), source]);
      }
    }
  }
  return byTag;
}

export function buildHiddenGroupSourceCatalog(
  cn: RawRoguelikeTopicTable,
  tw: RawRoguelikeTopicTable,
  onUnknownKind: UnknownHiddenGroupSourceKindHandler = warnUnknownHiddenGroupSourceKind,
): HiddenGroupSourceCatalog {
  const themeOfLevel = new Map<string, string>();
  const byTheme = new Map<string, Map<string, HiddenGroupSource[]>>();
  for (const theme of new Set([...Object.keys(cn.details), ...Object.keys(tw.details)])) {
    const [cnTopic, twTopic] = [cn.details[theme], tw.details[theme]];
    byTheme.set(theme, themeSources(cnTopic, twTopic, onUnknownKind));
    for (const id of cnTopic ? topicLevelIds(cnTopic) : []) themeOfLevel.set(fileName(id), theme);
  }
  return { themeOfLevel, byTheme };
}

/** The sources of `tags` in the theme of the level `levelId` names; tags without one are absent. */
export function levelHiddenGroupSources(
  catalog: HiddenGroupSourceCatalog,
  levelId: string,
  tags: Iterable<string>,
): Record<string, HiddenGroupSource[]> {
  const theme = catalog.themeOfLevel.get(fileName(levelId));
  const sources = theme === undefined ? undefined : catalog.byTheme.get(theme);
  if (!sources) return {};
  return Object.fromEntries(
    [...tags].flatMap((tag) => {
      const found = sources.get(tag);
      return found ? [[tag, found]] : [];
    }),
  );
}

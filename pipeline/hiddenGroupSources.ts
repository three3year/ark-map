// 隱藏組來源: the 集成戰略 items (收藏品, 通寶, 密文板效果, 機制) whose effects open or close a 隱藏組,
// read from the CN and TW theme tables.
import type { HiddenGroupSource } from "../src/level/index.ts";
import type { RawRoguelikeTopic, RawRoguelikeTopicTable } from "./raw.ts";

export interface SourceCatalog {
  /** Level file name (no directory, lower case) -> the id of the theme whose stages use it. */
  themeOfLevel: Map<string, string>;
  /** Theme id -> 隱藏組 tag -> its sources, in theme-table order. */
  byTheme: Map<string, Map<string, HiddenGroupSource[]>>;
}

export const noSources: SourceCatalog = { themeOfLevel: new Map(), byTheme: new Map() };

/** Theme tables name levels in mixed case ("Obt/Roguelike/RO4/level_rogue4_1-2"). */
const fileName = (levelId: string) => levelId.toLowerCase().replace(/^.*\//, "");

const switchBuff = /^level_hidden_group_(enable|disable)$/;

/** An item both tables have counts once: CN effects, TW name and kind (else CN). */
function themeSources(
  cn: RawRoguelikeTopic | undefined,
  tw: RawRoguelikeTopic | undefined,
): Map<string, HiddenGroupSource[]> {
  const byTag = new Map<string, HiddenGroupSource[]>();
  const ids = new Set([...Object.keys(cn?.relics ?? {}), ...Object.keys(tw?.relics ?? {})]);
  for (const item of ids) {
    const relic = cn?.relics[item] ?? tw!.relics[item]!;
    const info = tw?.items[item] ?? cn?.items[item];
    for (const buff of relic.buffs) {
      const opens = switchBuff.exec(buff.key)?.[1];
      if (!opens) continue;
      const tags = buff.blackboard
        .filter((b) => b.key === "key")
        .flatMap((b) => (b.valueStr ?? "").split("|"));
      for (const tag of tags) {
        const source: HiddenGroupSource = {
          item,
          opens: opens === "enable",
          name: info?.name ?? item,
          kind: info?.type ?? "",
        };
        byTag.set(tag, [...(byTag.get(tag) ?? []), source]);
      }
    }
  }
  return byTag;
}

export function buildSourceCatalog(
  cn: RawRoguelikeTopicTable,
  tw: RawRoguelikeTopicTable,
): SourceCatalog {
  const themeOfLevel = new Map<string, string>();
  const byTheme = new Map<string, Map<string, HiddenGroupSource[]>>();
  for (const theme of new Set([...Object.keys(cn.details), ...Object.keys(tw.details)])) {
    const [cnTopic, twTopic] = [cn.details[theme], tw.details[theme]];
    byTheme.set(theme, themeSources(cnTopic, twTopic));
    // The site's 集成戰略 levels are the ones the CN table names (see `roguelikeLevelPaths`).
    for (const stage of Object.values(cnTopic?.stages ?? {})) {
      for (const id of [stage.levelId, ...stage.levelReplaceIds]) {
        themeOfLevel.set(fileName(id), theme);
      }
    }
  }
  return { themeOfLevel, byTheme };
}

/** The sources of `tags` in the theme of the level `levelId` names; tags without one are absent. */
export function levelSources(
  catalog: SourceCatalog,
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

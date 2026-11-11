import { repoUrl, sources, type RepoSource } from "../dataSources.ts";
import type { DataVersion, StageIndex } from "../level/index.ts";
import { strings } from "./strings.ts";

export interface FooterItem {
  label: string;
  url: string;
  hint: string;
  version?: string | null;
  checkedAt?: string;
}

function sourceItem(label: string, source: RepoSource): FooterItem {
  return { label, url: repoUrl(source), hint: strings.footerSourceHint(source.repo) };
}

/** 台灣時間 (UTC+8, no daylight saving) to the minute, whatever the browser's time zone. */
function taiwanTime(iso: string): string {
  const t = new Date(Date.parse(iso) + 8 * 3600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())} ` +
    `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}(UTC+8)`
  );
}

function serverItem(label: string, source: RepoSource, data: DataVersion): FooterItem {
  return {
    ...sourceItem(label, source),
    version: data.version,
    checkedAt: taiwanTime(data.checkedAt),
  };
}

export function footerItems(versions: StageIndex["versions"]): FooterItem[] {
  const labels = strings.footerLabels;
  return [
    serverItem(labels.cn, sources.cn, versions.cn),
    serverItem(labels.tw, sources.tw, versions.tw),
    sourceItem(labels.images, sources.avatars),
    { label: labels.prts, url: "https://prts.wiki/w/作战机制", hint: strings.footerPrtsHint },
    { label: labels.prtsMap, url: "https://map.ark-nights.com", hint: strings.footerPrtsMapHint },
  ];
}

import { repoUrl, sources, type RepoSource } from "../dataSources.ts";
import type { DataVersion, Server, ServerVersions } from "../level/index.ts";
import { strings } from "./strings.ts";

interface FooterLink {
  label: string;
  url: string;
  hint: string;
}

/** A 伺服器 with its 資料版本, or a plain link. */
export type FooterItem =
  | (FooterLink & { kind: "server"; version: string | null; checkedAtTaiwanTime: string })
  | (FooterLink & { kind: "link" });

function sourceLink(label: string, source: RepoSource): FooterLink {
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

function serverItem(server: Server, data: DataVersion): FooterItem {
  return {
    kind: "server",
    ...sourceLink(strings.servers[server], sources[server]),
    version: data.version,
    checkedAtTaiwanTime: taiwanTime(data.checkedAt),
  };
}

export function footerItems(versions: ServerVersions): FooterItem[] {
  const labels = strings.footerLabels;
  return [
    serverItem("cn", versions.cn),
    serverItem("tw", versions.tw),
    { kind: "link", ...sourceLink(labels.images, sources.avatars) },
    {
      kind: "link",
      label: labels.prts,
      url: "https://prts.wiki/w/作战机制",
      hint: strings.footerPrtsHint,
    },
    {
      kind: "link",
      label: labels.prtsMap,
      url: "https://map.ark-nights.com",
      hint: strings.footerPrtsMapHint,
    },
  ];
}

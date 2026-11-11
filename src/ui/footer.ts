// The 頁尾's first line: the 資料來源 the pipeline downloads from, then the 參考來源.
import { repoUrl, sources, type RepoSource } from "../dataSources.ts";
import { strings } from "./strings.ts";

export interface FooterItem {
  label: string;
  url: string;
  /** The link's mouse-over hint. */
  hint: string;
  /** The 資料版本's version number; only 陸服 and 台服 have one, and it may be missing. */
  version?: string | null;
  /** When the 資料版本 was last confirmed, in 台灣時間; only 陸服 and 台服. */
  checkedAt?: string;
}

function sourceItem(label: string, source: RepoSource): FooterItem {
  return { label, url: repoUrl(source), hint: strings.footerSourceHint(source.repo) };
}

/** 陸服, 台服, 頭像與裝置圖 (one repo, one item), 參考 PRTS, 參考 PRTS.Map, in that order. */
export function footerItems(): FooterItem[] {
  const labels = strings.footerLabels;
  return [
    sourceItem(labels.cn, sources.cn),
    sourceItem(labels.tw, sources.tw),
    sourceItem(labels.images, sources.avatars),
    { label: labels.prts, url: "https://prts.wiki/w/作战机制", hint: strings.footerPrtsHint },
    { label: labels.prtsMap, url: "https://map.ark-nights.com", hint: strings.footerPrtsMapHint },
  ];
}

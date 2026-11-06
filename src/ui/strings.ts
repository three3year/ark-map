// 介面文字(繁中)。All user-facing text lives here.
import type { AreaKind, VariantId } from "../level/index.ts";

export const strings = {
  siteTitle: "明日方舟時刻快照",
  loading: "載入中…",
  loadFailed: "資料載入失敗",
  stageNotFound: (id: string) => `找不到關卡 ${id}`,
  areaNotFound: (id: string) => `找不到區域 ${id}`,
  variantNotFound: (id: string) => `這個關卡沒有變體 ${id}`,
  noStages: "沒有可顯示的關卡,請先執行資料管線(pnpm data)",
  backToAreas: "所有區域",
  areaKinds: {
    MAINLINE: "主線",
    ACTIVITY: "活動",
    CAMPAIGN: "剿滅作戰",
  } satisfies Record<AreaKind, string>,
  variants: {
    normal: "普通",
    challenge: "突襲",
    sixStar: "六星",
    easy: "簡單",
    tough: "磨難",
  } satisfies Record<VariantId, string>,
  variantPicker: "關卡變體",
  seconds: "秒",
  play: "播放",
  pause: "暫停",
  timeSlider: "時間軸",
  countPending: "未出現",
  countOnField: "在場",
  countLeaked: "已進點",
  mapLabel: "關卡地圖",
  start: "起點",
  end: "終點",
} as const;

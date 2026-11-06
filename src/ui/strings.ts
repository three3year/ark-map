// 介面文字(繁中)。All user-facing text lives here.
export const strings = {
  siteTitle: "明日方舟時刻快照",
  loading: "載入中…",
  loadFailed: "資料載入失敗",
  stageNotFound: (id: string) => `找不到關卡 ${id}`,
  noStages: "沒有可顯示的關卡,請先執行資料管線(pnpm data)",
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

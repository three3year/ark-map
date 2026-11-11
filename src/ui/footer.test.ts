import { describe, expect, it } from "vitest";
import { footerItems } from "./footer.ts";

describe("footerItems", () => {
  it("lists 陸服, 台服, 頭像與裝置圖, then the two 參考來源, each with its link and hint", () => {
    expect(footerItems()).toEqual([
      {
        label: "陸服",
        url: "https://github.com/Kengxxiao/ArknightsGameData",
        hint: "資料來源:Kengxxiao/ArknightsGameData",
      },
      {
        label: "台服",
        url: "https://github.com/ArknightsAssets/ArknightsGamedata",
        hint: "資料來源:ArknightsAssets/ArknightsGamedata",
      },
      {
        label: "頭像與裝置圖",
        url: "https://github.com/yuanyan3060/ArknightsGameResource",
        hint: "資料來源:yuanyan3060/ArknightsGameResource",
      },
      {
        label: "參考 PRTS",
        url: "https://prts.wiki/w/作战机制",
        hint: "擋路裝置清單參考 PRTS",
      },
      {
        label: "參考 PRTS.Map",
        url: "https://map.ark-nights.com",
        hint: "出兵表絕對時刻的算法參考 PRTS.Map",
      },
    ]);
  });
});

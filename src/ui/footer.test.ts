import { describe, expect, it } from "vitest";
import type { ServerVersions } from "../level/index.ts";
import { footerItems } from "./footer.ts";

const versions: ServerVersions = {
  cn: { version: "79.2.0", checkedAt: "2026-11-11T06:30:00.000Z" },
  tw: { version: "52.0.0", checkedAt: "2026-10-18T17:05:30Z" },
};

describe("footerItems", () => {
  it("lists 陸服 and 台服 with their 資料版本 in 台灣時間, 頭像與裝置圖, then the two 參考來源", () => {
    expect(footerItems(versions)).toEqual([
      {
        kind: "server",
        label: "陸服",
        url: "https://github.com/Kengxxiao/ArknightsGameData",
        hint: "資料來源:Kengxxiao/ArknightsGameData",
        version: "79.2.0",
        checkedAtTaiwanTime: "2026-11-11 14:30(UTC+8)",
      },
      {
        kind: "server",
        label: "台服",
        url: "https://github.com/ArknightsAssets/ArknightsGamedata",
        hint: "資料來源:ArknightsAssets/ArknightsGamedata",
        version: "52.0.0",
        checkedAtTaiwanTime: "2026-10-19 01:05(UTC+8)",
      },
      {
        kind: "link",
        label: "頭像與裝置圖",
        url: "https://github.com/yuanyan3060/ArknightsGameResource",
        hint: "資料來源:yuanyan3060/ArknightsGameResource",
      },
      {
        kind: "link",
        label: "參考 PRTS",
        url: "https://prts.wiki/w/作战机制",
        hint: "擋路裝置清單參考 PRTS",
      },
      {
        kind: "link",
        label: "參考 PRTS.Map",
        url: "https://map.ark-nights.com",
        hint: "出兵表絕對時刻的算法參考 PRTS.Map",
      },
    ]);
  });

  it("a server without a version number has only the time", () => {
    const [cn] = footerItems({
      ...versions,
      cn: { version: null, checkedAt: "2026-11-11T06:30:00Z" },
    });
    expect(cn).toMatchObject({
      kind: "server",
      label: "陸服",
      version: null,
      checkedAtTaiwanTime: "2026-11-11 14:30(UTC+8)",
    });
  });
});

// Seam: one server's 資料版本 from what the pipeline could fetch.
import { describe, expect, it } from "vitest";
import { dataVersion } from "./dataVersion.ts";

const now = new Date("2026-11-11T06:30:00Z");
const cachedAt = new Date("2026-11-02T01:00:00Z");
const listing = new Map([
  ["gamedata_const.json", "abc"],
  ["stage_table.json", "def"],
]);
const versionFile = JSON.stringify({ dataVersion: "79.2.0", other: 1 });

describe("dataVersion", () => {
  it("with the listing: the version from gamedata_const.json, confirmed at this run", () => {
    expect(dataVersion({ listing, body: versionFile, cachedAt, now })).toEqual({
      version: { version: "79.2.0", checkedAt: "2026-11-11T06:30:00.000Z" },
      warn: false,
    });
  });

  it("without the listing: confirmed when the cached 版號 file was written", () => {
    expect(dataVersion({ listing: null, body: versionFile, cachedAt, now })).toEqual({
      version: { version: "79.2.0", checkedAt: "2026-11-02T01:00:00.000Z" },
      warn: false,
    });
  });

  it("without the listing or a cached 版號 file: confirmed at this run, no version", () => {
    expect(dataVersion({ listing: null, body: null, cachedAt: null, now })).toEqual({
      version: { version: null, checkedAt: "2026-11-11T06:30:00.000Z" },
      warn: true,
    });
  });

  it("a listing without the 版號 file: no version, even with an old one in the cache", () => {
    const withoutFile = new Map([["stage_table.json", "def"]]);
    expect(dataVersion({ listing: withoutFile, body: versionFile, cachedAt, now })).toEqual({
      version: { version: null, checkedAt: "2026-11-11T06:30:00.000Z" },
      warn: true,
    });
  });

  it.each([
    ["a 404 for the 版號 file", null],
    ["a 版號 file that is not JSON", "<html>"],
    ["a 版號 file without dataVersion", JSON.stringify({ other: 1 })],
    ["a 版號 file whose dataVersion is not text", JSON.stringify({ dataVersion: 79 })],
  ])("%s: no version", (_, body) => {
    expect(dataVersion({ listing, body, cachedAt, now })).toEqual({
      version: { version: null, checkedAt: "2026-11-11T06:30:00.000Z" },
      warn: true,
    });
  });
});

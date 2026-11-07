import { describe, expect, it } from "vitest";
import { loadFixtureLevel } from "../../test-fixtures/load.ts";
import { buildTimeline, takeSnapshot } from "../timeline/index.ts";
import { advancePlayback, afterStop, playbackSpeeds, playbackStop } from "./playback.ts";

describe("playback auto-stop", () => {
  const timeline = buildTimeline(loadFixtureLevel("level_main_01-07"));

  it("1-7: stops on the first tenth of a second at which all 41 have leaked", () => {
    const stop = playbackStop(timeline);
    expect(takeSnapshot(timeline, stop).counts).toEqual({ pending: 0, onField: 0, leaked: 41 });
    expect(takeSnapshot(timeline, stop - 0.1).counts.onField).toBe(1);
  });
});

describe("playback speed", () => {
  it("covers 3 wave seconds in 3 s at 1x, 6 at 2x, 1.5 at 0.5x", () => {
    expect(advancePlayback(10, 3, 1, 100)).toEqual({ t: 13, done: false });
    expect(advancePlayback(10, 3, 2, 100)).toEqual({ t: 16, done: false });
    expect(advancePlayback(10, 3, 0.5, 100)).toEqual({ t: 11.5, done: false });
  });

  it("clamps to the stop second and reports done", () => {
    expect(advancePlayback(10, 3, 2, 15)).toEqual({ t: 15, done: true });
  });
});

describe("playback speeds", () => {
  it("offers 0.5x, 1x, 2x, 4x and 8x, in that order", () => {
    expect(playbackSpeeds).toEqual([0.5, 1, 2, 4, 8]);
  });

  it("covers 24 wave seconds in 3 s at 8x", () => {
    expect(advancePlayback(10, 3, 8, 100)).toEqual({ t: 34, done: false });
  });
});

describe("after the stop second", () => {
  it("moves on to 0 s of the next 波次 when this is not the last one", () => {
    expect(afterStop(0, 3)).toEqual({ kind: "nextWave", wave: 1, t: 0 });
    expect(afterStop(1, 3)).toEqual({ kind: "nextWave", wave: 2, t: 0 });
  });

  it("stops on the last 波次", () => {
    expect(afterStop(2, 3)).toEqual({ kind: "stop" });
    expect(afterStop(0, 1)).toEqual({ kind: "stop" });
  });
});

import { describe, expect, it } from "vitest";
import { loadFixtureLevel } from "../../test-fixtures/load.ts";
import { buildTimeline, takeSnapshot } from "../timeline/index.ts";
import { advancePlayback, playbackStop } from "./playback.ts";

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

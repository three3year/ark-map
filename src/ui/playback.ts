// Playback: advancing the wave's seconds against the wall clock. Pure; the timeline bar
// owns the animation frame and hands each second to the level page.
import { timelineEnd, type Timeline } from "../timeline/index.ts";

/** The page's time resolution: seconds are kept to the tenth. */
export function roundTenth(t: number): number {
  return Math.round(t * 10) / 10;
}

export const playbackSpeeds = [0.5, 1, 2, 4, 8] as const;
export type PlaybackSpeed = (typeof playbackSpeeds)[number];

/**
 * The second playback stops at: the first tenth of a second (the page's time resolution) at which
 * the wave's last individual has leaked. Individuals that never leak (patrols) count from
 * their spawn, so a patrol-only wave stops once everyone is on the field.
 */
export function playbackStop(timeline: Timeline): number {
  return Math.ceil(timelineEnd(timeline) * 10 - 1e-9) / 10;
}

/** The wave second `wallSeconds` of real time after `from`, clamped to `stop`. */
export function advancePlayback(
  from: number,
  wallSeconds: number,
  speed: PlaybackSpeed,
  stop: number,
): { t: number; done: boolean } {
  const t = from + wallSeconds * speed;
  return t >= stop ? { t: stop, done: true } : { t, done: false };
}

/** What playback does on reaching a 波次's stop second. */
export type AfterStop = { kind: "nextWave"; wave: number; t: 0 } | { kind: "stop" };

/**
 * On reaching the stop second of the 0-based `wave` out of `waveCount`: carry on from 0 s of the
 * next 波次, or stop there on the last one.
 */
export function afterStop(wave: number, waveCount: number): AfterStop {
  return wave + 1 < waveCount ? { kind: "nextWave", wave: wave + 1, t: 0 } : { kind: "stop" };
}

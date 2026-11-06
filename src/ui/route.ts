// Hash routing. The URL is the single source of truth for page state:
// the UI writes the hash first and renders from what it reads back.

export interface LevelRoute {
  stageId: string;
  /** Seconds into the wave, rounded to 0.1. */
  t: number;
}

export function roundTenth(t: number): number {
  return Math.round(t * 10) / 10;
}

/** `#/level/<stageId>?t=<seconds>`; anything else parses to null. */
export function parseHash(hash: string): LevelRoute | null {
  const match = /^#\/level\/([^?]+)(?:\?(.*))?$/.exec(hash);
  if (!match) return null;
  const params = new URLSearchParams(match[2] ?? "");
  const t = Number(params.get("t") ?? 0);
  return {
    stageId: decodeURIComponent(match[1]!),
    t: Number.isFinite(t) && t >= 0 ? roundTenth(t) : 0,
  };
}

export function formatHash(route: LevelRoute): string {
  return `#/level/${encodeURIComponent(route.stageId)}?t=${roundTenth(route.t)}`;
}

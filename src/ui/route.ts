// Hash routing. The URL is the single source of truth for page state:
// the UI writes the hash first and renders from what it reads back.

export interface LevelRoute {
  stageId: string;
  /** 0-based wave index. */
  wave: number;
  /** Seconds into the wave, rounded to 0.1. */
  t: number;
}

export function roundTenth(t: number): number {
  return Math.round(t * 10) / 10;
}

/** `#/level/<stageId>?w=<wave>&t=<seconds>`, `w` omitted for the first wave; else null. */
export function parseHash(hash: string): LevelRoute | null {
  const match = /^#\/level\/([^?]+)(?:\?(.*))?$/.exec(hash);
  if (!match) return null;
  const params = new URLSearchParams(match[2] ?? "");
  const t = Number(params.get("t") ?? 0);
  const wave = Number(params.get("w") ?? 0);
  return {
    stageId: decodeURIComponent(match[1]!),
    wave: Number.isInteger(wave) && wave >= 0 ? wave : 0,
    t: Number.isFinite(t) && t >= 0 ? roundTenth(t) : 0,
  };
}

export function formatHash(route: LevelRoute): string {
  const wave = route.wave > 0 ? `w=${route.wave}&` : "";
  return `#/level/${encodeURIComponent(route.stageId)}?${wave}t=${roundTenth(route.t)}`;
}

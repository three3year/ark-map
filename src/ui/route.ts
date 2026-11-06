// Hash routing. The URL is the single source of truth for page state:
// the UI writes the hash first and renders from what it reads back.

export interface LevelRoute {
  page: "level";
  stageId: string;
  /** Variant id; null picks the stage's base variant. */
  variant: string | null;
  /** 0-based wave index. */
  wave: number;
  /** Seconds into the wave, rounded to 0.1. */
  t: number;
}

/** Area list (`#/`), one area's stage list (`#/area/<id>`), or a stage's snapshot page. */
export type Route = { page: "home" } | { page: "area"; areaId: string } | LevelRoute;

export function roundTenth(t: number): number {
  return Math.round(t * 10) / 10;
}

/**
 * `#/level/<stageId>?v=<variant>&w=<wave>&t=<seconds>` (`w` omitted for the first wave),
 * `#/area/<areaId>`; anything else is home.
 */
export function parseHash(hash: string): Route {
  const area = /^#\/area\/([^?]+)$/.exec(hash);
  if (area) return { page: "area", areaId: decodeURIComponent(area[1]!) };
  const level = /^#\/level\/([^?]+)(?:\?(.*))?$/.exec(hash);
  if (!level) return { page: "home" };
  const params = new URLSearchParams(level[2] ?? "");
  const t = Number(params.get("t") ?? 0);
  const wave = Number(params.get("w") ?? 0);
  return {
    page: "level",
    stageId: decodeURIComponent(level[1]!),
    variant: params.get("v"),
    wave: Number.isInteger(wave) && wave >= 0 ? wave : 0,
    t: Number.isFinite(t) && t >= 0 ? roundTenth(t) : 0,
  };
}

export function formatHash(route: Route): string {
  switch (route.page) {
    case "home":
      return "#/";
    case "area":
      return `#/area/${encodeURIComponent(route.areaId)}`;
    case "level": {
      const params = new URLSearchParams();
      if (route.variant) params.set("v", route.variant);
      if (route.wave > 0) params.set("w", String(route.wave));
      params.set("t", String(roundTenth(route.t)));
      return `#/level/${encodeURIComponent(route.stageId)}?${params}`;
    }
  }
}

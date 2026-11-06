// Hash routing. The URL is the single source of truth for page state:
// the UI writes the hash first and renders from what it reads back.
import type { SpawnSwitches } from "../timeline/index.ts";

export interface LevelRoute {
  page: "level";
  stageId: string;
  /** Variant id; null picks the stage's base variant. */
  variant: string | null;
  /** 0-based wave index. */
  wave: number;
  /** Seconds into the wave, rounded to 0.1. */
  t: number;
  /** 開關狀態 that differ from the variant's default; omitted = all default. */
  switches?: SpawnSwitches;
}

/** Area list (`#/`), one area's stage list (`#/area/<id>`), or a stage's snapshot page. */
export type Route = { page: "home" } | { page: "area"; areaId: string } | LevelRoute;

export function roundTenth(t: number): number {
  return Math.round(t * 10) / 10;
}

/**
 * Switch parameters, each repeated once per entry:
 * - `h=<name>`: the 隱藏組 switched on. Present = the full set; a single empty `h=` = none on;
 *   absent = the variant's default.
 * - `r=<group>-<candidate>`: a 隨機出兵組 pick (indices); groups not listed take their default.
 */
function parseSwitches(params: URLSearchParams): SpawnSwitches | undefined {
  const switches: SpawnSwitches = {};
  if (params.has("h")) switches.hiddenOn = params.getAll("h").filter((h) => h !== "");
  const picks: Record<number, number> = {};
  for (const pair of params.getAll("r")) {
    const match = /^(\d+)-(\d+)$/.exec(pair);
    if (match) picks[Number(match[1])] = Number(match[2]);
  }
  if (Object.keys(picks).length > 0) switches.picks = picks;
  return Object.keys(switches).length > 0 ? switches : undefined;
}

function appendSwitches(params: URLSearchParams, switches: SpawnSwitches) {
  if (switches.hiddenOn) {
    if (switches.hiddenOn.length === 0) params.append("h", "");
    for (const name of switches.hiddenOn) params.append("h", name);
  }
  for (const [group, candidate] of Object.entries(switches.picks ?? {})) {
    params.append("r", `${group}-${candidate}`);
  }
}

/**
 * `#/level/<stageId>?v=<variant>&w=<wave>&t=<seconds>&h=…&r=…` (`w` omitted for the first
 * wave), `#/area/<areaId>`; anything else is home.
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
    switches: parseSwitches(params),
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
      if (route.switches) appendSwitches(params, route.switches);
      return `#/level/${encodeURIComponent(route.stageId)}?${params}`;
    }
  }
}

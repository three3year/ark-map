// Hash routing. The URL picks which map to show (關卡連結: stage and variant); the level page
// keeps its own 播放位置 (wave and seconds).
import type { ConditionalTrigger, SpawnSwitches } from "../timeline/index.ts";

export interface LevelRoute {
  page: "level";
  stageId: string;
  /** Variant id; null picks the stage's base variant. */
  variant: string | null;
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
 * - `c=<branch>-<seconds>[-<wave>]`: a 條件出兵 switched on (index into the level's branches),
 *   triggered at that second of that wave (0-based, omitted for the first); unlisted ones are off.
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
  const conditional: Record<number, ConditionalTrigger> = {};
  for (const entry of params.getAll("c")) {
    const match = /^(\d+)-(\d+(?:\.\d+)?)(?:-(\d+))?$/.exec(entry);
    if (match) {
      conditional[Number(match[1])] = {
        wave: Number(match[3] ?? 0),
        t: roundTenth(Number(match[2])),
      };
    }
  }
  if (Object.keys(conditional).length > 0) switches.conditional = conditional;
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
  for (const [branch, { wave, t }] of Object.entries(switches.conditional ?? {})) {
    params.append("c", `${branch}-${roundTenth(t)}${wave > 0 ? `-${wave}` : ""}`);
  }
}

/**
 * `#/level/<stageId>?v=<variant>&h=…&r=…&c=…`, `#/area/<areaId>`; anything else is home.
 * Other level parameters, such as the old `w` and `t`, are ignored.
 */
export function parseHash(hash: string): Route {
  const area = /^#\/area\/([^?]+)$/.exec(hash);
  if (area) return { page: "area", areaId: decodeURIComponent(area[1]!) };
  const level = /^#\/level\/([^?]+)(?:\?(.*))?$/.exec(hash);
  if (!level) return { page: "home" };
  const params = new URLSearchParams(level[2] ?? "");
  return {
    page: "level",
    stageId: decodeURIComponent(level[1]!),
    variant: params.get("v"),
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
      if (route.switches) appendSwitches(params, route.switches);
      const query = params.size > 0 ? `?${params}` : "";
      return `#/level/${encodeURIComponent(route.stageId)}${query}`;
    }
  }
}

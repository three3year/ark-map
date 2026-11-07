// Hash routing. The URL picks which level and variant to show (關卡連結); the level page
// keeps its own 播放位置 (wave and seconds) and 開關狀態.

export interface LevelRoute {
  page: "level";
  stageId: string;
  /** Variant id; null picks the stage's base variant. */
  variant: string | null;
}

/** Area list (`#/`), one area's stage list (`#/area/<id>`), or a stage's snapshot page. */
export type Route = { page: "home" } | { page: "area"; areaId: string } | LevelRoute;

/**
 * `#/level/<stageId>?v=<variant>`, `#/area/<areaId>`; anything else is home.
 * Other level parameters, such as the old `w`, `t`, `h`, `r` and `c`, are ignored.
 */
export function parseHash(hash: string): Route {
  const area = /^#\/area\/([^?]+)$/.exec(hash);
  if (area) return { page: "area", areaId: decodeURIComponent(area[1]!) };
  const level = /^#\/level\/([^?]+)(?:\?(.*))?$/.exec(hash);
  if (!level) return { page: "home" };
  const params = new URLSearchParams(level[2] ?? "");
  return { page: "level", stageId: decodeURIComponent(level[1]!), variant: params.get("v") };
}

export function formatHash(route: Route): string {
  switch (route.page) {
    case "home":
      return "#/";
    case "area":
      return `#/area/${encodeURIComponent(route.areaId)}`;
    case "level": {
      const query = route.variant ? `?${new URLSearchParams({ v: route.variant })}` : "";
      return `#/level/${encodeURIComponent(route.stageId)}${query}`;
    }
  }
}

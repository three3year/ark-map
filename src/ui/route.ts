export interface LevelRoute {
  page: "level";
  stageId: string;
  /** Variant id; null picks the stage's base variant. */
  variant: string | null;
  expansion: number | null;
}

/** Area list (`#/`), one area's stage list (`#/area/<id>`), or a stage's snapshot page. */
export type Route = { page: "home" } | { page: "area"; areaId: string } | LevelRoute;

/**
 * `#/level/<stageId>?v=<variant>&x=<拓展編號>`, `#/area/<areaId>`; anything else is home. An `x`
 * that is no positive integer is 原版.
 * Other level parameters, such as the old `w`, `t`, `h`, `r` and `c`, are ignored.
 */
export function parseHash(hash: string): Route {
  const area = /^#\/area\/([^?]+)$/.exec(hash);
  if (area) return { page: "area", areaId: decodeURIComponent(area[1]!) };
  const level = /^#\/level\/([^?]+)(?:\?(.*))?$/.exec(hash);
  if (!level) return { page: "home" };
  const params = new URLSearchParams(level[2] ?? "");
  const x = params.get("x");
  return {
    page: "level",
    stageId: decodeURIComponent(level[1]!),
    variant: params.get("v"),
    expansion: x && /^[1-9]\d*$/.test(x) ? Number(x) : null,
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
      if (route.expansion !== null) params.set("x", String(route.expansion));
      const query = params.size > 0 ? `?${params}` : "";
      return `#/level/${encodeURIComponent(route.stageId)}${query}`;
    }
  }
}

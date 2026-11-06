<script lang="ts">
  import {
    isWalkable,
    tileAt,
    type LevelMap,
    type Route,
    type Tile,
    type Vec2,
  } from "../level/index.ts";
  import type { Individual } from "../timeline/index.ts";
  import { browserStorage, loadMapView, saveMapView } from "./mapViewPreference.ts";
  import { strings } from "./strings.ts";

  interface Props {
    map: LevelMap;
    routes: Route[];
    enemies: { individual: Individual; position: Vec2; invisible: boolean }[];
  }
  let { map, routes, enemies }: Props = $props();

  /** Avatars that failed to load fall back to the enemy's code. */
  let brokenAvatars = $state(new Set<string>());
  function markBroken(avatar: string) {
    brokenAvatars = new Set([...brokenAvatars, avatar]);
  }

  let view = $state(loadMapView(browserStorage()));
  function toggleView() {
    view = view === "tilted" ? "flat" : "tilted";
    saveMapView(browserStorage(), view);
  }

  // The tilted view mimics the game's camera: the flat SVG rotated about its front (bottom)
  // edge, seen from a fixed distance in cells, so every map shares the game's angle.
  const tiltDeg = 35;
  const cameraCells = 18;
  const tilt = (tiltDeg * Math.PI) / 180;
  /** Projected height / flat height for a rotation about the bottom edge under perspective. */
  const projectedRatio = $derived(
    (Math.cos(tilt) * cameraCells) / (cameraCells + map.height * Math.sin(tilt)),
  );
  const stageStyle = $derived(
    [
      `--tilt: ${tiltDeg}deg`,
      `--perspective: calc(100cqw * ${cameraCells / map.width})`,
      // Margins in % resolve against the width; the SVG's height is width x height / width.
      `--tilt-pull: ${(-(1 - projectedRatio) * (map.height / map.width) * 100).toFixed(3)}%`,
      `--unsquash: ${(1 / Math.cos(tilt)).toFixed(4)}`,
    ].join("; "),
  );

  /** SVG y grows downward; model row 0 is the bottom row. */
  const svgY = (y: number) => map.height - 1 - y;

  /** The legend's tile kinds: 禁入, 高台, 不可放置, 平地. */
  type TileKind = "forbidden" | "highland" | "floor" | "lowland";
  function tileKind(tile: Tile): TileKind {
    if (!isWalkable(tile) && tile.buildableType === "NONE") return "forbidden";
    if (tile.heightType === "HIGHLAND") return "highland";
    return tile.buildableType === "NONE" ? "floor" : "lowland";
  }

  const cells = $derived(
    map.tiles.map((tile, i) => ({
      tile,
      row: Math.floor(i / map.width),
      col: i % map.width,
    })),
  );

  const starts = $derived(
    new Set(
      routes.filter((r) => r.motionMode !== "E_NUM").map((r) => `${r.start.row},${r.start.col}`),
    ),
  );
  const ends = $derived(
    new Set(routes.filter((r) => r.motionMode !== "E_NUM").map((r) => `${r.end.row},${r.end.col}`)),
  );
  const markerOf = (row: number, col: number, tile: Tile) =>
    tile.tileKey === "tile_start" || starts.has(`${row},${col}`)
      ? "start"
      : tile.tileKey === "tile_end" || ends.has(`${row},${col}`)
        ? "end"
        : null;

  /** A highland's front edge gets a shadow wherever the cell in front of it is lower. */
  const showsLedge = (row: number, col: number, tile: Tile) =>
    tileKind(tile) === "highland" && tileAt(map, { row: row - 1, col })?.heightType !== "HIGHLAND";
</script>

<div class="map-view">
  <div class="toolbar">
    <button type="button" class="view-toggle" aria-pressed={view === "flat"} onclick={toggleView}>
      {view === "tilted" ? strings.viewFlat : strings.viewTilted}
    </button>
  </div>

  <div class="stage" class:tilted={view === "tilted"} style={stageStyle}>
    <svg
      class="map"
      viewBox="-0.5 -0.5 {map.width} {map.height}"
      role="img"
      aria-label={strings.mapLabel}
    >
      {#each cells as { tile, row, col } (`${row},${col}`)}
        <rect
          class="tile {tileKind(tile)}"
          x={col - 0.5}
          y={svgY(row) - 0.5}
          width="1"
          height="1"
        />
        {#if showsLedge(row, col, tile)}
          <rect class="ledge" x={col - 0.5} y={svgY(row) + 0.36} width="1" height="0.14" />
        {/if}
      {/each}

      {#each cells as { tile, row, col } (`${row},${col}`)}
        {@const marker = markerOf(row, col, tile)}
        {#if tile.tileKey === "tile_hole"}
          <g class="hole" transform="translate({col} {svgY(row)})">
            <rect x="-0.4" y="-0.4" width="0.8" height="0.8" rx="0.12" />
            <path d="M -0.22 -0.22 L 0.22 0.22 M 0.22 -0.22 L -0.22 0.22" />
          </g>
        {/if}
        {#if marker}
          <g class="marker {marker}" transform="translate({col} {svgY(row)})">
            <rect x="-0.42" y="-0.42" width="0.84" height="0.84" rx="0.08" />
            <g class="billboard">
              <text y="0.07">{marker === "start" ? strings.start : strings.end}</text>
            </g>
          </g>
        {/if}
      {/each}

      {#each enemies as { individual, position, invisible } (individual.id)}
        <g
          class="enemy"
          class:invisible
          class:harmless={individual.harmless}
          transform="translate({position.x} {svgY(position.y)})"
          data-enemy={individual.enemy.id}
        >
          <g class="billboard">
            <title
              >{individual.enemy.name}{individual.harmless ? `(${strings.harmless})` : ""}</title
            >
            <circle r="0.36" class="enemy-bg" />
            {#if individual.enemy.avatar && !brokenAvatars.has(individual.enemy.avatar)}
              <image
                href={individual.enemy.avatar}
                x="-0.34"
                y="-0.34"
                width="0.68"
                height="0.68"
                clip-path="circle(50%)"
                onerror={() => markBroken(individual.enemy.avatar!)}
              />
            {:else}
              <text class="enemy-code"
                >{individual.enemy.code ?? individual.enemy.name.slice(0, 1)}</text
              >
            {/if}
            <circle r="0.36" class="enemy-ring" />
            {#if individual.harmless}
              <text class="harmless-tag" y="-0.42">{strings.harmless}</text>
            {/if}
          </g>
        </g>
      {/each}
    </svg>
  </div>

  <ul class="legend" aria-label={strings.legend}>
    <li><span class="swatch lowland"></span>{strings.legendLowland}</li>
    <li><span class="swatch floor"></span>{strings.legendFloor}</li>
    <li><span class="swatch highland"></span>{strings.legendHighland}</li>
    <li><span class="swatch forbidden"></span>{strings.legendForbidden}</li>
    <li><span class="swatch frame start"></span>{strings.start}</li>
    <li><span class="swatch frame end"></span>{strings.end}</li>
    <li><span class="swatch hole-swatch"></span>{strings.legendHole}</li>
  </ul>
</div>

<style>
  .map-view {
    --tile-lowland: #d9d4c7;
    --tile-floor: #b9b3a5;
    --tile-highland: #a9b4c2;
    --tile-forbidden: #4a4c53;
    --start: #e5484d;
    --end: #3e83f8;
    --hole: #121316;
  }
  .toolbar {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 6px;
  }
  .view-toggle {
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--panel);
    color: var(--fg);
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .stage {
    container-type: inline-size;
    background: #2a2b30;
    border-radius: 8px;
    overflow: hidden;
  }
  .map {
    display: block;
    width: 100%;
    height: auto;
    transform-origin: 50% 100%;
  }
  .stage.tilted .map {
    transform: perspective(var(--perspective)) rotateX(var(--tilt));
    margin-top: var(--tilt-pull);
  }
  /* Glyphs stand up toward the camera instead of lying flat on the tilted map. */
  .stage.tilted .billboard {
    transform: scale(1, var(--unsquash));
  }

  .tile {
    stroke: #00000040;
    stroke-width: 0.02;
  }
  .tile.lowland {
    fill: var(--tile-lowland);
  }
  .tile.floor {
    fill: var(--tile-floor);
  }
  .tile.highland {
    fill: var(--tile-highland);
  }
  .tile.forbidden {
    fill: var(--tile-forbidden);
  }
  .ledge {
    fill: #00000059;
  }
  .hole rect {
    fill: var(--hole);
    stroke: #000;
    stroke-width: 0.04;
  }
  .hole path {
    stroke: #8a8d96;
    stroke-width: 0.06;
    stroke-linecap: round;
  }
  .marker rect {
    fill: none;
    stroke-width: 0.08;
  }
  .marker.start rect {
    stroke: var(--start);
  }
  .marker.end rect {
    stroke: var(--end);
  }
  .marker text {
    font-size: 0.24px;
    font-weight: 700;
    text-anchor: middle;
  }
  .marker.start text {
    fill: var(--start);
  }
  .marker.end text {
    fill: var(--end);
  }
  .enemy-bg {
    fill: #fff;
  }
  .enemy-ring {
    fill: none;
    stroke: var(--start);
    stroke-width: 0.05;
  }
  .enemy-code {
    font-size: 0.26px;
    text-anchor: middle;
    dominant-baseline: central;
    fill: #1d1d1f;
  }
  .enemy.harmless .enemy-ring {
    stroke: #2e9e5b;
    stroke-dasharray: 0.12 0.08;
  }
  .harmless-tag {
    font-size: 0.2px;
    text-anchor: middle;
    fill: #2e9e5b;
    font-weight: 700;
  }
  .enemy.invisible {
    opacity: 0.4;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    margin: 8px 0 0;
    padding: 0;
    list-style: none;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .legend li {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .swatch {
    width: 14px;
    height: 14px;
    border-radius: 3px;
    border: 1px solid #00000040;
  }
  .swatch.lowland {
    background: var(--tile-lowland);
  }
  .swatch.floor {
    background: var(--tile-floor);
  }
  .swatch.highland {
    background: var(--tile-highland);
    box-shadow: inset 0 -4px 0 #00000059;
  }
  .swatch.forbidden {
    background: var(--tile-forbidden);
  }
  .swatch.frame {
    background: var(--tile-lowland);
    border: 2px solid;
  }
  .swatch.frame.start {
    border-color: var(--start);
  }
  .swatch.frame.end {
    border-color: var(--end);
  }
  .swatch.hole-swatch {
    background: var(--hole);
    background-image:
      linear-gradient(45deg, transparent 44%, #8a8d96 44% 56%, transparent 56%),
      linear-gradient(-45deg, transparent 44%, #8a8d96 44% 56%, transparent 56%);
  }
</style>

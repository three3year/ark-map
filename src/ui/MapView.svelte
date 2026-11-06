<script lang="ts">
  import { isWalkable, type LevelMap, type Route, type Tile, type Vec2 } from "../level/index.ts";
  import type { Individual } from "../timeline/index.ts";
  import { strings } from "./strings.ts";

  interface Props {
    map: LevelMap;
    routes: Route[];
    enemies: { individual: Individual; position: Vec2; invisible: boolean }[];
  }
  let { map, routes, enemies }: Props = $props();

  /** SVG y grows downward; model row 0 is the bottom row. */
  const svgY = (y: number) => map.height - 1 - y;

  function tileClass(tile: Tile): string {
    const walk = isWalkable(tile) ? "walk" : "blocked";
    const height = tile.heightType === "HIGHLAND" ? "high" : "low";
    return `${walk}-${height}`;
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
</script>

<svg
  class="map"
  viewBox="-0.5 -0.5 {map.width} {map.height}"
  role="img"
  aria-label={strings.mapLabel}
>
  {#each cells as { tile, row, col } (`${row},${col}`)}
    {@const marker = markerOf(row, col, tile)}
    <rect class="tile {tileClass(tile)}" x={col - 0.5} y={svgY(row) - 0.5} width="1" height="1" />
    {#if tile.heightType === "HIGHLAND"}
      <rect class="ledge" x={col - 0.5} y={svgY(row) + 0.38} width="1" height="0.12" />
    {/if}
    {#if marker}
      <rect
        class="marker {marker}"
        x={col - 0.42}
        y={svgY(row) - 0.42}
        width="0.84"
        height="0.84"
        rx="0.08"
      />
      <text class="marker-label" x={col} y={svgY(row) + 0.32}>
        {marker === "start" ? strings.start : strings.end}
      </text>
    {/if}
  {/each}

  {#each enemies as { individual, position, invisible } (individual.id)}
    <g
      class="enemy"
      class:invisible
      transform="translate({position.x} {svgY(position.y)})"
      data-enemy={individual.enemy.id}
    >
      <title>{individual.enemy.name}</title>
      <circle r="0.36" class="enemy-bg" />
      {#if individual.enemy.avatar}
        <image
          href={individual.enemy.avatar}
          x="-0.34"
          y="-0.34"
          width="0.68"
          height="0.68"
          clip-path="circle(50%)"
        />
      {:else}
        <text class="enemy-code">{individual.enemy.name.slice(0, 1)}</text>
      {/if}
      <circle r="0.36" class="enemy-ring" />
    </g>
  {/each}
</svg>

<style>
  .map {
    display: block;
    width: 100%;
    height: auto;
    background: #2a2b30;
    border-radius: 8px;
  }
  .tile {
    stroke: #00000040;
    stroke-width: 0.02;
  }
  .walk-low {
    fill: #d9d4c7;
  }
  .walk-high {
    fill: #a9b4c2;
  }
  .blocked-low {
    fill: #4a4c53;
  }
  .blocked-high {
    fill: #6c7280;
  }
  .ledge {
    fill: #00000033;
  }
  .marker {
    fill: none;
    stroke-width: 0.08;
  }
  .marker.start {
    stroke: #e5484d;
  }
  .marker.end {
    stroke: #3e83f8;
  }
  .marker-label {
    font-size: 0.2px;
    text-anchor: middle;
    fill: #1d1d1f;
  }
  .enemy-bg {
    fill: #fff;
  }
  .enemy-ring {
    fill: none;
    stroke: #e5484d;
    stroke-width: 0.05;
  }
  .enemy-code {
    font-size: 0.4px;
    text-anchor: middle;
    dominant-baseline: central;
    fill: #1d1d1f;
  }
  .enemy.invisible {
    opacity: 0.4;
  }
</style>

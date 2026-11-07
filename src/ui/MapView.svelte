<script lang="ts">
  import {
    cellKey,
    isWalkable,
    tileAt,
    type LevelMap,
    type TerrainInfo,
    type Tile,
    type Vec2,
  } from "../level/index.ts";
  import {
    endpointKey,
    type EndpointPlace,
    type Individual,
    type RouteEndpoint,
    type Snapshot,
    type Stay,
  } from "../timeline/index.ts";
  import { browserStorage, loadMapView, saveMapView } from "./mapViewPreference.ts";
  import { endpointName, strings } from "./strings.ts";
  import { legendMarks, terrainMark } from "./terrain.ts";
  import TerrainIcon from "./TerrainIcon.svelte";

  interface Props {
    map: LevelMap;
    /** The 名稱表's 地形表, naming the structures drawn on the map. */
    terrain: Record<string, TerrainInfo>;
    /** 出生點 and 消失點 of the wave on screen, drawn as red and blue dots. */
    endpoints: RouteEndpoint[];
    /** The 時刻快照's individuals on field at second `t`. */
    enemies: Snapshot["onField"];
    t: number;
    /** The selected individual, whose 路徑 is drawn; it may be off the field right now. */
    selected: Individual | null;
    /** Clicking the selected individual again passes null. */
    onSelect: (individual: Individual | null) => void;
    /** The 端點篩選's dot, drawn pressed; null when the spawn table is not filtered. */
    filter: EndpointPlace | null;
    /** A dot was clicked. */
    onFilter: (endpoint: RouteEndpoint) => void;
  }
  let { map, terrain, endpoints, enemies, t, selected, onSelect, filter, onFilter }: Props =
    $props();

  /** Share of the stay still to go: 1 as it starts, shrinking toward 0 as it ends. */
  const remainingOf = (stay: Stay) => (stay.end - t) / (stay.end - stay.start);
  const stayBarWidth = 0.64;

  function toggleSelect(individual: Individual) {
    onSelect(individual.id === selected?.id ? null : individual);
  }

  const points = (ps: Vec2[]) => ps.map((p) => `${p.x},${svgY(p.y)}`).join(" ");
  const tenth = (s: number) => Math.round(s * 10) / 10;
  /** Where each walk ends: a MOVE / PATROL_MOVE checkpoint, or the end point. */
  const checkpointMarks = $derived(
    (selected?.path ?? []).flatMap((leg) => (leg.kind === "move" ? [leg.points.at(-1)!] : [])),
  );

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

  /** The legend lists only what the map shows. */
  const tileKindOrder: TileKind[] = ["lowland", "floor", "highland", "forbidden"];
  const legendTileKinds = $derived.by(() => {
    const kinds = new Set(map.tiles.map(tileKind));
    return tileKindOrder.filter((kind) => kinds.has(kind));
  });
  const marks = $derived(legendMarks(map, terrain));

  /**
   * Endpoint dots sit in their cell's top-right corner, clear of the cell centre; a 消失點 on a
   * cell that is also a 出生點 sits just left of the red dot.
   */
  const endpointDots = $derived.by(() => {
    const spawnCells = new Set(
      endpoints.filter((e) => e.kind === "spawn").map((e) => cellKey(e.cell)),
    );
    return endpoints.map((endpoint) => {
      const { kind, cell } = endpoint;
      const besideSpawn = kind === "exit" && spawnCells.has(cellKey(cell));
      return { endpoint, x: cell.col + 0.32 - (besideSpawn ? 0.22 : 0), y: svgY(cell.row) - 0.32 };
    });
  });
  const hasEndpoint = (kind: RouteEndpoint["kind"]) => endpoints.some((e) => e.kind === kind);

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
        {@const mark = terrainMark(tile.tileKey, terrain)}
        {#if mark}
          <g
            class="terrain"
            transform="translate({col} {svgY(row)})"
            data-tile-key={tile.tileKey}
            role="img"
            aria-label={mark.name}
          >
            <TerrainIcon {mark} />
          </g>
        {/if}
      {/each}

      {#each endpointDots as { endpoint, x, y } (endpointKey(endpoint))}
        {@const pressed = filter !== null && endpointKey(filter) === endpointKey(endpoint)}
        <g
          class="endpoint {endpoint.kind}"
          class:pressed
          transform="translate({x} {y})"
          data-endpoint={endpoint.kind}
          data-cell={cellKey(endpoint.cell)}
          role="button"
          tabindex="0"
          aria-label={endpointName(endpoint)}
          aria-pressed={pressed}
          onclick={() => onFilter(endpoint)}
          onkeydown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onFilter(endpoint);
            }
          }}
        >
          <g class="billboard">
            <title>{strings.endpointFilterHint}</title>
            <circle class="dot" r="0.1" />
          </g>
        </g>
      {/each}

      {#if selected}
        <g class="path" data-path={selected.id}>
          {#each selected.path as leg, i (i)}
            {#if leg.kind === "move"}
              <polyline class="walk" class:invisible={leg.invisible} points={points(leg.points)} />
            {:else if leg.kind === "teleport"}
              <line
                class="teleport"
                x1={leg.from.x}
                y1={svgY(leg.from.y)}
                x2={leg.to.x}
                y2={svgY(leg.to.y)}
              />
            {/if}
          {/each}
          {#each checkpointMarks as mark, i (i)}
            <circle class="checkpoint" r="0.09" cx={mark.x} cy={svgY(mark.y)} />
          {/each}
          {#each selected.path as leg, i (i)}
            {#if leg.kind === "wait"}
              <circle class="wait" r="0.14" cx={leg.position.x} cy={svgY(leg.position.y)} />
            {/if}
          {/each}
        </g>
      {/if}

      {#each enemies as { individual, position, invisible, stay } (individual.id)}
        <g
          class="enemy"
          class:invisible
          class:harmless={individual.harmless}
          class:selected={individual.id === selected?.id}
          transform="translate({position.x} {svgY(position.y)})"
          data-enemy={individual.enemy.id}
          data-individual={individual.id}
          role="button"
          tabindex="0"
          aria-label={individual.enemy.name}
          aria-pressed={individual.id === selected?.id}
          onclick={() => toggleSelect(individual)}
          onkeydown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggleSelect(individual);
            }
          }}
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
            {#if stay}
              {@const remaining = remainingOf(stay)}
              <!-- Above the 無害敵人 tag when there is one. -->
              <g
                class="stay-bar"
                data-remaining={remaining.toFixed(3)}
                transform="translate({-stayBarWidth / 2} {individual.harmless ? -0.74 : -0.52})"
              >
                <rect class="stay-track" width={stayBarWidth} height="0.08" rx="0.04" />
                <rect class="stay-fill" width={stayBarWidth * remaining} height="0.08" rx="0.04" />
              </g>
            {/if}
          </g>
        </g>
      {/each}

      {#if selected}
        <!-- Wait labels sit above the enemies so an avatar never hides them. -->
        <g class="path">
          {#each selected.path as leg, i (i)}
            {#if leg.kind === "wait"}
              <g class="wait-label" transform="translate({leg.position.x} {svgY(leg.position.y)})">
                <g class="billboard">
                  <text y="-0.22">{strings.waitSeconds(tenth(leg.end - leg.start))}</text>
                </g>
              </g>
            {/if}
          {/each}
        </g>
      {/if}
    </svg>
  </div>

  <ul class="legend" aria-label={strings.legend}>
    {#each legendTileKinds as kind (kind)}
      <li><span class="swatch {kind}"></span>{strings.legendTileKind[kind]}</li>
    {/each}
    {#each marks as mark, i (i)}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <li class="terrain-item" tabindex="0" aria-describedby="terrain-tip-{i}">
        <!-- A glyph's box fills the swatch so the character stays legible at legend size. -->
        <svg
          class="swatch icon"
          viewBox={mark.kind === "glyph" ? "-0.27 -0.27 0.54 0.54" : "-0.5 -0.5 1 1"}
          aria-hidden="true"
        >
          <TerrainIcon {mark} />
        </svg>
        <span>{mark.name}</span>
        <span class="tip" role="tooltip" id="terrain-tip-{i}">{mark.description}</span>
      </li>
    {/each}
    {#each ["spawn", "exit"] as const as kind (kind)}
      {#if hasEndpoint(kind)}
        <li><span class="swatch dot {kind}"></span>{strings.endpoint[kind]}</li>
      {/if}
    {/each}
    {#if selected}
      <li><span class="swatch line walk"></span>{strings.legendPath}</li>
      <li><span class="swatch line teleport"></span>{strings.legendTeleport}</li>
    {/if}
  </ul>
</div>

<style>
  .map-view {
    --tile-lowland: #d9d4c7;
    --tile-floor: #b9b3a5;
    --tile-highland: #a9b4c2;
    --tile-forbidden: #4a4c53;
    --enemy-ring: var(--spawn-red);
    --path: #f5a524;
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
  .terrain {
    pointer-events: none;
  }
  .endpoint {
    cursor: pointer;
  }
  .endpoint:focus {
    outline: none;
  }
  .endpoint .dot {
    stroke: #fff;
    stroke-width: 0.03;
  }
  .endpoint.spawn .dot {
    fill: var(--spawn-red);
  }
  .endpoint.exit .dot {
    fill: var(--exit-blue);
  }
  .endpoint.pressed .dot,
  .endpoint:focus-visible .dot {
    stroke: var(--path);
    stroke-width: 0.06;
  }
  .enemy-bg {
    fill: #fff;
  }
  .enemy-ring {
    fill: none;
    stroke: var(--enemy-ring);
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
  .stay-track {
    fill: #1d1d1fb3;
  }
  .stay-fill {
    fill: var(--path);
  }
  .enemy {
    cursor: pointer;
  }
  .enemy:focus {
    outline: none;
  }
  .enemy.invisible {
    opacity: 0.4;
  }
  .enemy.invisible .enemy-ring {
    stroke-dasharray: 0.1 0.07;
  }
  .enemy.selected .enemy-ring {
    stroke: var(--path);
    stroke-width: 0.1;
  }
  .enemy:focus-visible .enemy-ring {
    stroke: var(--path);
  }

  .path {
    pointer-events: none;
  }
  .path .walk {
    fill: none;
    stroke: var(--path);
    stroke-width: 0.08;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .path .walk.invisible {
    stroke-opacity: 0.45;
  }
  .path .teleport {
    stroke: var(--path);
    stroke-width: 0.06;
    stroke-dasharray: 0.12 0.12;
  }
  .path .checkpoint {
    fill: #fff;
    stroke: var(--path);
    stroke-width: 0.05;
  }
  .path .wait {
    fill: var(--path);
  }
  .path .wait-label text {
    font-size: 0.22px;
    font-weight: 700;
    text-anchor: middle;
    fill: #fff;
    paint-order: stroke;
    stroke: #1d1d1f;
    stroke-width: 0.06px;
  }
  .swatch.line {
    height: 0;
    border: none;
    border-top: 3px solid var(--path);
    border-radius: 0;
  }
  .swatch.line.teleport {
    border-top-style: dashed;
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
  .swatch.icon {
    width: 18px;
    height: 18px;
    background: var(--tile-lowland);
  }
  .terrain-item {
    position: relative;
    cursor: help;
  }
  .terrain-item .tip {
    display: none;
    position: absolute;
    bottom: calc(100% + 6px);
    left: 0;
    z-index: 1;
    width: max-content;
    max-width: 260px;
    padding: 6px 8px;
    border-radius: 6px;
    background: #1d1d1f;
    color: #f5f5f7;
    font-size: 0.8rem;
    line-height: 1.4;
    box-shadow: 0 2px 8px #0000004d;
  }
  .terrain-item:hover .tip,
  .terrain-item:focus-visible .tip {
    display: block;
  }
  .swatch.dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid #fff;
  }
  .swatch.dot.spawn {
    background: var(--spawn-red);
  }
  .swatch.dot.exit {
    background: var(--exit-blue);
  }
</style>

<script lang="ts" module>
  import type { RemovalMoment, TimelineDevice } from "../timeline/index.ts";

  /** A device drawn on the map at the playback position. */
  export interface DeviceMark extends TimelineDevice {
    /** Drawn as removed: a dashed frame. */
    removed: boolean;
    /** Its 移除時刻, if it has one. */
    removal: RemovalMoment | null;
  }
</script>

<script lang="ts">
  import {
    cellKey,
    isWalkable,
    type DeviceIndex,
    type IndexedDevice,
    type LevelMap,
    type TerrainTable,
    type Tile,
    type Vec2,
  } from "../level/index.ts";
  import {
    endpointKey,
    matchesEndpoint,
    type EndpointPlace,
    type Individual,
    type RouteEndpoint,
    type Snapshot,
    type DeviceSwitchMark,
    type Stay,
    type SwitchMarkKind,
  } from "../timeline/index.ts";
  import {
    avatarRadius,
    ringOuter,
    ringStroke,
    stayBarHeight,
    stayBarTop,
    stayBarWidth,
  } from "./enemyGeometry.ts";
  import type { MapViewMode } from "./mapViewPreference.ts";
  import { endpointName, strings } from "./strings.ts";
  import { keepsFloorStripes, legendMarks, terrainMark } from "./terrain.ts";
  import SwitchMark from "./SwitchMark.svelte";
  import TerrainIcon from "./TerrainIcon.svelte";

  interface Props {
    map: LevelMap;
    /** The 名稱表's 地形表, naming the structures drawn on the map. */
    terrain: TerrainTable;
    devices: DeviceMark[];
    selectedDevice: DeviceIndex | null;
    /** Clicking the selected device again passes null. */
    onSelectDevice: (index: DeviceIndex | null) => void;
    /** A device was right-clicked. */
    onToggleRemoval: (device: IndexedDevice) => void;
    /** 出生點 and 消失點 of the wave on screen, drawn as red and blue dots. */
    endpoints: RouteEndpoint[];
    /** The 時刻快照's individuals on field at second `t` that are drawn: not 收起, or selected. */
    enemies: Snapshot["onField"];
    t: number;
    /** The selected individual, whose 路徑 is drawn; it may be off the field right now. */
    selected: Individual | null;
    /** Clicking the selected individual again passes null. */
    onSelect: (individual: Individual | null) => void;
    /**
     * The 端點篩選's dot, drawn pressed; the individuals outside it fade, selected or not. Null
     * when the spawn table is not filtered.
     */
    filter: EndpointPlace | null;
    /** A dot was clicked. */
    onFilter: (endpoint: RouteEndpoint) => void;
    onToggleStow: (individual: Individual) => void;
    view: MapViewMode;
    /** The 開關標記 kinds the legend lists: those the wave's enemies and drawn devices carry. */
    markKinds: SwitchMarkKind[];
  }
  let {
    map,
    terrain,
    devices,
    selectedDevice,
    onSelectDevice,
    onToggleRemoval,
    endpoints,
    enemies,
    t,
    selected,
    onSelect,
    filter,
    onFilter,
    onToggleStow,
    view,
    markKinds,
  }: Props = $props();

  /** Share of the stay still to go: 1 as it starts, shrinking toward 0 as it ends. */
  const remainingOf = (stay: Stay) => (stay.end - t) / (stay.end - stay.start);

  const markSide = 0.21;
  const markGap = 0.024;
  const markDigitWidth = 0.08;
  const markPadding = 0.064;
  const deviceHalfSide = 0.3;
  const markWidth = ({ number }: DeviceSwitchMark) =>
    Math.max(markSide, markDigitWidth * String(number).length + markPadding);
  function placedMarks(marks: DeviceSwitchMark[], corner: Vec2) {
    let right = corner.x;
    return marks.map((mark) => {
      const width = markWidth(mark);
      right -= width + markGap;
      return { mark, width, x: right + markGap, y: corner.y - markSide };
    });
  }

  const toggleSelect = (individual: Individual) =>
    onSelect(individual.id === selected?.id ? null : individual);
  const toggleSelectDevice = (index: DeviceIndex) =>
    onSelectDevice(index === selectedDevice ? null : index);
  function deviceKey(e: KeyboardEvent, index: DeviceIndex) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleSelectDevice(index);
    }
  }

  type OnField = Snapshot["onField"][number];
  /** Outside the 端點篩選, selected or not. */
  const isFaded = ({ individual }: OnField) =>
    filter !== null && !matchesEndpoint(individual, filter);
  const fadedEnemies = $derived(enemies.filter(isFaded));
  const shownEnemies = $derived(enemies.filter((e) => !isFaded(e)));

  const points = (ps: Vec2[]) => ps.map((p) => `${p.x},${svgY(p.y)}`).join(" ");
  const tenth = (s: number) => Math.round(s * 10) / 10;
  /** The selected individual's 路徑 left at `t`; `Trajectory.remainingPathAt` says when it is empty. */
  const path = $derived(selected?.remainingPathAt(t) ?? []);
  /** Where each walk ends: a MOVE / PATROL_MOVE checkpoint, or the end point. */
  const checkpointMarks = $derived(
    path.flatMap((leg) => (leg.kind === "move" ? [leg.points.at(-1)!] : [])),
  );

  let brokenImages = $state(new Set<string>());
  function markBroken(image: string) {
    brokenImages = new Set([...brokenImages, image]);
  }
  const shows = (image: string | null): image is string => !!image && !brokenImages.has(image);

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
  const legendDevices = $derived(
    (["device", "blocker"] as const).filter((kind) =>
      devices.some((d) => !d.removed && d.device.blocker === (kind === "blocker")),
    ),
  );

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

  /** Every 高台 gets a right triangle in each of its four corners, flush with the cell edge. */
  const highlandCorners =
    "M -0.5 -0.5 H -0.3 L -0.5 -0.3 Z M 0.5 -0.5 V -0.3 L 0.3 -0.5 Z " +
    "M 0.5 0.5 H 0.3 L 0.5 0.3 Z M -0.5 0.5 V 0.3 L -0.3 0.5 Z";
</script>

{#snippet switchMarks(marks: DeviceSwitchMark[], corner: Vec2)}
  {#each placedMarks(marks, corner) as { mark, width, x, y } (`${mark.kind} ${mark.number}`)}
    <g
      class="switch-mark"
      data-switch-mark={mark.kind}
      data-switch-mark-number={mark.number}
      transform="translate({x} {y})"
    >
      <rect {width} height={markSide} />
      <text x={width / 2} y={markSide / 2}>{mark.number}</text>
    </g>
  {/each}
{/snippet}

{#snippet enemyMark({ individual, position, invisible }: OnField, faded: boolean)}
  <g
    class="enemy"
    class:invisible
    class:harmless={individual.harmless}
    class:selected={individual.id === selected?.id}
    transform="translate({position.x} {svgY(position.y)})"
    data-enemy={individual.enemy.id}
    data-individual={individual.id}
    data-filtered-out={faded || undefined}
    role="button"
    tabindex="0"
    aria-label={individual.enemy.name}
    aria-pressed={individual.id === selected?.id}
    onclick={() => toggleSelect(individual)}
    oncontextmenu={(e) => {
      e.preventDefault();
      onToggleStow(individual);
    }}
    onkeydown={(e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleSelect(individual);
      }
    }}
  >
    <g class="billboard">
      <title>{individual.enemy.name}{individual.harmless ? `(${strings.harmless})` : ""}</title>
      <circle r={avatarRadius} class="enemy-bg" />
      {#if shows(individual.enemy.avatar)}
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
        <text class="enemy-code">{individual.enemy.code ?? individual.enemy.name.slice(0, 1)}</text>
      {/if}
      <circle r={avatarRadius} class="enemy-ring" stroke-width={ringStroke} />
      {#if individual.harmless}
        <text class="harmless-tag" y="-0.42">{strings.harmless}</text>
      {/if}
      {@render switchMarks(individual.marks, { x: ringOuter, y: ringOuter })}
    </g>
  </g>
{/snippet}

{#snippet stayBar({ individual, position, stay }: OnField)}
  {#if stay}
    {@const remaining = remainingOf(stay)}
    <g
      class="stay-bar"
      transform="translate({position.x} {svgY(position.y)})"
      data-stay={individual.id}
      data-remaining={remaining.toFixed(3)}
    >
      <g class="billboard">
        <g transform="translate({-stayBarWidth / 2} {stayBarTop(individual.harmless)})">
          <rect
            class="stay-track"
            width={stayBarWidth}
            height={stayBarHeight}
            rx={stayBarHeight / 2}
          />
          <rect
            class="stay-fill"
            width={stayBarWidth * remaining}
            height={stayBarHeight}
            rx={stayBarHeight / 2}
          />
          <!-- Seconds left, over the bar's right end. -->
          <text class="stay-seconds" x={stayBarWidth} y="-0.02">{(stay.end - t).toFixed(1)}</text>
        </g>
      </g>
    </g>
  {/if}
{/snippet}

<div class="map-view">
  <div class="stage" class:tilted={view === "tilted"} style={stageStyle}>
    <svg
      class="map"
      style:--switch-mark-side="{markSide}px"
      viewBox="-0.5 -0.5 {map.width} {map.height}"
      role="img"
      aria-label={strings.mapLabel}
    >
      <defs>
        <!-- 不可放置: a ring of yellow and black hazard stripes. -->
        <pattern
          id="floor-stripes"
          patternUnits="userSpaceOnUse"
          width="0.14"
          height="0.14"
          patternTransform="rotate(45)"
        >
          <rect width="0.14" height="0.14" fill="var(--floor-yellow)" />
          <rect width="0.07" height="0.14" fill="var(--floor-black)" />
        </pattern>
      </defs>
      {#each cells as { tile, row, col } (`${row},${col}`)}
        <rect
          class="tile {tileKind(tile)}"
          x={col - 0.5}
          y={svgY(row) - 0.5}
          width="1"
          height="1"
        />
        {#if tileKind(tile) === "highland"}
          <path
            class="highland-corners"
            transform="translate({col} {svgY(row)})"
            d={highlandCorners}
          />
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
        {#if tileKind(tile) === "floor" && keepsFloorStripes(mark)}
          <!-- Over the mark, so a cell-filling one like 深水區 cannot hide it. -->
          <rect class="floor-ring" x={col - 0.41} y={svgY(row) - 0.41} width="0.82" height="0.82" />
        {/if}
      {/each}

      {#each devices as { index, device, marks, removed, removal } (index)}
        <g
          class="device"
          class:removed
          class:blocker={!removed && device.blocker}
          class:selected={index === selectedDevice}
          transform="translate({device.cell.col} {svgY(device.cell.row)})"
          data-device={device.key}
          data-device-index={index}
          data-alias={device.alias}
          data-cell={cellKey(device.cell)}
          data-blocker={removed ? undefined : device.blocker}
          data-removed={removed || undefined}
          role="button"
          tabindex="0"
          aria-label={device.name}
          aria-pressed={index === selectedDevice}
          onclick={() => toggleSelectDevice(index)}
          onkeydown={(e) => deviceKey(e, index)}
          oncontextmenu={(e) => {
            e.preventDefault();
            onToggleRemoval({ index, device });
          }}
        >
          <g class="billboard">
            <title>{device.name}</title>
            {#if removed}
              <rect class="device-frame" x="-0.3" y="-0.3" width="0.6" height="0.6" rx="0.045" />
            {:else}
              <rect class="device-bg" x="-0.3" y="-0.3" width="0.6" height="0.6" rx="0.045" />
              {#if shows(device.image)}
                <image
                  href={device.image}
                  x="-0.27"
                  y="-0.27"
                  width="0.54"
                  height="0.54"
                  onerror={() => markBroken(device.image!)}
                />
              {:else}
                <text class="device-initial">{[...device.name][0]}</text>
              {/if}
              <rect class="device-frame" x="-0.3" y="-0.3" width="0.6" height="0.6" rx="0.045" />
              {#if removal}
                <g class="removal-clock" transform="translate(-0.225 -0.225)">
                  <title>{strings.removalMoment(removal.wave, removal.t)}</title>
                  <circle r="0.11" />
                  <path d="M 0 -0.07 V 0 H 0.05" />
                </g>
              {/if}
            {/if}
            {@render switchMarks(marks, { x: deviceHalfSide, y: deviceHalfSide })}
          </g>
        </g>
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
            <circle class="dot" r="0.1" />
          </g>
        </g>
      {/each}

      {#if path.length > 0}
        <g class="path" data-path={selected?.id}>
          {#each path as leg, i (i)}
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
          {#each path as leg, i (i)}
            {#if leg.kind === "wait"}
              <circle class="wait" r="0.14" cx={leg.position.x} cy={svgY(leg.position.y)} />
            {/if}
          {/each}
        </g>
      {/if}

      <!-- One layer fades them all at once, so enemies stacked on one spot fade no less. -->
      <g class="faded">
        {#each fadedEnemies as enemy (enemy.individual.id)}
          {@render enemyMark(enemy, true)}
        {/each}
      </g>
      {#each shownEnemies as enemy (enemy.individual.id)}
        {@render enemyMark(enemy, false)}
      {/each}

      {#if path.length > 0}
        <!-- Wait labels sit above the enemies so an avatar never hides them. -->
        <g class="path">
          {#each path as leg, i (i)}
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

      <g class="stay-bars">
        <g class="faded">
          {#each fadedEnemies as enemy (enemy.individual.id)}
            {@render stayBar(enemy)}
          {/each}
        </g>
        {#each shownEnemies as enemy (enemy.individual.id)}
          {@render stayBar(enemy)}
        {/each}
      </g>
    </svg>
  </div>

  <ul class="legend" aria-label={strings.legend}>
    {#each legendTileKinds as kind (kind)}
      <li><span class="swatch {kind}"></span>{strings.legendTileKind[kind]}</li>
    {/each}
    {#each marks as mark, i (i)}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <li
        class="terrain-item"
        class:described={mark.description !== null}
        tabindex={mark.description === null ? undefined : 0}
        aria-describedby={mark.description === null ? undefined : `terrain-tip-${i}`}
      >
        <!-- A glyph's box fills the swatch so the character stays legible at legend size. -->
        <svg
          class="swatch icon"
          viewBox={mark.kind === "glyph" ? "-0.27 -0.27 0.54 0.54" : "-0.5 -0.5 1 1"}
          aria-hidden="true"
        >
          <TerrainIcon {mark} />
        </svg>
        <span>{mark.name}</span>
        {#if mark.description !== null}
          <span class="tip" role="tooltip" id="terrain-tip-{i}">{mark.description}</span>
        {/if}
      </li>
    {/each}
    {#each legendDevices as kind (kind)}
      <li><span class="swatch device {kind}"></span>{strings.legendDevice[kind]}</li>
    {/each}
    {#each ["spawn", "exit"] as const as kind (kind)}
      {#if hasEndpoint(kind)}
        <li><span class="swatch dot {kind}"></span>{strings.endpoint[kind]}</li>
      {/if}
    {/each}
    {#each markKinds as kind (kind)}
      <li>
        <SwitchMark {kind} number={1} />
        <span>{strings.legendSwitchMark[kind]}</span>
      </li>
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
    --floor-yellow: #e2b93b;
    --floor-black: #2b2b2e;
    --tile-highland: #a9b4c2;
    --highland-corner: #4f5d70;
    --tile-forbidden: #4a4c53;
    --enemy-ring: var(--spawn-red);
    --device-bg: #f4f2ec;
    --device-frame: #5d6470;
    --device-blocker: #7c3aed;
    --path: #f5a524;
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
    user-select: none;
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
  .floor-ring {
    fill: none;
    stroke: url(#floor-stripes);
    stroke-width: 0.06;
  }
  .tile.highland {
    fill: var(--tile-highland);
  }
  .tile.forbidden {
    fill: var(--tile-forbidden);
  }
  .highland-corners {
    fill: var(--highland-corner);
  }
  .terrain {
    pointer-events: none;
  }
  .device-bg {
    fill: var(--device-bg);
  }
  .device-frame {
    fill: none;
    stroke: var(--device-frame);
    stroke-width: 0.04;
  }
  .device.blocker .device-frame {
    stroke: var(--device-blocker);
    stroke-width: 0.1;
  }
  .device.removed {
    opacity: 0.3;
  }
  .device.removed .device-frame {
    fill: transparent;
    stroke: var(--device-blocker);
    stroke-width: 0.06;
    stroke-dasharray: 0.12 0.08;
  }
  .device {
    cursor: pointer;
  }
  .device:focus {
    outline: none;
  }
  .device.selected .device-frame,
  .device:focus-visible .device-frame {
    stroke: var(--path);
  }
  .device.selected .device-frame {
    stroke-width: 0.1;
  }
  .removal-clock circle {
    fill: #fff;
    stroke: var(--device-blocker);
    stroke-width: 0.03;
  }
  .removal-clock path {
    fill: none;
    stroke: #1d1d1f;
    stroke-width: 0.03;
    stroke-linecap: round;
  }
  .device-initial {
    font-size: 0.26px;
    text-anchor: middle;
    dominant-baseline: central;
    fill: #1d1d1f;
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
    pointer-events: none;
    font-size: 0.2px;
    text-anchor: middle;
    fill: #2e9e5b;
    font-weight: 700;
  }
  .stay-bars {
    pointer-events: none;
  }
  .switch-mark {
    pointer-events: none;
  }
  .switch-mark rect {
    fill: var(--switch-mark-fill);
    rx: calc(var(--switch-mark-side) * var(--switch-mark-corner-ratio));
  }
  .switch-mark text {
    font-size: calc(var(--switch-mark-side) * var(--switch-mark-font-ratio));
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    text-anchor: middle;
    dominant-baseline: central;
    fill: #fff;
  }
  .stay-track {
    fill: #1d1d1fb3;
  }
  .stay-fill {
    fill: var(--path);
  }
  .stay-seconds {
    font-size: 0.2px;
    font-weight: 700;
    text-anchor: end;
    dominant-baseline: text-after-edge;
    fill: #fff;
    paint-order: stroke;
    stroke: #1d1d1f;
    stroke-width: 0.05px;
  }
  .enemy {
    cursor: pointer;
  }
  .enemy:focus {
    outline: none;
  }
  /* 隱形 and 端點篩選外 fade on different layers so the two multiply. */
  .enemy.invisible > .billboard {
    opacity: 0.7;
  }
  .faded {
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
    /* Floor colour, then a thin ring of stripes set in from the edge, as on the map. */
    box-sizing: border-box;
    padding: 1.5px;
    border: 1.5px solid var(--tile-floor);
    background:
      linear-gradient(var(--tile-floor), var(--tile-floor)) content-box,
      repeating-linear-gradient(45deg, var(--floor-black) 0 2px, var(--floor-yellow) 2px 4px)
        padding-box;
  }
  .swatch.highland {
    --c: var(--highland-corner);
    background:
      linear-gradient(135deg, var(--c) 50%, transparent 50%) top left / 5px 5px no-repeat,
      linear-gradient(225deg, var(--c) 50%, transparent 50%) top right / 5px 5px no-repeat,
      linear-gradient(315deg, var(--c) 50%, transparent 50%) bottom right / 5px 5px no-repeat,
      linear-gradient(45deg, var(--c) 50%, transparent 50%) bottom left / 5px 5px no-repeat,
      var(--tile-highland);
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
  }
  .terrain-item.described {
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
  .swatch.device {
    border-radius: 2px;
    background: var(--device-bg);
    border: 1.5px solid var(--device-frame);
  }
  .swatch.device.blocker {
    border: 3px solid var(--device-blocker);
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

<script lang="ts">
  import {
    variantModifiers,
    variantsShowing,
    type Area,
    type DeviceIndex,
    type IndexedDevice,
    type Level,
    type StageEntry,
    type NameTable,
    type Variant,
    type VariantId,
  } from "../level/index.ts";
  import type { StageLink } from "./adjacentStages.ts";
  import LevelInfo from "./LevelInfo.svelte";
  import {
    actionKey,
    buildTimeline,
    endpointKey,
    individualKey,
    isEmptyWave,
    removalToggle,
    routeEndpoints,
    spawnPlan,
    spawnTable,
    switchConditional,
    switchHidden,
    switchMarkKinds,
    switchPick,
    takeSnapshot,
    timelineEnd,
    toggleRemoval,
    type ConditionalTrigger,
    type EndpointPlace,
    type Individual,
    type Removals,
    type RouteEndpoint,
    type SpawnRow,
    type SpawnSwitches,
    type TimelineDevice,
  } from "../timeline/index.ts";
  import SwitchPanel from "./SwitchPanel.svelte";
  import MapView, { type DrawnDevice } from "./MapView.svelte";
  import { browserStorage, loadMapView, saveMapView } from "./mapViewPreference.ts";
  import { afterStop, playbackStop } from "./playback.ts";
  import { sameView, type LevelView } from "./levelView.ts";
  import { formatHash } from "./route.ts";
  import { tick, type Snippet } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import SpawnTable, { combinedStow, type RowStow } from "./SpawnTable.svelte";
  import TimelineBar from "./TimelineBar.svelte";
  import WaveSelect from "./WaveSelect.svelte";
  import { attackRadius, enemyAttributes } from "./panelContent.ts";
  import { stageLabel, strings, variantLabel } from "./strings.ts";
  import { hiddenGroupText } from "./panelContent.ts";

  interface Props {
    /**
     * The site's title, drawn atop the left column: the spawn table's column beside it then starts
     * at the page's top edge, so a column as tall as the window fits in it at every page scroll.
     * Its first argument goes right after the title, its second at the end of the title's row.
     */
    siteTitle: Snippet<[Snippet, Snippet]>;
    footer: Snippet;
    area: Area;
    stage: StageEntry;
    variant: Variant;
    view: LevelView;
    level: Level;
    names: NameTable;
    /** 上一關 and 下一關 in the area; null at its ends. */
    prev: StageLink | null;
    next: StageLink | null;
    /** 0-based wave index; out-of-range indices show the first wave. */
    wave: number;
    t: number;
    /** 開關狀態: only what differs from the variant's default. */
    switches: SpawnSwitches;
    onSeek: (t: number) => void;
    onSelectWave: (wave: number) => void;
    onVariant: (variant: VariantId) => void;
    /** Go to `t` of `wave` in one step. */
    onJump: (wave: number, t: number) => void;
    onSwitches: (switches: SpawnSwitches) => void;
  }
  let {
    siteTitle,
    footer,
    area,
    stage,
    variant,
    view,
    level,
    names,
    prev,
    next,
    wave,
    t,
    switches,
    onSeek,
    onSelectWave,
    onVariant,
    onJump,
    onSwitches,
  }: Props = $props();

  let mapView = $state(loadMapView(browserStorage()));
  function toggleMapView() {
    mapView = mapView === "tilted" ? "flat" : "tilted";
    saveMapView(browserStorage(), mapView);
  }

  const difficulty = $derived(variant.difficulty);
  const waveIndex = $derived(wave < level.waves.length ? wave : 0);
  interface RemovalRecord {
    view: LevelView;
    moments: Removals;
  }
  let removalRecord = $state.raw<RemovalRecord | null>(null);
  const removals: Removals = $derived(
    removalRecord && sameView(removalRecord.view, view) ? removalRecord.moments : new Map(),
  );
  $effect(() => {
    if (removalRecord && removals !== removalRecord.moments) removalRecord = null;
  });
  const plan = $derived(spawnPlan(level, difficulty, switches));
  const timeline = $derived(buildTimeline(level, { waveIndex, difficulty, switches, removals }));
  const modifiers = $derived(variantModifiers(level.modifiers, difficulty));
  const fileVariants = $derived(variantsShowing(stage, view.shownFile));
  const hiddenGroupBadge = (name: string) => hiddenGroupText(level, name, fileVariants).badge;
  const rows = $derived(spawnTable(level, { difficulty, switches }));
  const setHidden = (name: string, on: boolean) =>
    onSwitches(switchHidden(level, difficulty, switches, name, on));
  const pick = (group: number, candidate: number) =>
    onSwitches(switchPick(level, switches, group, candidate));
  const setConditional = (branch: number, trigger: ConditionalTrigger | null) =>
    onSwitches(switchConditional(switches, branch, trigger));
  const emptyWave = $derived(isEmptyWave(timeline));
  $effect(() => {
    if (emptyWave && t !== 0) onSeek(0);
  });
  const end = $derived(Math.ceil(timelineEnd(timeline)));
  const stop = $derived(playbackStop(timeline));
  const snapshot = $derived(takeSnapshot(timeline, t));
  const drawnDevice =
    (removed: boolean) =>
    (d: TimelineDevice): DrawnDevice => ({ ...d, removed, removal: removals.get(d.index) ?? null });
  const drawnDevices = $derived([
    ...timeline.removedAt(t).map(drawnDevice(true)),
    ...timeline.devicesAt(t).map(drawnDevice(false)),
  ]);
  const endpoints = $derived(routeEndpoints(timeline));

  /** The one thing selected: an individual (by {@link individualKey}) or a device, in a wave. */
  type Selection =
    | { kind: "individual"; levelId: string; wave: number; individual: string }
    | { kind: "device"; view: LevelView; wave: number; index: DeviceIndex };
  let selection = $state.raw<Selection | null>(null);
  const selected = $derived.by(() => {
    const s = selection;
    if (s?.kind !== "individual" || s.levelId !== level.levelId || s.wave !== waveIndex) {
      return null;
    }
    return timeline.individuals.find((i) => i.id === s.individual) ?? null;
  });
  const selectedState = $derived(selected?.stateAt(t).kind);

  /** A selection on the map: the spawn table, if on screen, scrolls to its row. */
  function select(individual: Individual | null) {
    const changed = individual !== null && individual.id !== selected?.id;
    selection = individual && {
      kind: "individual",
      levelId: level.levelId,
      wave: waveIndex,
      individual: individual.id,
    };
    if (changed && (!drawerMode.current || drawerOpen)) void revealSelectedRow();
  }

  let sideColumn: HTMLElement;
  /**
   * Scroll the spawn table's column, and nothing else, to put the selected individual's row in its
   * middle, unless the row already shows whole in it. A row the 端點篩選 hides stays hidden.
   */
  async function revealSelectedRow() {
    await tick();
    if (!selected) return;
    const row = sideColumn.querySelector(
      `tr[data-wave="${waveIndex}"][data-action="${actionKey(selected)}"]`,
    );
    if (!row) return;
    // The 捲動範圍: the column's box inside its border and above a sideways scrollbar.
    const top = sideColumn.getBoundingClientRect().top + sideColumn.clientTop;
    const bottom = top + sideColumn.clientHeight;
    const box = row.getBoundingClientRect();
    if (box.top >= top && box.bottom <= bottom) return;
    sideColumn.scrollTop += (box.top + box.bottom - top - bottom) / 2;
  }

  interface Stowed {
    view: LevelView;
    waves: ReadonlyMap<number, ReadonlySet<string>>;
  }
  let stowed = $state.raw<Stowed | null>(null);
  const stowedWaves = $derived(
    stowed && sameView(stowed.view, view) ? stowed.waves : new Map<number, ReadonlySet<string>>(),
  );
  $effect(() => {
    if (stowed && stowedWaves !== stowed.waves) stowed = null;
  });
  const stowedHere: ReadonlySet<string> = $derived(stowedWaves.get(waveIndex) ?? new Set());
  const stowedCount = $derived(timeline.individuals.filter((i) => stowedHere.has(i.id)).length);
  const drawn = $derived(
    snapshot.onField.filter(
      (e) => !stowedHere.has(e.individual.id) || e.individual.id === selected?.id,
    ),
  );

  function writeStowed(wave: number, ids: Iterable<string>) {
    const waves = new Map([...stowedWaves, [wave, new Set(ids)]]);
    stowed = { view, waves };
  }
  function stowAndDeselect(wave: number, ids: Iterable<string>) {
    const stowing = new Set(ids);
    writeStowed(wave, [...(stowedWaves.get(wave) ?? []), ...stowing]);
    if (
      selection?.kind === "individual" &&
      selection.levelId === level.levelId &&
      selection.wave === wave &&
      stowing.has(selection.individual)
    ) {
      selection = null;
    }
  }
  function showStowed(wave: number, ids: Iterable<string>) {
    const showing = new Set(ids);
    writeStowed(
      wave,
      [...(stowedWaves.get(wave) ?? [])].filter((id) => !showing.has(id)),
    );
  }
  const rowIndividuals = (row: SpawnRow) =>
    Array.from({ length: row.count }, (_, k) => individualKey({ ...row, spawnIndex: k }));
  function rowStow(row: SpawnRow): RowStow {
    const stowedInWave = stowedWaves.get(row.waveIndex);
    const individualStows = rowIndividuals(row).map((id) =>
      stowedInWave?.has(id) ? "stowed" : "shown",
    );
    return combinedStow(individualStows) ?? "shown";
  }
  function stowRows(rows: SpawnRow[], stow: boolean) {
    for (const wave of new Set(rows.map((r) => r.waveIndex))) {
      const ids = rows.filter((r) => r.waveIndex === wave).flatMap(rowIndividuals);
      if (stow) stowAndDeselect(wave, ids);
      else showStowed(wave, ids);
    }
  }
  function toggleStow(individual: Individual) {
    if (stowedHere.has(individual.id)) showStowed(waveIndex, [individual.id]);
    else stowAndDeselect(waveIndex, [individual.id]);
  }

  function toggleDeviceRemoval({ index, device }: IndexedDevice) {
    if (!device.blocker) return;
    removalRecord = { view, moments: toggleRemoval(removals, index, { wave: waveIndex, t }) };
  }
  const removalLabel = (index: DeviceIndex) =>
    removalToggle(removals, index, { wave: waveIndex, t }) === "restore"
      ? strings.restore
      : strings.remove;

  const selectedDevice = $derived.by((): IndexedDevice | null => {
    const s = selection;
    if (s?.kind !== "device" || !sameView(s.view, view) || s.wave !== waveIndex) return null;
    const device = level.devices[s.index];
    return device ? { index: s.index, device } : null;
  });
  const effectCells = $derived.by(() => {
    const s = selectedDevice;
    const onField = s && drawnDevices.some((d) => d.index === s.index && !d.removed);
    return onField ? s.device.effectCells : [];
  });
  /** A device selected on another wave of the view stays selected while it is drawn here. */
  const drawnOnThisWave = (s: Selection & { kind: "device" }) =>
    sameView(s.view, view) && drawnDevices.some((d) => d.index === s.index);
  $effect(() => {
    const s = selection;
    if (s?.kind !== "device" || (sameView(s.view, view) && s.wave === waveIndex)) return;
    selection = drawnOnThisWave(s) ? { ...s, wave: waveIndex } : null;
  });
  function selectDevice(index: DeviceIndex | null) {
    selection = index === null ? null : { kind: "device", view, wave: waveIndex, index };
  }

  interface EndpointFilter {
    view: LevelView;
    wave: number;
    endpoint: EndpointPlace;
  }
  let endpointFilter = $state<EndpointFilter | null>(null);
  const filtered = $derived.by(() => {
    const f = endpointFilter;
    if (!f || !sameView(f.view, view) || f.wave !== waveIndex) return null;
    const key = endpointKey(f.endpoint);
    return endpoints.find((e) => endpointKey(e) === key) ?? null;
  });
  $effect(() => {
    if (endpointFilter && !filtered) endpointFilter = null;
  });

  const widestSpawnTable = 922;
  const tableBorders = 2;
  const columnScrollbar = 15;
  const sideColumnWidth = widestSpawnTable + tableBorders + columnScrollbar;
  /**
   * An enemy icon (0.68 cell) on a 13-cell-wide map (95% of levels are no wider) stays at least
   * as large as the spawn table's 28px avatars.
   */
  const narrowestMap = 540;
  const columnGap = 24;
  const pageSidePadding = 32;
  const pageScrollbar = 17;
  const breakpoint = narrowestMap + columnGap + sideColumnWidth + pageSidePadding + pageScrollbar;
  /**
   * Below the breakpoint the spawn table is in a drawer over the page, closed on every visit to
   * the level page.
   */
  const drawerMode = new MediaQuery(`width < ${breakpoint}px`);
  let drawerOpen = $state(false);
  /** Opening the drawer shows the selected individual's row. */
  function setDrawerOpen(open: boolean) {
    if (open && !drawerOpen) void revealSelectedRow();
    drawerOpen = open;
  }

  /**
   * A dot filters the spawn table to it, opening the drawer to show it; the dot of the filter on
   * screen clears it.
   */
  function toggleFilter({ kind, cell }: RouteEndpoint) {
    const endpoint = { kind, cell };
    if (filtered && endpointKey(filtered) === endpointKey(endpoint)) {
      endpointFilter = null;
      return;
    }
    endpointFilter = { view, wave: waveIndex, endpoint };
    if (drawerMode.current) setDrawerOpen(true);
  }

  /** Playback reached this 波次's stop second: move on to the next 波次, or stop on the last. */
  function playbackReachedStop(): boolean {
    const after = afterStop(waveIndex, level.waves.length);
    if (after.kind === "stop") return false;
    onSelectWave(after.wave);
    return true;
  }

  /** A spawn-table row: jump to its first individual's spawn and select it. */
  function jumpTo(row: SpawnRow) {
    selection = {
      kind: "individual",
      levelId: level.levelId,
      wave: row.waveIndex,
      individual: individualKey({ ...row, spawnIndex: 0 }),
    };
    onJump(row.waveIndex, row.waveTime);
  }
</script>

{#snippet backToArea()}
  <nav>
    <a href={formatHash({ page: "area", areaId: area.id })}>← {area.code ?? ""} {area.name}</a>
  </nav>
{/snippet}

{#snippet viewToggle()}
  <button
    type="button"
    class="view-toggle"
    aria-pressed={mapView === "flat"}
    onclick={toggleMapView}
  >
    {mapView === "tilted" ? strings.viewFlat : strings.viewTilted}
  </button>
{/snippet}

<div
  class="level-page"
  class:drawer-mode={drawerMode.current}
  style:--side-column-width="{sideColumnWidth}px"
  style:--column-gap="{columnGap}px"
>
  <div class="main-column">
    {@render siteTitle(backToArea, viewToggle)}
    <div class="title-line">
      {#if prev}
        <a href={prev.href} data-adjacent="prev">‹ {prev.stage.name}</a>
      {/if}
      <h2>{stageLabel(stage)}</h2>
      {#if stage.variants.length > 1}
        <div class="variants segmented" role="group" aria-label={strings.variantPicker}>
          {#each stage.variants as v (v.id)}
            <button
              type="button"
              aria-pressed={v.id === variant.id}
              data-variant={v.id}
              onclick={() => onVariant(v.id)}
            >
              {variantLabel(v.id)}
            </button>
          {/each}
        </div>
      {/if}
      {#if next}
        <a href={next.href} data-adjacent="next">{next.stage.name} ›</a>
      {/if}
    </div>
    <div class="map-controls">
      {#if level.waves.length > 1}
        <WaveSelect count={level.waves.length} wave={waveIndex} onSelect={onSelectWave} />
      {/if}
      <TimelineBar {t} {end} {stop} {emptyWave} {onSeek} onReachStop={playbackReachedStop} />
    </div>
    <MapView
      view={mapView}
      map={level.map}
      terrain={names.terrain}
      devices={drawnDevices}
      selectedDevice={selectedDevice?.index ?? null}
      {effectCells}
      onSelectDevice={selectDevice}
      onToggleRemoval={toggleDeviceRemoval}
      {endpoints}
      enemies={drawn}
      {t}
      {selected}
      attackRadius={selected ? attackRadius(selected.enemy, modifiers) : null}
      onSelect={select}
      filter={filtered}
      onFilter={toggleFilter}
      onToggleStow={toggleStow}
      markKinds={switchMarkKinds(timeline)}
    />
    {#if selected && selectedState}
      <p class="selection" data-selected={selected.id}>
        <span>{strings.selected(selected.enemy.name, strings.stateLabel[selectedState])}</span>
        <span class="selection-actions">
          <button type="button" onclick={() => toggleStow(selected)}>
            {stowedHere.has(selected.id) ? strings.show : strings.stow}
          </button>
          <button type="button" onclick={() => select(null)}>{strings.deselect}</button>
        </span>
      </p>
      <dl class="enemy-attributes" aria-label={strings.enemyAttributesLabel}>
        {#each enemyAttributes(selected.enemy, modifiers) as attribute (attribute.key)}
          <div data-attribute={attribute.key}>
            <dt>{attribute.label}</dt>
            <dd class:modified={attribute.modified} title={attribute.tooltip ?? undefined}>
              {attribute.text}
            </dd>
          </div>
        {/each}
      </dl>
    {:else if selectedDevice}
      {@const { index, device } = selectedDevice}
      <div class="selection device-selection" data-selected-device={index}>
        <div class="device-about">
          <span>{strings.selectedDevice(device.name)}</span>
          {#if device.description}
            <span class="device-description">{device.description}</span>
          {/if}
        </div>
        <span class="selection-actions">
          {#if device.blocker}
            <button type="button" onclick={() => toggleDeviceRemoval({ index, device })}>
              {removalLabel(index)}
            </button>
          {/if}
          <button type="button" onclick={() => selectDevice(null)}>{strings.deselect}</button>
        </span>
      </div>
    {/if}
    <div aria-live="polite">
      {#if stowedCount > 0}
        <p class="stowed" data-stowed-count={stowedCount}>
          <span>{strings.stowedCount(stowedCount)}</span>
          <button type="button" onclick={() => showStowed(waveIndex, stowedHere)}>
            {strings.showAllStowed}
          </button>
        </p>
      {/if}
      {#if removals.size > 0}
        <p class="removed-count" data-removed-count={removals.size}>
          <span>{strings.removedCount(removals.size)}</span>
          <button type="button" onclick={() => (removalRecord = null)}>{strings.restoreAll}</button>
        </p>
      {/if}
    </div>
    <SwitchPanel
      {level}
      {plan}
      {fileVariants}
      conditional={switches.conditional ?? {}}
      wave={waveIndex}
      {t}
      onHidden={setHidden}
      onPick={pick}
      onConditional={setConditional}
    />
    <LevelInfo {level} {modifiers} {names} {plan} variantName={variantLabel(variant.id)} />
    {@render footer()}
  </div>
  <!--
    Wide screens: a column beside the map that stays on screen. Narrow screens: a drawer over the
    page, its button sticking out in the bottom-right corner. Either way .side-column scrolls the
    table.
  -->
  {#if drawerMode.current && drawerOpen}
    <!--
      Under the open drawer, over the rest of the page: a click outside the drawer closes it and
      reaches nothing below, so a dot under it cannot reopen the drawer at once. The drawer's
      button does the same for the keyboard.
    -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="drawer-backdrop" onclick={() => setDrawerOpen(false)}></div>
  {/if}
  <div class="side" class:open={drawerOpen}>
    <button
      type="button"
      class="drawer-button"
      aria-expanded={drawerOpen}
      aria-controls="spawn-table-drawer"
      onclick={() => setDrawerOpen(!drawerOpen)}
    >
      {strings.spawnTable}
    </button>
    <div class="side-column" id="spawn-table-drawer" bind:this={sideColumn}>
      <SpawnTable
        {rows}
        wave={waveIndex}
        multiWave={level.waves.length > 1}
        {selected}
        onJump={jumpTo}
        onPick={pick}
        filter={filtered}
        onClearFilter={() => (endpointFilter = null)}
        {rowStow}
        onStow={stowRows}
        {hiddenGroupBadge}
      />
    </div>
  </div>
</div>

<style>
  /*
   * Wide screens: the map beside a column holding the spawn table.
   * - The column is --side-column-width. A fixed width keeps the map from resizing as a 端點篩選
   *   or a switch changes the rows. Below the breakpoint the drawer is as wide, room allowing.
   * - The map keeps at least the script's `narrowestMap`.
   * - Which side of the breakpoint the window is on: `.drawer-mode`, set by the script.
   * - Above the breakpoint the page has no width cap: the map takes the width the column leaves.
   */
  /* Below the breakpoint: one column, as wide as the other pages. */
  .level-page {
    max-width: 960px;
    margin: 0 auto;
    /* Three characters, the button's padding and its borders. */
    --drawer-button-height: calc(3em + 2 * 12px + 2 * 1px);
    --drawer-button-gap: 16px;
  }
  .level-page.drawer-mode {
    padding-bottom: calc(
      var(--drawer-button-height) + var(--drawer-button-gap) + env(safe-area-inset-bottom)
    );
  }
  .level-page:not(.drawer-mode) {
    max-width: none;
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--side-column-width);
    gap: var(--column-gap);
    align-items: start;
    /*
     * Take the page's 32px bottom padding into the row: the sticky column cannot leave its row,
     * so with the padding below the row it slid 32px up off screen at the bottom of the page.
     */
    margin-bottom: -32px;
  }
  .level-page:not(.drawer-mode) .main-column {
    padding-bottom: 32px;
  }
  /*
   * Stays on screen as the page scrolls; the spawn table scrolls inside it. Its row starts at the
   * page's top edge, the site title being in the left column, so the column, as tall as the
   * window, lies wholly inside the window at every page scroll.
   */
  .level-page:not(.drawer-mode) .side {
    position: sticky;
    top: 0;
    height: 100vh;
  }
  .level-page:not(.drawer-mode) .side-column {
    height: 100%;
    overflow-y: auto;
  }
  .level-page:not(.drawer-mode) .drawer-button {
    display: none;
  }
  /*
   * Below the breakpoint: a drawer sliding out from the right over the page, so the map keeps its
   * size. Its button sticks out of its left edge near the bottom: in the window's bottom-right
   * corner while it is closed, where it covers less of the map than halfway up the right edge.
   * The 48px left uncovered keeps the button on screen while the drawer is open.
   */
  .level-page.drawer-mode .side {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 10;
    width: min(var(--side-column-width), calc(100% - 48px));
    transform: translateX(100%);
    transition: transform 0.2s ease;
    background: var(--bg);
    border-left: 1px solid var(--border);
  }
  .level-page.drawer-mode .side.open {
    transform: none;
    box-shadow: -4px 0 16px rgb(0 0 0 / 0.2);
  }
  .drawer-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9;
  }
  /* Hidden once closed, so the table is out of the tab order and the accessibility tree. */
  .level-page.drawer-mode .side-column {
    box-sizing: border-box;
    height: 100%;
    padding: 0 12px 12px;
    overflow-y: auto;
    visibility: hidden;
    transition: visibility 0s 0.2s;
  }
  .level-page.drawer-mode .side.open .side-column {
    visibility: visible;
    transition-delay: 0s;
  }
  .level-page.drawer-mode .drawer-button {
    position: absolute;
    bottom: calc(var(--drawer-button-gap) + env(safe-area-inset-bottom));
    right: 100%;
    box-sizing: border-box;
    height: var(--drawer-button-height);
    writing-mode: vertical-rl;
    padding: 12px 6px;
    border: 1px solid var(--border);
    border-right: none;
    border-radius: 8px 0 0 8px;
    background: var(--panel);
    color: var(--fg);
    font: inherit;
    cursor: pointer;
    box-shadow: -2px 0 6px rgb(0 0 0 / 0.15);
  }
  .level-page.drawer-mode .drawer-button[aria-expanded="true"] {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  /* Only the drawer has transitions to drop. */
  @media (prefers-reduced-motion: reduce) {
    .level-page.drawer-mode .side,
    .level-page.drawer-mode .side-column {
      transition: none;
    }
  }
  nav a,
  .title-line a {
    color: var(--accent);
  }
  .title-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 16px;
    margin: 0 0 12px;
  }
  h2 {
    margin: 0;
    font-size: 1.4rem;
  }
  .selection,
  .stowed,
  .removed-count {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 8px 0 0;
    font-size: 0.9rem;
  }
  .selection {
    justify-content: space-between;
  }
  .selection-actions {
    display: flex;
    flex-shrink: 0;
    gap: 8px;
  }
  .enemy-attributes {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 4px 16px;
    margin: 6px 0 0;
    font-size: 0.85rem;
  }
  @media (width < 600px) {
    .enemy-attributes {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  .enemy-attributes div {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .enemy-attributes dt {
    color: var(--muted);
  }
  .enemy-attributes dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
  .enemy-attributes dd.modified {
    color: var(--attribute-modified);
    font-weight: 600;
    cursor: help;
  }
  .device-about {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .device-description {
    color: var(--muted);
    white-space: pre-line;
  }
  .stowed,
  .removed-count {
    color: var(--muted);
  }
  .selection button,
  .stowed button,
  .removed-count button {
    padding: 2px 10px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--panel);
    color: var(--fg);
    font: inherit;
    cursor: pointer;
  }
  .map-controls {
    margin-bottom: 12px;
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
</style>

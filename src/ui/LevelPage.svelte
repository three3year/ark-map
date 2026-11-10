<script lang="ts">
  import {
    variantModifiers,
    type Area,
    type Level,
    type StageEntry,
    type TerrainTable,
    type Variant,
    type VariantId,
  } from "../level/index.ts";
  import LevelInfo from "./LevelInfo.svelte";
  import {
    actionKey,
    buildTimeline,
    endpointKey,
    individualKey,
    isEmptyWave,
    routeEndpoints,
    spawnPlan,
    spawnTable,
    switchConditional,
    switchHidden,
    switchPick,
    takeSnapshot,
    timelineEnd,
    type ConditionalTrigger,
    type EndpointPlace,
    type Individual,
    type RouteEndpoint,
    type SpawnRow,
    type SpawnSwitches,
  } from "../timeline/index.ts";
  import SwitchPanel from "./SwitchPanel.svelte";
  import MapView from "./MapView.svelte";
  import { afterStop, playbackStop } from "./playback.ts";
  import { sameView, type LevelView } from "./levelView.ts";
  import { formatHash } from "./route.ts";
  import { tick, type Snippet } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import SpawnTable, { combinedStow, type RowStow } from "./SpawnTable.svelte";
  import TimelineBar from "./TimelineBar.svelte";
  import WaveSelect from "./WaveSelect.svelte";
  import { strings, variantLabel } from "./strings.ts";

  interface Props {
    /**
     * The site's title, drawn atop the left column: the spawn table's column beside it then starts
     * at the page's top edge, so a column as tall as the window fits in it at every page scroll.
     */
    siteTitle: Snippet;
    area: Area;
    stage: StageEntry;
    variant: Variant;
    view: LevelView;
    level: Level;
    /** The 名稱表's 地形表. */
    terrain: TerrainTable;
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
    area,
    stage,
    variant,
    view,
    level,
    terrain,
    wave,
    t,
    switches,
    onSeek,
    onSelectWave,
    onVariant,
    onJump,
    onSwitches,
  }: Props = $props();

  const difficulty = $derived(variant.difficulty);
  const waveIndex = $derived(wave < level.waves.length ? wave : 0);
  const plan = $derived(spawnPlan(level, difficulty, switches));
  const timeline = $derived(buildTimeline(level, { waveIndex, difficulty, switches }));
  const modifiers = $derived(variantModifiers(level.modifiers, difficulty));
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
  const devices = $derived(timeline.devicesAt(t));
  const endpoints = $derived(routeEndpoints(timeline));

  /** The selected individual, by {@link individualKey}, in one level's wave. */
  interface Selection {
    levelId: string;
    wave: number;
    individual: string;
  }
  let selection = $state<Selection | null>(null);
  const selected = $derived.by(() => {
    const s = selection;
    if (s?.levelId !== level.levelId || s.wave !== waveIndex) return null;
    return timeline.individuals.find((i) => i.id === s.individual) ?? null;
  });
  const selectedState = $derived(selected?.stateAt(t).kind);

  /** A selection on the map: the spawn table, if on screen, scrolls to its row. */
  function select(individual: Individual | null) {
    const changed = individual !== null && individual.id !== selected?.id;
    selection = individual && {
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
      selection?.levelId === level.levelId &&
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

  /** The breakpoint, in px: the styles' first comment lists every place that repeats it. */
  const breakpoint = 1472;
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
      levelId: level.levelId,
      wave: row.waveIndex,
      individual: individualKey({ ...row, spawnIndex: 0 }),
    };
    onJump(row.waveIndex, row.waveTime);
  }
</script>

<div class="level-page">
  <div class="main-column">
    {@render siteTitle()}
    <nav>
      <a href={formatHash({ page: "area", areaId: area.id })}>← {area.code ?? ""} {area.name}</a>
    </nav>
    <h2>{stage.code} {stage.name}</h2>
    {#if variant.emergencyCondition}
      <p class="condition" data-emergency-condition>{variant.emergencyCondition}</p>
    {/if}
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
    <MapView
      map={level.map}
      {terrain}
      {devices}
      {endpoints}
      enemies={drawn}
      {t}
      {selected}
      onSelect={select}
      filter={filtered}
      onFilter={toggleFilter}
      onToggleStow={toggleStow}
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
    {/if}
    {#if level.waves.length > 1}
      <WaveSelect count={level.waves.length} wave={waveIndex} onSelect={onSelectWave} />
    {/if}
    <TimelineBar {t} {end} {stop} {emptyWave} {onSeek} onReachStop={playbackReachedStop} />
    <dl class="counts" aria-live="polite">
      <div>
        <dt>{strings.countPending}</dt>
        <dd data-count="pending">{snapshot.counts.pending}</dd>
      </div>
      <div>
        <dt>{strings.countOnField}</dt>
        <dd data-count="onField">{snapshot.counts.onField}</dd>
      </div>
      <div>
        <dt>{strings.countLeaked}</dt>
        <dd data-count="leaked">{snapshot.counts.leaked}</dd>
      </div>
    </dl>
    <div aria-live="polite">
      {#if stowedCount > 0}
        <p class="stowed" data-stowed-count={stowedCount}>
          <span>{strings.stowedCount(stowedCount)}</span>
          <button type="button" onclick={() => showStowed(waveIndex, stowedHere)}>
            {strings.showAllStowed}
          </button>
        </p>
      {/if}
    </div>
    <SwitchPanel
      {level}
      {plan}
      conditional={switches.conditional ?? {}}
      wave={waveIndex}
      {t}
      onHidden={setHidden}
      onPick={pick}
      onConditional={setConditional}
    />
    <LevelInfo
      options={level.options}
      {modifiers}
      variantName={variantLabel(variant.id)}
      enemies={level.enemies}
    />
  </div>
  <!--
    Wide screens: a column beside the map that stays on screen. Narrow screens: a drawer over the
    page, its button sticking out in the bottom-right corner. Either way .side-column scrolls the
    table.
  -->
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
        branchKeys={level.branches.map((b) => b.key)}
        filter={filtered}
        onClearFilter={() => (endpointFilter = null)}
        {rowStow}
        onStow={stowRows}
      />
    </div>
  </div>
</div>

<style>
  /*
   * Wide screens: the map beside a column holding the spawn table.
   * - The column is --side-column-width, 857px: the widest spawn table of any level, measured in
   *   Chrome with its 標記 wrapping (840px, ISW-NO ro6_b_1_b_dlc1), + 2px border + 15px for the
   *   column's scrollbar. A fixed width keeps the map from resizing as a 端點篩選 or a switch
   *   changes the rows. Below the breakpoint the drawer is as wide, room allowing.
   * - The map keeps at least 540px: an enemy icon (0.68 cell) on a 13-cell-wide map (95% of
   *   levels are no wider) stays at least as large as the spawn table's 28px avatars.
   * - Breakpoint: 540 + 24px gap + 857 + 32px page padding + 17px page scrollbar = 1470px, so
   *   1472px. CSS cannot put a variable in a media query: keep in step `breakpoint` in the script
   *   above and the two `@media` rules below.
   * - Above the breakpoint the page has no width cap: the map takes the width the column leaves.
   */
  /* Below the breakpoint: one column, as wide as the other pages. */
  .level-page {
    --side-column-width: 857px;
    max-width: 960px;
    margin: 0 auto;
  }
  @media (min-width: 1472px) {
    .level-page {
      max-width: none;
      display: grid;
      grid-template-columns: minmax(0, 1fr) var(--side-column-width);
      gap: 24px;
      align-items: start;
      /*
       * Take the page's 32px bottom padding into the row: the sticky column cannot leave its row,
       * so with the padding below the row it slid 32px up off screen at the bottom of the page.
       */
      margin-bottom: -32px;
    }
    .main-column {
      padding-bottom: 32px;
    }
    /*
     * Stays on screen as the page scrolls; the spawn table scrolls inside it. Its row starts at the
     * page's top edge, the site title being in the left column, so the column, as tall as the
     * window, lies wholly inside the window at every page scroll.
     */
    .side {
      position: sticky;
      top: 0;
      height: 100vh;
    }
    .side-column {
      height: 100%;
      overflow-y: auto;
    }
    .drawer-button {
      display: none;
    }
  }
  /*
   * Below the breakpoint: a drawer sliding out from the right over the page, so the map keeps its
   * size. Its button sticks out of its left edge near the bottom: in the window's bottom-right
   * corner while it is closed, where it covers less of the map than halfway up the right edge.
   * The 48px left uncovered keeps the button on screen while the drawer is open.
   */
  @media (width < 1472px) {
    .side {
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
    .side.open {
      transform: none;
      box-shadow: -4px 0 16px rgb(0 0 0 / 0.2);
    }
    /* Hidden once closed, so the table is out of the tab order and the accessibility tree. */
    .side-column {
      box-sizing: border-box;
      height: 100%;
      padding: 0 12px 12px;
      overflow-y: auto;
      visibility: hidden;
      transition: visibility 0s 0.2s;
    }
    .side.open .side-column {
      visibility: visible;
      transition-delay: 0s;
    }
    .drawer-button {
      position: absolute;
      bottom: 16px;
      right: 100%;
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
    .drawer-button[aria-expanded="true"] {
      background: var(--accent);
      border-color: var(--accent);
      color: #fff;
    }
  }
  /* Only the drawer has transitions to drop. */
  @media (prefers-reduced-motion: reduce) {
    .side,
    .side-column {
      transition: none;
    }
  }
  nav a {
    color: var(--accent);
  }
  h2 {
    margin: 8px 0 12px;
    font-size: 1.4rem;
  }
  .condition {
    margin: -6px 0 12px;
    padding-left: 8px;
    border-left: 3px solid var(--accent);
  }
  .selection,
  .stowed {
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
    gap: 8px;
  }
  .stowed {
    color: var(--muted);
  }
  .selection button,
  .stowed button {
    padding: 2px 10px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--panel);
    color: var(--fg);
    font: inherit;
    cursor: pointer;
  }
  .variants {
    margin-bottom: 12px;
  }
  .counts {
    display: flex;
    gap: 8px;
    margin: 12px 0 0;
  }
  .counts div {
    flex: 1;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    min-width: 0;
    padding: 8px 12px;
  }
  dt {
    color: var(--muted);
    font-size: 0.85rem;
  }
  dd {
    margin: 0;
    font-size: 1.5rem;
    font-variant-numeric: tabular-nums;
  }
</style>

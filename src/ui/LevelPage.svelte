<script lang="ts">
  import {
    variantModifiers,
    type Area,
    type Level,
    type StageEntry,
    type TerrainInfo,
    type Variant,
    type VariantId,
  } from "../level/index.ts";
  import LevelInfo from "./LevelInfo.svelte";
  import {
    buildTimeline,
    endpointKey,
    individualKey,
    routeEndpoints,
    spawnPlan,
    spawnTable,
    switchConditional,
    switchHidden,
    switchPick,
    takeSnapshot,
    timelineEnd,
    type ConditionalTrigger,
    type Individual,
    type RouteEndpoint,
    type SpawnRow,
    type SpawnSwitches,
  } from "../timeline/index.ts";
  import SwitchPanel from "./SwitchPanel.svelte";
  import MapView from "./MapView.svelte";
  import { afterStop, playbackStop } from "./playback.ts";
  import { formatHash } from "./route.ts";
  import SpawnTable from "./SpawnTable.svelte";
  import TimelineBar from "./TimelineBar.svelte";
  import WaveSelect from "./WaveSelect.svelte";
  import { strings, variantLabel } from "./strings.ts";

  interface Props {
    area: Area;
    stage: StageEntry;
    variant: Variant;
    level: Level;
    /** The 名稱表's 地形表. */
    terrain: Record<string, TerrainInfo>;
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
    area,
    stage,
    variant,
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
  const end = $derived(Math.ceil(timelineEnd(timeline)));
  const stop = $derived(playbackStop(timeline));
  const snapshot = $derived(takeSnapshot(timeline, t));
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

  function select(individual: Individual | null) {
    selection = individual && {
      levelId: level.levelId,
      wave: waveIndex,
      individual: individual.id,
    };
  }

  /** The 端點篩選, by {@link endpointKey}, in one variant's wave. */
  interface EndpointFilter {
    levelId: string;
    variant: VariantId;
    wave: number;
    endpoint: string;
  }
  let endpointFilter = $state<EndpointFilter | null>(null);
  const filtered = $derived.by(() => {
    const f = endpointFilter;
    if (f?.levelId !== level.levelId || f.variant !== variant.id || f.wave !== waveIndex) {
      return null;
    }
    return endpoints.find((e) => endpointKey(e) === f.endpoint) ?? null;
  });
  // Another wave, variant or level, or switches that remove the dot, clear the filter for good:
  // coming back to that wave or dot does not bring it back.
  $effect(() => {
    if (endpointFilter && !filtered) endpointFilter = null;
  });

  /** A dot filters the spawn table to it; the dot of the filter on screen clears it. */
  function toggleFilter(endpoint: RouteEndpoint) {
    const key = endpointKey(endpoint);
    endpointFilter =
      filtered && endpointKey(filtered) === key
        ? null
        : { levelId: level.levelId, variant: variant.id, wave: waveIndex, endpoint: key };
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

<nav>
  <a href={formatHash({ page: "area", areaId: area.id })}>← {area.code ?? ""} {area.name}</a>
</nav>
<h2>{stage.code} {stage.name}</h2>
{#if stage.emergencyCondition}
  <p class="condition" data-emergency-condition>{stage.emergencyCondition}</p>
{/if}
{#if stage.variants.length > 1}
  <div class="variants" role="group" aria-label={strings.variantPicker}>
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
  {endpoints}
  enemies={snapshot.onField}
  {t}
  {selected}
  onSelect={select}
  filter={filtered}
  onFilter={toggleFilter}
/>
{#if selected && selectedState}
  <p class="selection" data-selected={selected.id}>
    <span>{strings.selected(selected.enemy.name, strings.stateLabel[selectedState])}</span>
    <button type="button" onclick={() => select(null)}>{strings.deselect}</button>
  </p>
{/if}
{#if level.waves.length > 1}
  <WaveSelect count={level.waves.length} wave={waveIndex} onSelect={onSelectWave} />
{/if}
<TimelineBar {t} {end} {stop} {onSeek} onReachStop={playbackReachedStop} />
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
/>
<LevelInfo
  options={level.options}
  {modifiers}
  variantName={variantLabel(variant.id)}
  enemies={level.enemies}
/>

<style>
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
  .selection {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: 8px 0 0;
    font-size: 0.9rem;
  }
  .selection button {
    padding: 2px 10px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--panel);
    color: var(--fg);
    font: inherit;
    cursor: pointer;
  }
  .variants {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 12px;
  }
  .variants button {
    padding: 4px 14px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--panel);
    color: var(--fg);
    cursor: pointer;
  }
  .variants button[aria-pressed="true"] {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
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

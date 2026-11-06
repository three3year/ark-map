<script lang="ts">
  import type { Level, StageEntry } from "../level/index.ts";
  import {
    buildTimeline,
    spawnTable,
    takeSnapshot,
    timelineEnd,
    type Individual,
    type SpawnRow,
  } from "../timeline/index.ts";
  import MapView from "./MapView.svelte";
  import { playbackStop } from "./playback.ts";
  import SpawnTable from "./SpawnTable.svelte";
  import TimelineBar from "./TimelineBar.svelte";
  import WaveSelect from "./WaveSelect.svelte";
  import { strings } from "./strings.ts";

  interface Props {
    stage: StageEntry;
    level: Level;
    /** 0-based wave index from the URL; out-of-range indices show the first wave. */
    wave: number;
    t: number;
    onSeek: (t: number) => void;
    onSelectWave: (wave: number) => void;
    /** Go to `t` of `wave` in one URL change. */
    onJump: (wave: number, t: number) => void;
  }
  let { stage, level, wave, t, onSeek, onSelectWave, onJump }: Props = $props();

  const waveIndex = $derived(wave < level.waves.length ? wave : 0);
  const timeline = $derived(buildTimeline(level, { waveIndex }));
  const rows = $derived(spawnTable(level));
  const end = $derived(Math.ceil(timelineEnd(timeline)));
  const stop = $derived(playbackStop(timeline));
  const snapshot = $derived(takeSnapshot(timeline, t));

  /** The selected individual: the k-th of one spawn action, in one level's wave. */
  interface Selection {
    levelId: string;
    wave: number;
    fragmentIndex: number;
    actionIndex: number;
    spawnIndex: number;
  }
  let selection = $state<Selection | null>(null);
  const selected = $derived.by(() => {
    const s = selection;
    if (s?.levelId !== level.levelId || s.wave !== waveIndex) return null;
    return (
      timeline.individuals.find(
        (i) =>
          i.fragmentIndex === s.fragmentIndex &&
          i.actionIndex === s.actionIndex &&
          i.spawnIndex === s.spawnIndex,
      ) ?? null
    );
  });
  const selectedState = $derived(selected?.stateAt(t).kind);

  function select(individual: Individual | null) {
    selection = individual && {
      levelId: level.levelId,
      wave: waveIndex,
      fragmentIndex: individual.fragmentIndex,
      actionIndex: individual.actionIndex,
      spawnIndex: individual.spawnIndex,
    };
  }

  /** A spawn-table row: jump to its first individual's spawn and select it. */
  function jumpTo(row: SpawnRow) {
    selection = {
      levelId: level.levelId,
      wave: row.waveIndex,
      fragmentIndex: row.fragmentIndex,
      actionIndex: row.actionIndex,
      spawnIndex: 0,
    };
    onJump(row.waveIndex, row.waveTime);
  }
</script>

<h2>{stage.code} {stage.name}</h2>
<MapView
  map={level.map}
  routes={level.routes}
  enemies={snapshot.onField}
  {selected}
  onSelect={select}
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
<TimelineBar {t} {end} {stop} {onSeek} />
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
<SpawnTable {rows} wave={waveIndex} multiWave={level.waves.length > 1} {selected} onJump={jumpTo} />

<style>
  h2 {
    margin: 0 0 12px;
    font-size: 1.4rem;
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

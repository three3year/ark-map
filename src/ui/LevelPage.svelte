<script lang="ts">
  import type { Level, StageEntry } from "../level/index.ts";
  import { buildTimeline, spawnTable, takeSnapshot, timelineEnd } from "../timeline/index.ts";
  import MapView from "./MapView.svelte";
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
  }
  let { stage, level, wave, t, onSeek, onSelectWave }: Props = $props();

  const waveIndex = $derived(wave < level.waves.length ? wave : 0);
  const timeline = $derived(buildTimeline(level, { waveIndex }));
  const rows = $derived(spawnTable(level));
  const end = $derived(Math.ceil(timelineEnd(timeline)));
  const snapshot = $derived(takeSnapshot(timeline, t));
</script>

<h2>{stage.code} {stage.name}</h2>
<MapView map={level.map} routes={level.routes} enemies={snapshot.onField} />
{#if level.waves.length > 1}
  <WaveSelect count={level.waves.length} wave={waveIndex} onSelect={onSelectWave} />
{/if}
<TimelineBar {t} {end} {onSeek} />
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
<SpawnTable {rows} wave={waveIndex} multiWave={level.waves.length > 1} />

<style>
  h2 {
    margin: 0 0 12px;
    font-size: 1.4rem;
  }
  .counts {
    display: flex;
    gap: 12px;
    margin: 12px 0 0;
  }
  .counts div {
    flex: 1;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
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

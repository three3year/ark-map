<script lang="ts">
  import type { Level, StageEntry } from "../level/index.ts";
  import { buildTimeline, takeSnapshot, timelineEnd } from "../timeline/index.ts";
  import MapView from "./MapView.svelte";
  import { playbackStop } from "./playback.ts";
  import TimelineBar from "./TimelineBar.svelte";
  import { strings } from "./strings.ts";

  interface Props {
    stage: StageEntry;
    level: Level;
    t: number;
    onSeek: (t: number) => void;
  }
  let { stage, level, t, onSeek }: Props = $props();

  const timeline = $derived(buildTimeline(level));
  const end = $derived(Math.ceil(timelineEnd(timeline)));
  const stop = $derived(playbackStop(timeline));
  const snapshot = $derived(takeSnapshot(timeline, t));
</script>

<h2>{stage.code} {stage.name}</h2>
<MapView map={level.map} routes={level.routes} enemies={snapshot.onField} />
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

<style>
  h2 {
    margin: 0 0 12px;
    font-size: 1.4rem;
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

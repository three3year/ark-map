<script lang="ts">
  import type { Area, Level, StageEntry, Variant, VariantId } from "../level/index.ts";
  import { buildTimeline, takeSnapshot, timelineEnd } from "../timeline/index.ts";
  import MapView from "./MapView.svelte";
  import { formatHash } from "./route.ts";
  import TimelineBar from "./TimelineBar.svelte";
  import { strings } from "./strings.ts";

  interface Props {
    area: Area;
    stage: StageEntry;
    variant: Variant;
    level: Level;
    t: number;
    onSeek: (t: number) => void;
    onVariant: (variant: VariantId) => void;
  }
  let { area, stage, variant, level, t, onSeek, onVariant }: Props = $props();

  const timeline = $derived(buildTimeline(level));
  const end = $derived(Math.ceil(timelineEnd(timeline)));
  const snapshot = $derived(takeSnapshot(timeline, t));
</script>

<nav>
  <a href={formatHash({ page: "area", areaId: area.id })}>← {area.code ?? ""} {area.name}</a>
</nav>
<h2>{stage.code} {stage.name}</h2>
{#if stage.variants.length > 1}
  <div class="variants" role="group" aria-label={strings.variantPicker}>
    {#each stage.variants as v (v.id)}
      <button
        type="button"
        aria-pressed={v.id === variant.id}
        data-variant={v.id}
        onclick={() => onVariant(v.id)}
      >
        {strings.variants[v.id]}
      </button>
    {/each}
  </div>
{/if}
<MapView map={level.map} routes={level.routes} enemies={snapshot.onField} />
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

<style>
  nav a {
    color: var(--accent);
  }
  h2 {
    margin: 8px 0 12px;
    font-size: 1.4rem;
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

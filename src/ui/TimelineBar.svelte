<script lang="ts">
  import { untrack } from "svelte";
  import { strings } from "./strings.ts";

  interface Props {
    t: number;
    end: number;
    onSeek: (t: number) => void;
  }
  let { t, end, onSeek }: Props = $props();

  let playing = $state(false);

  // Playback advances the URL's seconds against the wall clock.
  $effect(() => {
    if (!playing) return;
    const startT = untrack(() => (t >= end ? 0 : t));
    const startWall = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const next = startT + (now - startWall) / 1000;
      if (next >= end) {
        onSeek(end);
        playing = false;
        return;
      }
      onSeek(next);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  });
</script>

<div class="bar">
  <button type="button" onclick={() => (playing = !playing)}>
    {playing ? strings.pause : strings.play}
  </button>
  <input
    type="range"
    min="0"
    max={end}
    step="0.1"
    value={t}
    aria-label={strings.timeSlider}
    oninput={(e) => {
      playing = false;
      onSeek(Number(e.currentTarget.value));
    }}
  />
  <output>{t.toFixed(1)} {strings.seconds}</output>
</div>

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 12px;
  }
  input {
    flex: 1;
    min-width: 0;
  }
  button {
    min-width: 4.5em;
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--panel);
    color: var(--fg);
    cursor: pointer;
  }
  output {
    min-width: 5.5em;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
</style>

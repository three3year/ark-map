<script lang="ts">
  import { untrack } from "svelte";
  import { advancePlayback, playbackSpeeds, type PlaybackSpeed } from "./playback.ts";
  import { strings } from "./strings.ts";

  interface Props {
    t: number;
    /** Slider end. */
    end: number;
    /** Playback stops here: the wave's last individual has leaked. */
    stop: number;
    onSeek: (t: number) => void;
  }
  let { t, end, stop, onSeek }: Props = $props();

  let playing = $state(false);
  let speed = $state<PlaybackSpeed>(1);

  // Playback advances the page's seconds against the wall clock. A speed change restarts
  // the run from the current second.
  $effect(() => {
    if (!playing) return;
    const currentSpeed = speed;
    const startT = untrack(() => (t >= stop ? 0 : t));
    const startWall = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const next = advancePlayback(startT, (now - startWall) / 1000, currentSpeed, stop);
      onSeek(next.t);
      if (next.done) playing = false;
      else frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  });
</script>

<div class="bar">
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
  <div class="controls">
    <button type="button" class="play" onclick={() => (playing = !playing)}>
      {playing ? strings.pause : strings.play}
    </button>
    <div class="speeds" role="radiogroup" aria-label={strings.playbackSpeed}>
      {#each playbackSpeeds as option (option)}
        <button
          type="button"
          role="radio"
          aria-checked={speed === option}
          onclick={() => (speed = option)}
        >
          {strings.speedLabel(option)}
        </button>
      {/each}
    </div>
    <output>{t.toFixed(1)} {strings.seconds}</output>
  </div>
</div>

<style>
  .bar {
    margin-top: 12px;
  }
  input {
    display: block;
    width: 100%;
    margin: 0;
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }
  button {
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--panel);
    color: var(--fg);
    font: inherit;
    cursor: pointer;
  }
  .play {
    min-width: 4.5em;
  }
  .speeds {
    display: flex;
  }
  .speeds button {
    padding: 6px 10px;
    border-radius: 0;
    margin-left: -1px;
    font-variant-numeric: tabular-nums;
  }
  .speeds button:first-child {
    border-radius: 6px 0 0 6px;
    margin-left: 0;
  }
  .speeds button:last-child {
    border-radius: 0 6px 6px 0;
  }
  .speeds button[aria-checked="true"] {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
    position: relative;
  }
  output {
    margin-left: auto;
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
</style>

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
    emptyWave: boolean;
    onSeek: (t: number) => void;
    /**
     * Playback has reached `stop`. Returns true when the page has moved on to 0 s of another
     * 波次 and playback carries on there; false to stop.
     */
    onReachStop: () => boolean;
  }
  let { t, end, stop, emptyWave, onSeek, onReachStop }: Props = $props();

  let playing = $state(false);
  let speed = $state<PlaybackSpeed>(1);

  // Playback advances the page's seconds against the wall clock. A speed change restarts
  // the run from the current second; moving on to another 波次 restarts it from 0 s.
  $effect(() => {
    if (!playing) return;
    const currentSpeed = speed;
    let startT = untrack(() => (t >= stop ? 0 : t));
    let startWall = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const next = advancePlayback(startT, (now - startWall) / 1000, currentSpeed, stop);
      onSeek(next.t);
      if (next.done && !onReachStop()) {
        playing = false;
        return;
      }
      if (next.done) {
        startT = 0;
        startWall = now;
      }
      frame = requestAnimationFrame(tick);
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
    disabled={emptyWave}
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
    <output>{emptyWave ? strings.emptyWaveNote : `${t.toFixed(1)} ${strings.seconds}`}</output>
  </div>
</div>

<style>
  .bar {
    margin-top: 12px;
  }
  input {
    display: block;
    width: 100%;
    height: 16px;
    margin: 0;
  }
  /* 空波次: no seconds to seek, so the slider becomes a striped band with no thumb. */
  input:disabled {
    appearance: none;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: repeating-linear-gradient(-45deg, var(--muted) 0 6px, transparent 6px 12px);
    cursor: not-allowed;
  }
  input:disabled::-webkit-slider-thumb {
    appearance: none;
    width: 0;
  }
  input:disabled::-moz-range-thumb {
    visibility: hidden;
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

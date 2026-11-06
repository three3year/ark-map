<script lang="ts">
  import { strings } from "./strings.ts";

  interface Props {
    count: number;
    wave: number;
    onSelect: (wave: number) => void;
  }
  let { count, wave, onSelect }: Props = $props();
</script>

<div class="waves" role="radiogroup" aria-label={strings.waveSelect}>
  {#each { length: count }, i (i)}
    <button
      type="button"
      role="radio"
      aria-checked={i === wave}
      class:selected={i === wave}
      onclick={() => onSelect(i)}
    >
      {strings.wave(i)}
    </button>
  {/each}
</div>

<style>
  .waves {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 12px;
  }
  button {
    padding: 4px 12px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--panel);
    color: var(--fg);
    cursor: pointer;
  }
  button.selected {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }
</style>

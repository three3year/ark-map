<script lang="ts">
  import { strings } from "./strings.ts";

  interface Props {
    /** 拓展編號 to offer after 原版, ascending. */
    numbers: number[];
    /** The 內容拓展 on screen, lit; null for 原版. */
    shown: number | null;
    /** A press: the 拓展編號, or null for 原版. */
    onSelect: (expansion: number | null) => void;
  }
  let { numbers, shown, onSelect }: Props = $props();
</script>

<div class="segmented" role="group" aria-label={strings.expansionPicker}>
  {#each [null, ...numbers] as n (n ?? 0)}
    <button
      type="button"
      aria-pressed={n === shown}
      data-expansion={n ?? "original"}
      onclick={() => onSelect(n)}
    >
      {n === null ? strings.original : strings.expansion(n)}
    </button>
  {/each}
</div>

<script lang="ts">
  import { strings } from "./strings.ts";

  interface Props {
    numbers: number[];
    shown: number | null;
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

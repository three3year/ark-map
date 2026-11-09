<script lang="ts">
  import type { ExpansionChoice } from "../level/index.ts";
  import { strings } from "./strings.ts";

  interface Props {
    numbers: number[];
    shown: ExpansionChoice;
    onSelect: (expansion: ExpansionChoice) => void;
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

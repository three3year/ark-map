<script lang="ts">
  // 開關標記 in HTML (spawn table, 開關面板): the look global.css gives every 開關標記, sized to
  // the text around it. The text next to it names the 開關, so screen readers skip the square.
  import type { SwitchMarkKind } from "../timeline/index.ts";

  let { kind, number }: { kind: SwitchMarkKind; number: number } = $props();
</script>

<span
  class="switch-mark"
  data-switch-mark={kind}
  data-switch-mark-number={number}
  aria-hidden="true">{number}</span
>

<style>
  .switch-mark {
    /* The side is 1.45 times the surrounding text; the number takes its share of it. */
    font-size: calc(1.45em * var(--switch-mark-font));
    --side: calc(1em / var(--switch-mark-font));
    display: inline-grid;
    place-items: center;
    flex: none;
    min-width: var(--side);
    height: var(--side);
    padding: 0 0.15em;
    box-sizing: border-box;
    border-radius: calc(var(--side) * var(--switch-mark-corner));
    background: var(--switch-mark-fill);
    color: #fff;
    font-weight: 700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
</style>

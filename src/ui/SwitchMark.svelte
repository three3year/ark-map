<script lang="ts">
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

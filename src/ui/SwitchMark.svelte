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
    --side-in-text-em: 1.45;
    font-size: calc(1em * var(--side-in-text-em) * var(--switch-mark-font-ratio));
    --switch-mark-side: calc(1em / var(--switch-mark-font-ratio));
    display: inline-grid;
    place-items: center;
    flex: none;
    min-width: var(--switch-mark-side);
    height: var(--switch-mark-side);
    padding: 0 0.15em;
    box-sizing: border-box;
    border-radius: calc(var(--switch-mark-side) * var(--switch-mark-corner-ratio));
    background: var(--switch-mark-fill);
    color: #fff;
    font-weight: 700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
</style>

<svelte:options namespace="svg" />

<script lang="ts">
  import type { TerrainIcon } from "./terrain.ts";

  /** Drawn around (0, 0) within a 1 × 1 cell, clear of the corner the endpoint dots use. */
  let { icon }: { icon: TerrainIcon } = $props();
</script>

{#if icon === "start"}
  <g class="start">
    <rect x="-0.3" y="-0.3" width="0.6" height="0.6" rx="0.08" />
    <path d="M -0.13 -0.08 L 0 0.08 L 0.13 -0.08" />
  </g>
{:else if icon === "flystart"}
  <g class="start">
    <rect x="-0.3" y="-0.3" width="0.6" height="0.6" rx="0.08" stroke-dasharray="0.1 0.06" />
    <path d="M -0.16 0.06 L 0 -0.08 L 0.16 0.06 M -0.16 0.16 L 0 0.02 L 0.16 0.16" />
  </g>
{:else if icon === "end"}
  <g class="end">
    <rect x="-0.3" y="-0.3" width="0.6" height="0.6" rx="0.08" />
    <circle r="0.13" />
    <circle class="core" r="0.045" />
  </g>
{:else if icon === "tunnelIn"}
  <g class="tunnel in">
    <circle r="0.27" />
    <path d="M -0.11 -0.06 L 0 0.06 L 0.11 -0.06" />
  </g>
{:else if icon === "tunnelOut"}
  <g class="tunnel out">
    <circle r="0.27" />
    <path d="M -0.11 0.06 L 0 -0.06 L 0.11 0.06" />
  </g>
{/if}

<style>
  g {
    stroke-width: 0.06;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  path {
    fill: none;
  }
  .start {
    stroke: #e5484d;
  }
  .start rect {
    fill: #e5484d33;
  }
  .end {
    stroke: #3e83f8;
  }
  .end rect,
  .end circle {
    fill: #3e83f833;
  }
  .end .core {
    fill: #3e83f8;
  }
  .tunnel {
    stroke: #8e4ec6;
  }
  .tunnel.in circle {
    fill: #2a1a3a;
  }
  .tunnel.out circle {
    fill: #8e4ec640;
  }
  .tunnel.in path {
    stroke: #d9b8f5;
  }
</style>

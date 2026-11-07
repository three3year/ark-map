<svelte:options namespace="svg" />

<script lang="ts">
  import type { TerrainMark } from "./terrain.ts";

  /** Drawn around (0, 0) within a 1 × 1 cell, clear of the corner the endpoint dots use. */
  let { mark }: { mark: TerrainMark } = $props();
</script>

{#if mark.kind === "glyph"}
  <g class="glyph">
    <rect x="-0.25" y="-0.25" width="0.5" height="0.5" rx="0.1" />
    <text>{mark.glyph}</text>
  </g>
{:else if mark.icon === "start"}
  <g class="start">
    <rect x="-0.3" y="-0.3" width="0.6" height="0.6" rx="0.08" />
    <path d="M -0.13 -0.08 L 0 0.08 L 0.13 -0.08" />
  </g>
{:else if mark.icon === "flystart"}
  <g class="start">
    <rect x="-0.3" y="-0.3" width="0.6" height="0.6" rx="0.08" stroke-dasharray="0.1 0.06" />
    <path d="M -0.16 0.06 L 0 -0.08 L 0.16 0.06 M -0.16 0.16 L 0 0.02 L 0.16 0.16" />
  </g>
{:else if mark.icon === "end"}
  <g class="end">
    <rect x="-0.3" y="-0.3" width="0.6" height="0.6" rx="0.08" />
    <circle r="0.13" />
    <circle class="core" r="0.045" />
  </g>
{:else if mark.icon === "tunnelIn"}
  <g class="tunnel in">
    <circle r="0.27" />
    <path d="M -0.11 -0.06 L 0 0.06 L 0.11 -0.06" />
  </g>
{:else if mark.icon === "tunnelOut"}
  <g class="tunnel out">
    <circle r="0.27" />
    <path d="M -0.11 0.06 L 0 -0.06 L 0.11 0.06" />
  </g>
{:else if mark.icon === "hole"}
  <!-- A dark pit whose far wall catches a little light. -->
  <g class="hole">
    <rect x="-0.4" y="-0.4" width="0.8" height="0.8" rx="0.12" />
    <path class="wall" d="M -0.3 -0.26 Q 0 -0.36 0.3 -0.26" />
  </g>
{:else if mark.icon === "fence"}
  <g class="fence">
    <path d="M -0.2 -0.28 V 0.28 M 0.2 -0.28 V 0.28 M -0.32 -0.1 H 0.32 M -0.32 0.12 H 0.32" />
  </g>
{:else if mark.icon === "fenceBound"}
  <g class="wall-bricks">
    <rect x="-0.32" y="-0.24" width="0.64" height="0.48" rx="0.04" />
    <path d="M -0.32 0 H 0.32 M -0.08 -0.24 V 0 M 0.1 0 V 0.24 M -0.22 0 V 0.24" />
  </g>
{:else if mark.icon === "deepWater"}
  <g class="water">
    <rect x="-0.34" y="-0.3" width="0.68" height="0.6" rx="0.1" />
    <path
      d="M -0.24 -0.08 Q -0.12 -0.18 0 -0.08 T 0.24 -0.08 M -0.24 0.12 Q -0.12 0.02 0 0.12 T 0.24 0.12"
    />
  </g>
{:else if mark.icon === "grass"}
  <g class="grass">
    <path
      d="M -0.2 0.24 Q -0.24 0 -0.3 -0.12 M -0.08 0.24 Q -0.1 -0.02 -0.04 -0.26 M 0.06 0.24 Q 0.08 0 0.16 -0.2 M 0.18 0.24 Q 0.24 0.06 0.3 0"
    />
  </g>
{:else if mark.icon === "infection"}
  <g class="infection">
    <path d="M 0 -0.3 L 0.17 -0.04 L 0.09 0.26 L -0.11 0.26 L -0.18 -0.02 Z" />
    <path class="facet" d="M 0 -0.3 L -0.02 0.26" />
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
  .glyph rect {
    fill: #1d1d1fbf;
    stroke: #f5f5f7;
    stroke-width: 0.03;
  }
  .glyph text {
    font-size: 0.34px;
    font-weight: 700;
    text-anchor: middle;
    dominant-baseline: central;
    fill: #f5f5f7;
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
  .hole rect {
    fill: #121316;
    stroke: #000;
    stroke-width: 0.04;
  }
  .hole .wall {
    stroke: #4a4c53;
    stroke-width: 0.08;
  }
  .fence {
    stroke: #8b5a2b;
    stroke-width: 0.07;
  }
  .wall-bricks {
    stroke: #6e3f22;
    stroke-width: 0.04;
  }
  .wall-bricks rect {
    fill: #b5734a;
  }
  .water {
    stroke: #bfe1ff;
    stroke-width: 0.05;
  }
  .water rect {
    fill: #1f5fae;
    stroke: none;
  }
  .grass {
    stroke: #2e9e5b;
    stroke-width: 0.07;
  }
  .infection {
    stroke: #ff7a1a;
    stroke-width: 0.04;
  }
  .infection path:first-child {
    fill: #2b2b2f;
  }
  .infection .facet {
    stroke-width: 0.03;
  }
</style>

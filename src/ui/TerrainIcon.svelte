<svelte:options namespace="svg" />

<script lang="ts">
  import type { TerrainMark } from "./terrain.ts";

  /** Drawn around (0, 0) within a 1 × 1 cell; the 侵入點/保護目標 frames and 深水區 fill the cell, the rest stay clear of the corner the endpoint dots use. */
  let { mark }: { mark: TerrainMark } = $props();
</script>

{#if mark.kind === "glyph"}
  <g class="glyph">
    <rect x="-0.25" y="-0.25" width="0.5" height="0.5" rx="0.1" />
    <text>{mark.glyph}</text>
  </g>
{:else if mark.icon === "incursion"}
  <g class="incursion">
    <rect x="-0.47" y="-0.47" width="0.94" height="0.94" rx="0.08" />
    <path d="M -0.13 -0.08 L 0 0.08 L 0.13 -0.08" />
  </g>
{:else if mark.icon === "airIncursion"}
  <g class="incursion">
    <rect x="-0.47" y="-0.47" width="0.94" height="0.94" rx="0.08" stroke-dasharray="0.1 0.06" />
    <path d="M -0.16 0.06 L 0 -0.08 L 0.16 0.06 M -0.16 0.16 L 0 0.02 L 0.16 0.16" />
  </g>
{:else if mark.icon === "protectTarget"}
  <g class="protect-target">
    <rect x="-0.47" y="-0.47" width="0.94" height="0.94" rx="0.08" />
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
  <!-- A brown ring flush with the cell edge. -->
  <rect class="fence" x="-0.47" y="-0.47" width="0.94" height="0.94" />
{:else if mark.icon === "fenceBound"}
  <!-- The 圍欄 ring, thicker and darker. -->
  <rect class="fence bound" x="-0.44" y="-0.44" width="0.88" height="0.88" />
{:else if mark.icon === "deepWater"}
  <g class="water">
    <rect x="-0.475" y="-0.475" width="0.95" height="0.95" rx="0.1" />
    <path
      d="M -0.33 -0.12 Q -0.165 -0.26 0 -0.12 T 0.33 -0.12 M -0.33 0.16 Q -0.165 0.02 0 0.16 T 0.33 0.16"
    />
  </g>
{:else if mark.icon === "grass"}
  <!-- Blades rise from the cell's bottom edge. -->
  <g class="grass">
    <path
      d="M -0.2 0.46 Q -0.24 0.22 -0.3 0.1 M -0.08 0.46 Q -0.1 0.2 -0.04 -0.04 M 0.06 0.46 Q 0.08 0.22 0.16 0.02 M 0.18 0.46 Q 0.24 0.28 0.3 0.22"
    />
  </g>
{:else if mark.icon === "infection"}
  <!-- A red band dripping three spikes, the middle one longest. -->
  <path
    class="infection"
    d="M -0.28 -0.26 L 0.28 -0.26 L 0.28 -0.14 Q 0.22 -0.08 0.19 0.12 Q 0.16 -0.06 0.1 -0.1 Q 0.04 -0.02 0 0.26 Q -0.04 -0.02 -0.1 -0.1 Q -0.16 -0.06 -0.19 0.08 Q -0.22 -0.08 -0.28 -0.14 Z"
  />
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
  .incursion {
    stroke: var(--spawn-red);
  }
  .incursion rect {
    fill: color-mix(in srgb, var(--spawn-red) 20%, transparent);
  }
  .protect-target {
    stroke: var(--exit-blue);
  }
  .protect-target rect,
  .protect-target circle {
    fill: color-mix(in srgb, var(--exit-blue) 20%, transparent);
  }
  .protect-target .core {
    fill: var(--exit-blue);
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
    fill: none;
    stroke: #8b5a2b;
    stroke-width: 0.06;
  }
  .fence.bound {
    stroke: #5a3518;
    stroke-width: 0.12;
  }
  .water {
    stroke: #bfe1ff;
    stroke-width: 0.07;
  }
  .water rect {
    fill: #1f5fae;
    stroke: none;
  }
  .grass {
    stroke: #2e9e5b;
    stroke-width: 0.07;
  }
  path.infection {
    fill: #ff1f2d;
  }
</style>

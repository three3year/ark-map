<script lang="ts">
  import {
    themeExpansions,
    type Area,
    type ExpansionChoice,
    type StageEntry,
  } from "../level/index.ts";
  import type { Snippet } from "svelte";
  import { formatHash } from "./route.ts";
  import { variantLabel } from "./strings.ts";

  interface Props {
    area: Area;
    stage: StageEntry;
    /** The site's 內容拓展 choice; the link carries it only into a theme with 內容拓展. */
    expansion: ExpansionChoice;
    /** Drawn before the stage's code. */
    lead?: Snippet;
  }
  let { area, stage, expansion, lead }: Props = $props();
</script>

<!-- A link to the stage's base variant, as the stage list and the search hits show it. -->
<a
  href={formatHash({
    page: "level",
    stageId: stage.id,
    variant: stage.variants[0]!.id,
    expansion: themeExpansions(area).length > 0 ? expansion : null,
  })}
  data-stage={stage.id}
>
  {@render lead?.()}
  <span class="code">{stage.code}</span>
  <span class="name">{stage.name}</span>
  {#if stage.variants.length > 1}
    <span class="variants">
      {stage.variants
        .slice(1)
        .map((v) => variantLabel(v.id))
        .join("・")}
    </span>
  {/if}
</a>

<style>
  a {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    align-items: baseline;
    padding: 8px 4px;
    border-bottom: 1px solid var(--border);
    color: var(--fg);
    text-decoration: none;
  }
  a:hover {
    background: var(--panel);
  }
  .code {
    min-width: 5.5em;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .name {
    flex: 1;
  }
  .variants {
    color: var(--muted);
    font-size: 0.8rem;
    white-space: nowrap;
  }
</style>

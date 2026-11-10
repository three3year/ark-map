<script lang="ts">
  import type { Area, ExpansionChoice, Section } from "../level/index.ts";
  import { formatHash } from "./route.ts";
  import StageItem from "./StageItem.svelte";
  import { strings } from "./strings.ts";

  interface Props {
    area: Area;
    /** The site's 內容拓展 choice. */
    expansion: ExpansionChoice;
  }
  let { area, expansion }: Props = $props();

  /** Unnamed sections only get a heading when the area has others to tell them from. */
  function heading(section: Section): string | null {
    return section.name ?? (area.sections.length > 1 ? strings.otherStages : null);
  }
</script>

<nav><a href={formatHash({ page: "home" })}>← {strings.backToAreas}</a></nav>
<h2>
  {#if area.code}<span class="code">{area.code}</span>{/if}
  {area.name}
</h2>
{#each area.sections as section, i (i)}
  {#if heading(section)}<h3>{heading(section)}</h3>{/if}
  <ul>
    {#each section.stages as stage (stage.id)}
      <li><StageItem {area} {stage} {expansion} /></li>
    {/each}
  </ul>
{/each}

<style>
  nav {
    margin-bottom: 8px;
  }
  nav a {
    color: var(--accent);
  }
  h2 {
    font-size: 1.4rem;
    margin: 0 0 12px;
  }
  h2 .code {
    min-width: 5.5em;
    color: var(--muted);
    margin-right: 6px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  h3 {
    font-size: 1rem;
    margin: 16px 0 6px;
    color: var(--muted);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
</style>

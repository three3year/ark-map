<script lang="ts">
  import type { Area, Section } from "../level/index.ts";
  import { formatHash } from "./route.ts";
  import { strings, variantLabel } from "./strings.ts";

  interface Props {
    area: Area;
    expansion: number | null;
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
      <li>
        <a
          href={formatHash({
            page: "level",
            stageId: stage.id,
            variant: stage.variants[0]!.id,
            expansion,
          })}
          data-stage={stage.id}
        >
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
      </li>
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
    color: var(--muted);
    margin-right: 6px;
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
  a {
    display: flex;
    gap: 12px;
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

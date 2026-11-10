<script lang="ts">
  import { themeExpansions, type ExpansionChoice, type StageIndex } from "../level/index.ts";
  import AreaList from "./AreaList.svelte";
  import { formatHash } from "./route.ts";
  import { searchStages } from "./stageSearch.ts";
  import { strings, variantLabel } from "./strings.ts";

  interface Props {
    index: StageIndex;
    /** The site's 內容拓展 choice, carried by hits in a theme with 內容拓展. */
    expansion: ExpansionChoice;
    /** The keyword; the caller keeps it so it outlives a visit to a stage. */
    query: string;
  }
  let { index, expansion, query = $bindable() }: Props = $props();

  const hits = $derived(searchStages(index, query));
</script>

<input
  type="search"
  bind:value={query}
  aria-label={strings.stageSearch}
  placeholder={strings.stageSearchPlaceholder}
/>

{#if !hits}
  <AreaList {index} />
{:else if hits.length === 0}
  <p>{strings.noSearchHits}</p>
{:else}
  <ul>
    {#each hits as { area, stage } (stage.id)}
      <li>
        <a
          href={formatHash({
            page: "level",
            stageId: stage.id,
            variant: stage.variants[0]!.id,
            expansion: themeExpansions(area).length > 0 ? expansion : null,
          })}
          data-stage={stage.id}
        >
          <span class="area">
            {#if area.code}{area.code}{/if}
            {area.name}
          </span>
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
{/if}

<style>
  input {
    box-sizing: border-box;
    width: 100%;
    margin: 8px 0 4px;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--panel);
    color: var(--fg);
    font: inherit;
  }
  input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -1px;
  }
  p {
    color: var(--muted);
  }
  ul {
    list-style: none;
    margin: 12px 0 0;
    padding: 0;
  }
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
  .area {
    min-width: 10em;
    color: var(--muted);
    font-size: 0.85rem;
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

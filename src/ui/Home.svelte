<script lang="ts">
  import type { ExpansionChoice, StageIndex } from "../level/index.ts";
  import AreaList from "./AreaList.svelte";
  import StageItem from "./StageItem.svelte";
  import { searchStages } from "./stageSearch.ts";
  import { strings } from "./strings.ts";

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
        <StageItem {area} {stage} {expansion}>
          {#snippet lead()}
            <span class="area">
              {#if area.code}{area.code}{/if}
              {area.name}
            </span>
          {/snippet}
        </StageItem>
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
  .area {
    min-width: 10em;
    color: var(--muted);
    font-size: 0.85rem;
  }
</style>

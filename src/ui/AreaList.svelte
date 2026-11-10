<script lang="ts">
  import type { StageIndex } from "../level/index.ts";
  import { formatHash } from "./route.ts";
  import { homeGroups } from "./stageSearch.ts";
  import { strings } from "./strings.ts";

  interface Props {
    index: StageIndex;
  }
  let { index }: Props = $props();

  const groups = $derived(homeGroups(index));
</script>

{#each groups as [kind, areas] (kind)}
  <section>
    <h2>{strings.areaKinds[kind]}</h2>
    <ul>
      {#each areas as area (area.id)}
        <li>
          <a href={formatHash({ page: "area", areaId: area.id })} data-area={area.id}>
            {#if area.code}<span class="code">{area.code}</span>{/if}
            <span>{area.name}</span>
          </a>
        </li>
      {/each}
    </ul>
  </section>
{/each}

<style>
  h2 {
    font-size: 1.1rem;
    margin: 20px 0 8px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 6px;
  }
  a {
    display: flex;
    gap: 8px;
    align-items: baseline;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--panel);
    color: var(--fg);
    text-decoration: none;
  }
  a:hover {
    border-color: var(--accent);
  }
  .code {
    color: var(--muted);
    font-size: 0.85rem;
    white-space: nowrap;
  }
</style>

<script lang="ts">
  import type { Level, Modifier, NameTable } from "../level/index.ts";
  import type { SpawnPlan } from "../timeline/index.ts";
  import { levelNumbers, modifierLines } from "./panelContent.ts";
  import { strings } from "./strings.ts";
  import SwitchMark from "./SwitchMark.svelte";

  interface Props {
    level: Level;
    /** The 難度修正 the shown variant applies. */
    modifiers: Modifier[];
    names: NameTable;
    /** The shown variant's spawn plan, which numbers the 隱藏組 marks. */
    plan: SpawnPlan;
    /** Variant name, e.g. "突襲". */
    variantName: string;
  }
  let { level, modifiers, names, plan, variantName }: Props = $props();

  const lines = $derived(modifierLines(level, modifiers, { names, plan }));
</script>

<section class="level-info">
  <h3>{strings.levelInfo}</h3>
  <p class="numbers">{levelNumbers(level.options)}</p>
  <h3>{strings.modifiers(variantName)}</h3>
  {#if lines.length === 0}
    <p class="none">{strings.noModifiers}</p>
  {:else}
    <ul class="modifiers">
      {#each lines as line, i (i)}
        <li data-modifier={line.key}>
          <strong title={line.hint}>{line.name}</strong>
          {#each line.hiddenGroups as { name, number } (name)}
            <span class="mark" title={name}><SwitchMark kind="hiddenGroup" {number} /></span>
          {/each}
          {#if "value" in line}
            {line.value}
          {:else if line.params.length > 0}
            —
            {#each line.params as { label, value, hint }, j (j)}
              {#if j > 0}、{/if}<span class="param" title={hint ?? undefined}
                ><span class="key">{label}</span> {value}</span
              >
            {/each}
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  section {
    margin-top: 20px;
  }
  h3 {
    margin: 16px 0 8px;
    font-size: 1.1rem;
  }
  h3:first-child {
    margin-top: 0;
  }
  .numbers {
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
  .none {
    color: var(--muted);
    margin: 0;
  }
  .modifiers {
    list-style: disc;
    margin: 0;
    padding-left: 1.5em;
    display: grid;
    gap: 4px;
    overflow-wrap: anywhere;
  }
  .key {
    color: var(--muted);
  }
  .mark {
    display: inline-flex;
    vertical-align: middle;
  }
</style>

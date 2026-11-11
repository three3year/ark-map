<script lang="ts">
  import {
    affectsMovement,
    type EnemyRef,
    type LevelOptions,
    type Modifier,
  } from "../level/index.ts";
  import { modifierText } from "./panelContent.ts";
  import { strings } from "./strings.ts";

  interface Props {
    options: LevelOptions;
    /** The 難度修正 the shown variant applies. */
    modifiers: Modifier[];
    /** Variant name, e.g. "突襲". */
    variantName: string;
    enemies: Record<string, EnemyRef>;
  }
  let { options, modifiers, variantName, enemies }: Props = $props();

  const stats = $derived([
    [strings.characterLimit, options.characterLimit],
    [strings.maxLifePoint, options.maxLifePoint],
    [strings.initialCost, options.initialCost],
    [strings.maxCost, options.maxCost],
  ] as const);
</script>

<section class="level-info">
  <h3>{strings.levelInfo}</h3>
  <dl class="stats">
    {#each stats as [label, value] (label)}
      <div>
        <dt>{label}</dt>
        <dd>{value}</dd>
      </div>
    {/each}
  </dl>
  <h3>{strings.modifiers(variantName)}</h3>
  {#if modifiers.length === 0}
    <p class="none">{strings.noModifiers}</p>
  {:else}
    <ul class="modifiers">
      {#each modifiers as modifier, i (i)}
        {@const text = modifierText(modifier, enemies)}
        <li data-modifier={modifier.key}>
          <div class="head">
            <strong>{text.name}</strong>
            <code>{modifier.key}</code>
            {#if affectsMovement(modifier)}
              <span class="moves" title={strings.modifierMovesEnemiesHint}>
                {strings.modifierMovesEnemies}
              </span>
            {/if}
          </div>
          {#if text.params.length > 0}
            <ul class="blackboard">
              {#each text.params as { label, value }, j (j)}
                <li>
                  <span class="key">{label}</span>
                  {value}
                </li>
              {/each}
            </ul>
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
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 8px;
    margin: 0;
  }
  .stats div {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 12px;
  }
  dt {
    color: var(--muted);
    font-size: 0.85rem;
  }
  dd {
    margin: 0;
    font-size: 1.3rem;
    font-variant-numeric: tabular-nums;
  }
  .none {
    color: var(--muted);
    margin: 0;
  }
  .modifiers {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  .modifiers > li {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 12px;
    min-width: 0;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
  }
  code {
    color: var(--muted);
    font-size: 0.8rem;
    overflow-wrap: anywhere;
  }
  .moves {
    padding: 0 8px;
    border-radius: 999px;
    background: var(--accent);
    color: #fff;
    font-size: 0.8rem;
  }
  .blackboard {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    margin: 4px 0 0;
    padding: 0;
    list-style: none;
    font-size: 0.9rem;
    overflow-wrap: anywhere;
  }
  .key {
    color: var(--muted);
    margin-right: 4px;
  }
</style>

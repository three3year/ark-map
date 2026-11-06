<script lang="ts">
  import type { Level } from "../level/index.ts";
  import type { RandomCandidate, SpawnPlan } from "../timeline/index.ts";
  import { strings } from "./strings.ts";

  interface Props {
    level: Level;
    /** The current 開關狀態, resolved against the variant's defaults. */
    plan: SpawnPlan;
    onHidden: (name: string, on: boolean) => void;
    onPick: (group: number, candidate: number) => void;
  }
  let { level, plan, onHidden, onPick }: Props = $props();

  const multiWave = $derived(level.waves.length > 1);

  /** What a candidate puts on the field: enemies × count, devices, or nothing. */
  function candidateLabel(candidate: RandomCandidate): string {
    const parts = candidate.actions.flatMap(({ waveIndex, fragmentIndex, actionIndex }) => {
      const action = level.waves[waveIndex]!.fragments[fragmentIndex]!.actions[actionIndex]!;
      if (action.actionType !== "SPAWN") return action.key ? [strings.device(action.key)] : [];
      if (!action.key) return [];
      return [`${level.enemies[action.key]?.name ?? action.key} × ${action.count}`];
    });
    return parts.length > 0 ? parts.join("、") : strings.noSpawn;
  }
</script>

{#if plan.groups.hidden.length > 0 || plan.groups.random.length > 0}
  <section class="switches" aria-label={strings.switches}>
    <h3>{strings.switches}</h3>
    {#if plan.groups.hidden.length > 0}
      <fieldset>
        <legend title={strings.hiddenGroupsHint}>{strings.hiddenGroups}</legend>
        {#each plan.groups.hidden as group (group.name)}
          <label>
            <input
              type="checkbox"
              data-hidden-group={group.name}
              checked={plan.hiddenOn.has(group.name)}
              onchange={(e) => onHidden(group.name, e.currentTarget.checked)}
            />
            {group.name}
            <span class="muted">{group.defaultOn ? strings.defaultOn : strings.defaultOff}</span>
          </label>
        {/each}
      </fieldset>
    {/if}
    {#if plan.groups.random.length > 0}
      <fieldset>
        <legend title={strings.randomGroupsHint}>{strings.randomGroups}</legend>
        {#each plan.groups.random as group, i (i)}
          {@const total = group.candidates.reduce((s, c) => s + c.weight, 0)}
          <label class="random">
            <span>
              {strings.randomGroup(i)}
              <span class="muted">
                {strings.randomGroupWhere(
                  multiWave ? strings.wave(group.waveIndex) : null,
                  group.fragmentIndex,
                  group.key,
                )}
              </span>
            </span>
            <select
              data-random-group={i}
              value={plan.picks[i]}
              onchange={(e) => onPick(i, Number(e.currentTarget.value))}
            >
              {#each group.candidates as candidate, c (c)}
                <option value={c}>
                  {candidateLabel(candidate)} ・ {strings.candidateWeight(
                    candidate.weight,
                    total > 0 ? candidate.weight / total : 0,
                  )}
                </option>
              {/each}
            </select>
          </label>
        {/each}
      </fieldset>
    {/if}
  </section>
{/if}

<style>
  section {
    margin-top: 16px;
  }
  h3 {
    margin: 0 0 8px;
    font-size: 1.1rem;
  }
  fieldset {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 16px;
    margin: 0 0 8px;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--panel);
  }
  legend {
    padding: 0 4px;
    color: var(--muted);
  }
  label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .random {
    flex-wrap: wrap;
    width: 100%;
  }
  select {
    max-width: 100%;
    font: inherit;
  }
  .muted {
    color: var(--muted);
    font-size: 0.85rem;
  }
</style>

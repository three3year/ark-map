<script lang="ts">
  import { isSpawn, type Action, type Branch, type Level } from "../level/index.ts";
  import {
    actionAt,
    type ConditionalTrigger,
    type RandomCandidate,
    type RandomGroup,
    type SpawnPlan,
  } from "../timeline/index.ts";
  import { roundTenth } from "./playback.ts";
  import { strings } from "./strings.ts";

  interface Props {
    level: Level;
    /** The current 開關狀態, resolved against the variant's defaults. */
    plan: SpawnPlan;
    /** 條件出兵 switched on, by branch index. */
    conditional: Readonly<Record<number, ConditionalTrigger>>;
    /** The wave and second on screen: a 條件出兵 switched on here is triggered there. */
    wave: number;
    t: number;
    onHidden: (name: string, on: boolean) => void;
    onPick: (group: number, candidate: number) => void;
    /** Switch 條件出兵 `branch` on at `trigger`, or off with null. */
    onConditional: (branch: number, trigger: ConditionalTrigger | null) => void;
  }
  let { level, plan, conditional, wave, t, onHidden, onPick, onConditional }: Props = $props();

  const multiWave = $derived(level.waves.length > 1);
  const branches = $derived(level.branches.map((branch, index) => ({ branch, index })));
  const spawning = $derived(branches.filter(({ branch }) => !branch.deviceOnly));
  const deviceOnly = $derived(branches.filter(({ branch }) => branch.deviceOnly));

  /**
   * What actions put on the field: enemies × count, devices, or nothing. Repeated entries show
   * once, so a branch activating ten ballistae (`trap_007_ballis#1` … `#10`) stays short.
   */
  function actionsLabel(actions: Action[]): string {
    const parts = actions.flatMap((action) => {
      if (!isSpawn(action)) {
        return action.key ? [strings.device(action.key.replace(/#\d+$/, ""))] : [];
      }
      if (!action.key) return [];
      return [`${level.enemies[action.key]?.name ?? action.key} × ${action.count}`];
    });
    return parts.length > 0 ? [...new Set(parts)].join("、") : strings.noSpawn;
  }

  const candidateLabel = (candidate: RandomCandidate) =>
    actionsLabel(candidate.actions.map((ref) => actionAt(level, ref)));

  /** The wave (when there are several) or the 條件出兵 a random group is in. */
  function groupSource(group: RandomGroup): string | null {
    if (group.branchIndex !== null) {
      return strings.conditionalBadge(level.branches[group.branchIndex]?.key ?? "");
    }
    return multiWave ? strings.wave(group.waveIndex) : null;
  }

  const branchLabel = (branch: Branch) => actionsLabel(branch.phases.flatMap((p) => p.actions));

  function setTriggerSecond(branch: number, value: string) {
    const seconds = Number(value);
    if (value === "" || !Number.isFinite(seconds) || seconds < 0) return;
    onConditional(branch, { wave, t: roundTenth(seconds) });
  }
</script>

{#if plan.groups.hidden.length > 0 || plan.groups.random.length > 0 || branches.length > 0}
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
          <label class="random">
            <span>
              {strings.randomGroup(i)}
              <span class="muted">
                {strings.randomGroupWhere(groupSource(group), group.fragmentIndex, group.key)}
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
                    candidate.share,
                  )}
                </option>
              {/each}
            </select>
          </label>
        {/each}
      </fieldset>
    {/if}
    {#if spawning.length > 0}
      <fieldset>
        <legend title={strings.conditionalHint}>{strings.conditional}</legend>
        {#each spawning as { branch, index } (index)}
          {@const trigger = conditional[index]}
          <div class="conditional" data-conditional={index}>
            <label>
              <input
                type="checkbox"
                checked={trigger !== undefined && trigger.wave === wave}
                onchange={(e) =>
                  onConditional(index, e.currentTarget.checked ? { wave, t: roundTenth(t) } : null)}
              />
              {branchLabel(branch)}
              <span class="muted">{branch.key}</span>
            </label>
            {#if trigger !== undefined && trigger.wave === wave}
              <label class="seconds">
                {strings.triggerSecond}
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={trigger.t}
                  onchange={(e) => setTriggerSecond(index, e.currentTarget.value)}
                />
                {strings.seconds}
              </label>
            {:else if trigger !== undefined}
              <span class="muted"
                >{strings.triggeredInWave(strings.wave(trigger.wave), trigger.t)}</span
              >
            {/if}
          </div>
        {/each}
      </fieldset>
    {/if}
    {#if deviceOnly.length > 0}
      <fieldset>
        <legend title={strings.deviceOnlyHint}>{strings.deviceOnly}</legend>
        <ul>
          {#each deviceOnly as { branch, index } (index)}
            <li data-device-only={index}>
              {branchLabel(branch)} <span class="muted">{branch.key}</span>
            </li>
          {/each}
        </ul>
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
    /* A fieldset is never narrower than its content by default: a long 隨機出兵組 option overflowed. */
    min-width: 0;
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
  .conditional {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 12px;
    width: 100%;
  }
  .seconds input {
    width: 6em;
    font: inherit;
  }
  ul {
    margin: 0;
    padding-left: 1.2em;
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

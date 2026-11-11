<script lang="ts">
  import type { Level } from "../level/index.ts";
  import {
    markedSwitches,
    type ConditionalTrigger,
    type RandomGroup,
    type SpawnPlan,
  } from "../timeline/index.ts";
  import {
    branchLabel,
    candidateLabel,
    conditionalText,
    hiddenGroupText,
    type FileVariant,
  } from "./panelContent.ts";
  import { roundTenth } from "./playback.ts";
  import { strings } from "./strings.ts";
  import SwitchMark from "./SwitchMark.svelte";

  interface Props {
    level: Level;
    /** The current 開關狀態, resolved against the variant's defaults. */
    plan: SpawnPlan;
    /** The 關卡變體 showing this level file, in stage order: the 隱藏組's 變體說明 names them. */
    fileVariants: readonly FileVariant[];
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
  let { level, plan, fileVariants, conditional, wave, t, onHidden, onPick, onConditional }: Props =
    $props();

  const multiWave = $derived(level.waves.length > 1);
  const marked = $derived(markedSwitches(level, plan));
  const deviceOnly = $derived(
    level.branches
      .map((branch, index) => ({ branch, index }))
      .filter(({ branch }) => branch.deviceOnly),
  );

  /** The wave (when there are several) or the 條件出兵 a random group is in. */
  function groupSource(group: RandomGroup): string | null {
    if (group.branchIndex !== null) {
      const branch = level.branches[group.branchIndex];
      return branch ? conditionalText(level, branch).source : strings.conditional;
    }
    return multiWave ? strings.wave(group.waveIndex) : null;
  }

  function setTriggerSecond(branch: number, value: string) {
    const seconds = Number(value);
    if (value === "" || !Number.isFinite(seconds) || seconds < 0) return;
    onConditional(branch, { wave, t: roundTenth(seconds) });
  }
</script>

{#if plan.groups.hidden.length > 0 || plan.groups.random.length > 0 || level.branches.length > 0}
  <section class="switches" aria-label={strings.switches}>
    <h3>{strings.switches}</h3>
    {#if plan.groups.hidden.length > 0}
      <fieldset>
        <legend title={strings.hiddenGroupsHint}>{strings.hiddenGroups}</legend>
        {#each marked.hidden as { group, number } (group.name)}
          {@const text = hiddenGroupText(level, group.name, fileVariants)}
          <label class="hidden-group">
            <input
              type="checkbox"
              data-hidden-group={group.name}
              checked={plan.hiddenOn.has(group.name)}
              onchange={(e) => onHidden(group.name, e.currentTarget.checked)}
            />
            <SwitchMark kind="hiddenGroup" {number} />
            <span class="content" title={text.hint}>{text.name}</span>
            {#if text.note}
              <span class="note">{text.note}</span>
            {/if}
            <span class="muted">{group.defaultOn ? strings.defaultOn : strings.defaultOff}</span>
          </label>
        {/each}
      </fieldset>
    {/if}
    {#if plan.groups.random.length > 0}
      <fieldset>
        <legend title={strings.randomGroupsHint}>{strings.randomGroups}</legend>
        {#each marked.random as { group, index: i, number } (i)}
          <label class="random">
            <span class="name">
              <SwitchMark kind="random" {number} />
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
                  {candidateLabel(level, candidate)} ・ {strings.candidateWeight(
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
    {#if marked.conditional.length > 0}
      <fieldset>
        <legend title={strings.conditionalHint}>{strings.conditional}</legend>
        {#each marked.conditional as { branch, branchIndex: index, number } (index)}
          {@const trigger = conditional[index]}
          {@const text = conditionalText(level, branch)}
          <div class="conditional" data-conditional={index}>
            <label title={text.hint}>
              <input
                type="checkbox"
                checked={trigger !== undefined && trigger.wave === wave}
                onchange={(e) =>
                  onConditional(index, e.currentTarget.checked ? { wave, t: roundTenth(t) } : null)}
              />
              <SwitchMark kind="conditional" {number} />
              {branchLabel(level, branch)}
              {#if text.device}
                <span class="muted">{text.device}</span>
              {/if}
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
            {@const text = conditionalText(level, branch)}
            <li data-device-only={index} title={text.hint}>
              {branchLabel(level, branch)}
              {#if text.device}
                <span class="muted">{text.device}</span>
              {/if}
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
  .hidden-group {
    max-width: 100%;
  }
  .hidden-group .content {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .note {
    font-size: 0.85rem;
  }
  .random {
    flex-wrap: wrap;
    width: 100%;
  }
  .name {
    display: inline-flex;
    align-items: center;
    gap: 6px;
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

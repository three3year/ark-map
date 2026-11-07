<script lang="ts">
  import {
    actionKey,
    endpointKey,
    endpointRows,
    sameAction,
    type Individual,
    type RouteEndpoint,
    type SpawnRow,
    type WaveEnd,
  } from "../timeline/index.ts";
  import { endpointName, strings } from "./strings.ts";

  interface Props {
    rows: SpawnRow[];
    /** The selected wave; its rows are highlighted. */
    wave: number;
    multiWave: boolean;
    /** The selected individual; its action's row is highlighted. */
    selected: Individual | null;
    /** Clicking a row jumps to its first individual's spawn. */
    onJump: (row: SpawnRow) => void;
    /** 切換 on a candidate row that is not picked. */
    onPick: (group: number, candidate: number) => void;
    /** 條件出兵 keys by branch index, for the rows' markers. */
    branchKeys: string[];
    /** The 端點篩選: an endpoint of the selected wave's timeline, or null to list every row. */
    filter: RouteEndpoint | null;
    onClearFilter: () => void;
  }
  let {
    rows,
    wave,
    multiWave,
    selected,
    onJump,
    onPick,
    branchKeys,
    filter,
    onClearFilter,
  }: Props = $props();

  /** Rows keep their 編號 in the whole table while filtered. */
  const shown = $derived.by(() => {
    const numbered = rows.map((row, i) => ({ ...row, number: i + 1 }));
    return filter ? endpointRows(numbered, wave, filter) : numbered;
  });

  const isSelected = (r: SpawnRow) =>
    selected !== null && r.waveIndex === wave && sameAction(r, selected);

  const seconds = (t: number) => `${Math.round(t * 100) / 100}`;
  const order = (r: SpawnRow) =>
    r.firstOrder === null
      ? "-"
      : r.firstOrder === r.lastOrder
        ? `${r.firstOrder}`
        : `${r.firstOrder} ~ ${r.lastOrder}`;
  const enemyName = (r: SpawnRow) => r.enemy?.name ?? (r.enemyId || strings.noSpawn);
  const waveEndLabel = (end: WaveEnd) =>
    end.kind === "untilCleared" ? strings.untilCleared : strings.timeLimit(end.seconds);
</script>

<section aria-label={strings.spawnTable}>
  <h3>{strings.spawnTable}</h3>
  {#if filter}
    <p class="filter" data-endpoint-filter={endpointKey(filter)}>
      <span class="dot {filter.kind}" aria-hidden="true"></span>
      <span>{strings.endpointFilter(endpointName(filter))}</span>
      <button type="button" onclick={onClearFilter}>{strings.clearFilter}</button>
    </p>
  {/if}
  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th>{strings.spawnTableNumber}</th>
          <th>{strings.spawnTableEnemy}</th>
          <th>{strings.spawnTableOrder}</th>
          <th>{strings.spawnTableInterval}</th>
          <th>{strings.spawnTableWaveTime}</th>
          <th title={strings.spawnTableAbsoluteTimeHint}>{strings.spawnTableAbsoluteTime}</th>
          <th>{strings.spawnTableMarker}</th>
        </tr>
      </thead>
      <tbody>
        {#each shown as row, i (`${row.waveIndex}-${actionKey(row)}`)}
          {#if multiWave && (i === 0 || shown[i - 1]!.waveIndex !== row.waveIndex)}
            <tr class="wave-head" class:current={row.waveIndex === wave}>
              <th colspan="7" scope="rowgroup">{strings.wave(row.waveIndex)}</th>
            </tr>
          {/if}
          <!-- Keyboard users jump through the enemy-name button, whose click bubbles up here. -->
          <tr
            onclick={() => onJump(row)}
            class:current={multiWave && row.waveIndex === wave}
            class:selected={isSelected(row)}
            class:unpicked={row.random && !row.random.picked}
            data-wave={row.waveIndex}
            data-action={actionKey(row)}
            data-hidden-group={row.hiddenGroup}
            data-conditional={row.branchIndex}
            data-random={row.random && `${row.random.group}-${row.random.candidate}`}
            data-picked={row.random?.picked}
          >
            <td class="num">{row.number}</td>
            <td>
              <button
                type="button"
                class="enemy"
                title={strings.jumpToSpawn}
                aria-pressed={isSelected(row)}
              >
                {#if row.enemy?.avatar}
                  <img src={row.enemy.avatar} alt="" width="28" height="28" />
                {:else}
                  <span class="avatar-fallback" aria-hidden="true">
                    {enemyName(row).slice(0, 1)}
                  </span>
                {/if}
                <span>{enemyName(row)}</span>
                <span class="count">× {row.count}</span>
                {#if row.harmless}
                  <span class="badge harmless" title={strings.harmlessHint}>{strings.harmless}</span
                  >
                {/if}
              </button>
            </td>
            <td class="num">{order(row)}</td>
            <td class="num">{seconds(row.interval)} {strings.seconds}</td>
            <td class="num">{seconds(row.waveTime)} {strings.seconds}</td>
            <td class="num">{seconds(row.absoluteTime)} {strings.seconds}</td>
            <td class="markers"
              ><span class="marker-list">
                {#if row.branchIndex !== null}
                  <span class="badge conditional"
                    >{strings.conditionalBadge(branchKeys[row.branchIndex] ?? "")}</span
                  >
                {/if}
                {#if row.hiddenGroup}
                  <span class="badge hidden-group">{strings.hiddenGroupBadge(row.hiddenGroup)}</span
                  >
                {/if}
                {#if row.random}
                  {@const random = row.random}
                  <span class="badge random">
                    {strings.randomGroup(random.group)} ・ {strings.candidateWeight(
                      random.weight,
                      random.share,
                    )}
                  </span>
                  {#if !random.picked}
                    <button
                      type="button"
                      class="pick"
                      title={strings.pickCandidateHint}
                      onclick={(event) => {
                        event.stopPropagation();
                        onPick(random.group, random.candidate);
                      }}
                    >
                      {strings.pickCandidate}
                    </button>
                  {/if}
                {/if}
                {#if row.waveEnd}
                  <span class="badge wave-end">{waveEndLabel(row.waveEnd)}</span>
                {/if}
              </span></td
            >
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>

<style>
  section {
    margin-top: 20px;
  }
  h3 {
    margin: 0 0 8px;
    font-size: 1.1rem;
  }
  .filter {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 8px;
    font-size: 0.9rem;
  }
  .filter .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex: none;
  }
  .filter .dot.spawn {
    background: var(--spawn-red);
  }
  .filter .dot.exit {
    background: var(--exit-blue);
  }
  .filter button {
    margin-left: auto;
    padding: 2px 10px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--panel);
    color: var(--fg);
    font: inherit;
    cursor: pointer;
  }
  .scroll {
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--panel);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
    white-space: nowrap;
  }
  th,
  td {
    padding: 6px 10px;
    text-align: left;
    border-bottom: 1px solid var(--border);
  }
  thead th {
    color: var(--muted);
    font-weight: 600;
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .wave-head th {
    background: var(--bg);
    font-weight: 600;
  }
  tr.current td,
  .wave-head.current th {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }
  .enemy {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .enemy:hover span:not(.count, .badge) {
    text-decoration: underline;
  }
  tr[data-action] {
    cursor: pointer;
  }
  tr[data-action]:not(.selected):hover td {
    background: color-mix(in srgb, var(--accent) 18%, transparent);
  }
  tr.selected td {
    background: color-mix(in srgb, #f5a524 22%, transparent);
  }
  .enemy img,
  .avatar-fallback {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    flex: none;
  }
  .avatar-fallback {
    display: inline-grid;
    place-items: center;
    background: var(--border);
    font-size: 0.8rem;
  }
  .count {
    color: var(--muted);
  }
  .badge {
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 0.8rem;
  }
  .harmless {
    background: color-mix(in srgb, #2e9e5b 18%, transparent);
    color: #2e9e5b;
  }
  tr.unpicked td:not(.markers),
  tr.unpicked .badge.random {
    opacity: 0.45;
  }
  .marker-list {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
  }
  .hidden-group {
    background: color-mix(in srgb, #8e5bd6 18%, transparent);
    color: #8e5bd6;
  }
  .conditional {
    background: color-mix(in srgb, #2e86d6 18%, transparent);
    color: #2a78c0;
  }
  .random {
    background: color-mix(in srgb, #d6862e 18%, transparent);
    color: #c0731f;
  }
  .pick {
    padding: 1px 8px;
    border-radius: 4px;
    border: 1px solid var(--accent);
    background: none;
    color: var(--accent);
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .wave-end {
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    color: var(--accent);
  }
</style>

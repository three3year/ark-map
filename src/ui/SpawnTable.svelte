<script lang="ts">
  import type { SpawnRow, WaveEnd } from "../timeline/index.ts";
  import { strings } from "./strings.ts";

  interface Props {
    rows: SpawnRow[];
    /** The selected wave; its rows are highlighted. */
    wave: number;
    multiWave: boolean;
  }
  let { rows, wave, multiWave }: Props = $props();

  const seconds = (t: number) => `${Math.round(t * 100) / 100}`;
  const order = (r: SpawnRow) =>
    r.firstOrder === r.lastOrder ? `${r.firstOrder}` : `${r.firstOrder} ~ ${r.lastOrder}`;
  const waveEndLabel = (end: WaveEnd) =>
    end.kind === "untilCleared" ? strings.untilCleared : strings.timeLimit(end.seconds);
</script>

<section aria-label={strings.spawnTable}>
  <h3>{strings.spawnTable}</h3>
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
        {#each rows as row, i (`${row.waveIndex}-${row.fragmentIndex}-${row.actionIndex}`)}
          {#if multiWave && (i === 0 || rows[i - 1]!.waveIndex !== row.waveIndex)}
            <tr class="wave-head" class:current={row.waveIndex === wave}>
              <th colspan="7" scope="rowgroup">{strings.wave(row.waveIndex)}</th>
            </tr>
          {/if}
          <tr class:current={multiWave && row.waveIndex === wave} data-wave={row.waveIndex}>
            <td class="num">{i + 1}</td>
            <td>
              <span class="enemy">
                {#if row.enemy?.avatar}
                  <img src={row.enemy.avatar} alt="" width="28" height="28" />
                {:else}
                  <span class="avatar-fallback" aria-hidden="true">
                    {(row.enemy?.name ?? row.enemyId).slice(0, 1)}
                  </span>
                {/if}
                <span>{row.enemy?.name ?? row.enemyId}</span>
                <span class="count">× {row.count}</span>
                {#if row.harmless}
                  <span class="badge harmless" title={strings.harmlessHint}>{strings.harmless}</span
                  >
                {/if}
              </span>
            </td>
            <td class="num">{order(row)}</td>
            <td class="num">{seconds(row.interval)} {strings.seconds}</td>
            <td class="num">{seconds(row.waveTime)} {strings.seconds}</td>
            <td class="num">{seconds(row.absoluteTime)} {strings.seconds}</td>
            <td>
              {#if row.waveEnd}
                <span class="badge wave-end">{waveEndLabel(row.waveEnd)}</span>
              {/if}
            </td>
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
  .wave-end {
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    color: var(--accent);
  }
</style>

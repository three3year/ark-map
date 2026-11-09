<script lang="ts">
  import {
    shownExpansion,
    shownLevelFile,
    themeExpansions,
    withNames,
    type Area,
    type Level,
    type LevelFile,
    type NameTable,
    type StageEntry,
    type StageIndex,
    type TerrainTable,
    type VariantId,
  } from "../level/index.ts";
  import type { SpawnSwitches } from "../timeline/index.ts";
  import AreaList from "./AreaList.svelte";
  import ExpansionSwitch from "./ExpansionSwitch.svelte";
  import LevelPage from "./LevelPage.svelte";
  import { ceilTenth, roundTenth } from "./playback.ts";
  import { formatHash, parseHash, type LevelRoute, type Route } from "./route.ts";
  import StageList from "./StageList.svelte";
  import { strings } from "./strings.ts";

  let hash = $state(location.hash);
  const route = $derived(parseHash(hash));

  /**
   * The level page's 播放位置 and 開關狀態; the URL only picks the stage, variant and 內容拓展.
   * They live here rather than in the level page, which only exists once the shown level file
   * has loaded, so a switch that loads another file keeps the 播放位置.
   */
  let position = $state({ wave: 0, t: 0 });
  /** Only what differs from the variant's default. */
  let switches = $state.raw<SpawnSwitches>({});

  /** The id of the variant a level route shows: no `v` is the stage's base variant. */
  const variantId = (r: LevelRoute) => r.variant ?? stages[r.stageId]?.stage.variants[0]?.id;

  /** 實際顯示的關卡檔 of a level route; undefined when the stage or variant does not exist. */
  function routeLevelFile(r: LevelRoute): string | undefined {
    const stage = stages[r.stageId]?.stage;
    const variant = stage?.variants.find((v) => v.id === variantId(r));
    return stage && variant ? shownLevelFile(stage, variant, r.expansion) : undefined;
  }

  /**
   * Follow a new hash. Entering a level page, or moving to another stage, starts at wave 1, 0 s
   * with the variant's default switches; moving to another variant or shown level file (a
   * 內容拓展) resets only the switches.
   */
  function followHash(next: string) {
    const to = parseHash(next);
    if (to.page === "level") {
      const from = route.page === "level" ? route : null;
      if (!from || from.stageId !== to.stageId) {
        position = { wave: 0, t: 0 };
        switches = {};
      } else if (variantId(from) !== variantId(to) || routeLevelFile(from) !== routeLevelFile(to)) {
        switches = {};
      }
    }
    hash = next;
  }

  /** Write the URL, replacing the current history entry, and follow it. */
  function navigate(next: Route) {
    history.replaceState(null, "", formatHash(next));
    followHash(location.hash);
  }

  $effect(() => {
    const onHashChange = () => followHash(location.hash);
    addEventListener("hashchange", onHashChange);
    return () => removeEventListener("hashchange", onHashChange);
  });

  async function fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return (await res.json()) as T;
  }

  let index = $state<StageIndex | null>(null);
  let error = $state<string | null>(null);
  fetchJson<StageIndex>("data/index.json").then(
    (i) => (index = i),
    (e: unknown) => (error = String(e)),
  );

  const stages: Record<string, { area: Area; stage: StageEntry }> = $derived(
    Object.fromEntries(
      (index?.areas ?? []).flatMap((area) =>
        area.sections.flatMap((s) => s.stages.map((stage) => [stage.id, { area, stage }])),
      ),
    ),
  );

  /**
   * Stage-table ids that are no stage of the index but some stage's variant (an old 緊急作戰 id
   * such as ro4_e_1_1), mapped to that stage and variant.
   */
  const movedStages: Record<string, { stageId: string; variant: VariantId }> = $derived(
    Object.fromEntries(
      Object.values(stages).flatMap(({ stage }) =>
        stage.variants
          .filter((v) => v.sourceStageId !== stage.id)
          .map((v) => [v.sourceStageId, { stageId: stage.id, variant: v.id }]),
      ),
    ),
  );

  /**
   * Old links, replacing their history entry: an old 緊急作戰 id opens its node's variant, keeping
   * `x`. `v=replaceN`, which named a node's N-th 內容拓展 file when they were variants, opens the
   * base variant (or the 緊急作戰 of an old 緊急作戰 id) with `x` the stage's N-th 內容拓展, none
   * when it has fewer; it overrides any `x` of the link.
   */
  $effect(() => {
    if (route.page !== "level") return;
    const moved = stages[route.stageId] ? undefined : movedStages[route.stageId];
    const oldExpansion = /^replace([1-9]\d*)$/.exec(route.variant ?? "");
    if (!moved && !(oldExpansion && stages[route.stageId])) return;
    const stageId = moved?.stageId ?? route.stageId;
    const expansions = stages[stageId]!.stage.expansions ?? [];
    navigate({
      page: "level",
      stageId,
      variant: moved?.variant ?? null,
      expansion: oldExpansion
        ? (expansions[Number(oldExpansion[1]) - 1]?.number ?? null)
        : route.expansion,
    });
  });

  const area = $derived(
    route.page === "area" ? index?.areas.find((a) => a.id === route.areaId) : undefined,
  );
  const found = $derived(route.page === "level" ? stages[route.stageId] : undefined);
  const variant = $derived(
    route.page === "level"
      ? found?.stage.variants.find((v) => v.id === variantId(route))
      : undefined,
  );

  /** 實際顯示的關卡檔: the variant's own, or the 內容拓展 the route's `x` shows. */
  const levelFile = $derived(
    route.page === "level" && found && variant
      ? shownLevelFile(found.stage, variant, route.expansion)
      : undefined,
  );

  /** The site-wide 內容拓展選擇: a 拓展編號, or null for 原版. */
  let expansionChoice = $state<number | null>(null);

  /**
   * Landing on a node of a theme with 內容拓展 sets the choice to the link's `x`, so the switch
   * matches the map on screen. Other level pages carry no `x` and leave the choice alone.
   */
  $effect(() => {
    if (route.page === "level" && found && themeExpansions(found.area).length > 0) {
      expansionChoice = route.expansion;
    }
  });

  /**
   * The 內容拓展開關 beside the site title, on a 集成戰略 theme with 內容拓展: its stage list
   * offers 原版 and every 內容拓展 of the theme, and a press changes only the choice in memory;
   * its nodes offer 原版 and the node's own. Null elsewhere.
   */
  const expansionSwitch = $derived.by(() => {
    if (route.page === "area") {
      const numbers = area ? themeExpansions(area) : [];
      if (numbers.length === 0) return null;
      return {
        numbers,
        shown:
          shownExpansion(
            numbers.map((number) => ({ number })),
            expansionChoice,
          )?.number ?? null,
        onSelect: (expansion: number | null) => (expansionChoice = expansion),
      };
    }
    if (route.page !== "level" || !found) return null;
    const { area: theme, stage } = found;
    if (themeExpansions(theme).length === 0) return null;
    const levelRoute = route;
    return {
      numbers: (stage.expansions ?? []).map((x) => x.number),
      shown: shownExpansion(stage.expansions, route.expansion)?.number ?? null,
      onSelect: (expansion: number | null) => navigate({ ...levelRoute, expansion }),
    };
  });

  /** The last level JSON fetched, with the file it came from and the 地形表. */
  let loaded = $state<{
    file: string;
    level: Level;
    terrain: TerrainTable;
  } | null>(null);
  let requested: string | null = null;
  /** The 名稱表, fetched with the first level. */
  let names: Promise<NameTable> | null = null;
  $effect(() => {
    const file = levelFile;
    if (!file || file === requested) return;
    requested = file;
    names ??= fetchJson<NameTable>("data/names.json");
    Promise.all([fetchJson<LevelFile>(file), names]).then(
      ([levelFile, nameTable]) => {
        if (requested === file) {
          loaded = { file, level: withNames(levelFile, nameTable), terrain: nameTable.terrain };
        }
      },
      (e: unknown) => (error = String(e)),
    );
  });

  /** What the level page shows, once its level file has loaded. */
  const levelPage = $derived(
    route.page === "level" && !error && found && variant && levelFile && loaded?.file === levelFile
      ? { route, ...found, variant, levelFile, level: loaded.level, terrain: loaded.terrain }
      : null,
  );
</script>

{#snippet siteTitle()}
  <div class="title-row">
    <h1><a href={formatHash({ page: "home" })}>{strings.siteTitle}</a></h1>
    {#if expansionSwitch}
      <ExpansionSwitch {...expansionSwitch} />
    {/if}
  </div>
{/snippet}

<main class:level={route.page === "level"}>
  {#if levelPage}
    <LevelPage
      {siteTitle}
      area={levelPage.area}
      stage={levelPage.stage}
      variant={levelPage.variant}
      levelFile={levelPage.levelFile}
      level={levelPage.level}
      terrain={levelPage.terrain}
      wave={position.wave}
      t={position.t}
      {switches}
      onSeek={(t) => (position.t = roundTenth(t))}
      onSelectWave={(wave) => (position = { wave, t: 0 })}
      onJump={(wave, t) => (position = { wave, t: ceilTenth(t) })}
      onSwitches={(next) => (switches = next)}
      onVariant={(v) => navigate({ ...levelPage.route, variant: v })}
    />
  {:else}
    {@render siteTitle()}
    {#if error}
      <p role="alert">{strings.loadFailed}:{error}</p>
    {:else if !index}
      <p>{strings.loading}</p>
    {:else if index.areas.length === 0}
      <p>{strings.noStages}</p>
    {:else if route.page === "home"}
      <AreaList {index} />
    {:else if route.page === "area"}
      {#if area}
        <StageList {area} expansion={themeExpansions(area).length > 0 ? expansionChoice : null} />
      {:else}
        <p>{strings.areaNotFound(route.areaId)}</p>
      {/if}
    {:else if !found}
      <p>{strings.stageNotFound(route.stageId)}</p>
    {:else if !variant}
      <p>{strings.variantNotFound(route.variant ?? "")}</p>
    {:else}
      <p>{strings.loading}</p>
    {/if}
  {/if}
</main>

<style>
  main {
    max-width: 960px;
    margin: 0 auto;
    padding: 0 16px 32px;
  }
  /*
   * The level page takes the window's whole width: on a wide screen the map gets all of it the
   * spawn table's column leaves. Below its breakpoint it keeps to 960px itself.
   */
  main.level {
    max-width: none;
  }
  /*
   * The page's top padding is the title row's own: on the level page, the spawn table's column
   * beside the title then starts at the page's top edge. The 內容拓展開關 sits right of the title,
   * or on the next line at the left when the row is too narrow for both.
   */
  .title-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
    margin: 0 0 8px;
    padding-top: 12px;
  }
  h1 {
    font-size: 1.1rem;
    font-weight: 600;
    margin: 0;
  }
  h1 a {
    color: var(--muted);
    text-decoration: none;
  }
</style>

<script lang="ts">
  import {
    withNames,
    type Area,
    type Level,
    type LevelFile,
    type NameTable,
    type StageEntry,
    type StageIndex,
  } from "../level/index.ts";
  import AreaList from "./AreaList.svelte";
  import LevelPage from "./LevelPage.svelte";
  import { formatHash, parseHash, roundTenth, type Route } from "./route.ts";
  import StageList from "./StageList.svelte";
  import { strings } from "./strings.ts";

  let hash = $state(location.hash);
  const route = $derived(parseHash(hash));

  /**
   * The level page's 播放位置. It lives here rather than in the level page, which only exists
   * once the variant's level file has loaded, so a variant switch that loads another file keeps it.
   */
  let position = $state({ wave: 0, t: 0 });

  /** Follow a new hash; entering a level page, or moving to another stage, starts at wave 1, 0 s. */
  function followHash(next: string) {
    const to = parseHash(next);
    if (to.page === "level" && (route.page !== "level" || route.stageId !== to.stageId)) {
      position = { wave: 0, t: 0 };
    }
    hash = next;
  }

  /** Write the URL first; the page renders the stage, variant and switches the URL says. */
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

  const area = $derived(
    route.page === "area" ? index?.areas.find((a) => a.id === route.areaId) : undefined,
  );
  const found = $derived(route.page === "level" ? stages[route.stageId] : undefined);
  const variant = $derived(
    route.page === "level" && found
      ? route.variant === null
        ? found.stage.variants[0]
        : found.stage.variants.find((v) => v.id === route.variant)
      : undefined,
  );

  /** The last level JSON fetched, with the file it came from. */
  let loaded = $state<{ file: string; level: Level } | null>(null);
  let requested: string | null = null;
  /** The 名稱表, fetched with the first level. */
  let names: Promise<NameTable> | null = null;
  $effect(() => {
    const file = variant?.levelFile;
    if (!file || file === requested) return;
    requested = file;
    names ??= fetchJson<NameTable>("data/names.json");
    Promise.all([fetchJson<LevelFile>(file), names]).then(
      ([levelFile, nameTable]) => {
        if (requested === file) loaded = { file, level: withNames(levelFile, nameTable) };
      },
      (e: unknown) => (error = String(e)),
    );
  });
</script>

<main>
  <h1><a href={formatHash({ page: "home" })}>{strings.siteTitle}</a></h1>
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
      <StageList {area} />
    {:else}
      <p>{strings.areaNotFound(route.areaId)}</p>
    {/if}
  {:else if !found}
    <p>{strings.stageNotFound(route.stageId)}</p>
  {:else if !variant}
    <p>{strings.variantNotFound(route.variant ?? "")}</p>
  {:else if loaded && loaded.file === variant.levelFile}
    <LevelPage
      area={found.area}
      stage={found.stage}
      {variant}
      level={loaded.level}
      wave={position.wave}
      t={position.t}
      switches={route.switches ?? {}}
      onSeek={(t) => (position.t = roundTenth(t))}
      onSelectWave={(wave) => (position = { wave, t: 0 })}
      onJump={(wave, t) => (position = { wave, t: roundTenth(t) })}
      onSwitches={(switches) => navigate({ ...route, switches })}
      onVariant={(v) => navigate({ ...route, variant: v, switches: undefined })}
    />
  {:else}
    <p>{strings.loading}</p>
  {/if}
</main>

<style>
  main {
    max-width: 960px;
    margin: 0 auto;
    padding: 12px 16px 32px;
  }
  h1 {
    font-size: 1.1rem;
    font-weight: 600;
    margin: 0 0 8px;
  }
  h1 a {
    color: var(--muted);
    text-decoration: none;
  }
</style>

<script lang="ts">
  import type { Area, Level, StageEntry, StageIndex } from "../level/index.ts";
  import AreaList from "./AreaList.svelte";
  import LevelPage from "./LevelPage.svelte";
  import { formatHash, parseHash, type Route } from "./route.ts";
  import StageList from "./StageList.svelte";
  import { strings } from "./strings.ts";

  let hash = $state(location.hash);
  const route = $derived(parseHash(hash));

  /** Write the URL first; the page renders from what the URL says. */
  function navigate(next: Route) {
    history.replaceState(null, "", formatHash(next));
    hash = location.hash;
  }

  $effect(() => {
    const onHashChange = () => (hash = location.hash);
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
  $effect(() => {
    const file = variant?.levelFile;
    if (!file || file === requested) return;
    requested = file;
    fetchJson<Level>(file).then(
      (level) => {
        if (requested === file) loaded = { file, level };
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
      t={route.t}
      onSeek={(t) => navigate({ ...route, t })}
      onVariant={(v) => navigate({ ...route, variant: v })}
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

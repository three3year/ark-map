<script lang="ts">
  import type { Level, StageIndex } from "../level/index.ts";
  import LevelPage from "./LevelPage.svelte";
  import { formatHash, parseHash, type LevelRoute } from "./route.ts";
  import { strings } from "./strings.ts";

  let hash = $state(location.hash);
  const route = $derived(parseHash(hash));

  /** Write the URL first; the page renders from what the URL says. */
  function navigate(next: LevelRoute) {
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

  $effect(() => {
    const first = index?.stages[0];
    if (first && !route) navigate({ stageId: first.id, wave: 0, t: 0 });
  });

  const stage = $derived(route && index?.stages.find((s) => s.id === route.stageId));

  let level = $state<Level | null>(null);
  let loadedFile: string | null = null;
  $effect(() => {
    const file = stage?.levelFile;
    if (!file || file === loadedFile) return;
    loadedFile = file;
    level = null;
    fetchJson<Level>(file).then(
      (l) => {
        if (loadedFile === file) level = l;
      },
      (e: unknown) => (error = String(e)),
    );
  });
</script>

<main>
  <h1>{strings.siteTitle}</h1>
  {#if error}
    <p role="alert">{strings.loadFailed}:{error}</p>
  {:else if !index}
    <p>{strings.loading}</p>
  {:else if index.stages.length === 0}
    <p>{strings.noStages}</p>
  {:else if route && !stage}
    <p>{strings.stageNotFound(route.stageId)}</p>
  {:else if route && stage && level}
    <LevelPage
      {stage}
      {level}
      wave={route.wave}
      t={route.t}
      onSeek={(t) => navigate({ ...route, t })}
      onSelectWave={(wave) => navigate({ ...route, wave, t: 0 })}
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
    color: var(--muted);
    font-weight: 600;
    margin: 0 0 8px;
  }
</style>

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { rawCacheDir, type RepoSource } from "./config.ts";

function sourceUrl(source: RepoSource, file: string): string {
  return `https://raw.githubusercontent.com/${source.repo}/${source.branch}/${source.root}/${file}`;
}

/** Where one source's downloads are cached. */
export function sourceCacheDir(source: RepoSource): string {
  return path.join(rawCacheDir, source.repo, source.branch, source.root);
}

function cachePath(source: RepoSource, file: string): string {
  return path.join(sourceCacheDir(source), file);
}

/** Download a file once; later calls read the cached copy. Returns null on HTTP 404. */
export async function fetchCached(source: RepoSource, file: string): Promise<Buffer | null> {
  const cached = cachePath(source, file);
  try {
    return await readFile(cached);
  } catch {
    // not cached yet
  }
  const url = sourceUrl(source, file);
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`下載失敗 ${res.status}: ${url}`);
  const body = Buffer.from(await res.arrayBuffer());
  await mkdir(path.dirname(cached), { recursive: true });
  const tmp = `${cached}.${process.pid}.tmp`;
  await writeFile(tmp, body);
  await rename(tmp, cached);
  return body;
}

export async function fetchJson<T>(source: RepoSource, file: string): Promise<T> {
  const body = await fetchCached(source, file);
  if (body === null) throw new Error(`找不到原始檔: ${sourceUrl(source, file)}`);
  return JSON.parse(body.toString("utf8")) as T;
}

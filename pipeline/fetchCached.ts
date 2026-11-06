// Raw downloads with a disk cache keyed by git blob sha, a concurrency limit and backoff.
// raw.githubusercontent.com rate-limits unauthenticated clients without publishing the limit,
// so a cold run throttles itself and retries 429s; warm runs download only changed files.
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { rawCacheDir, type RepoSource } from "./config.ts";

const maxConcurrent = 6;
const maxAttempts = 7;

function sourceUrl(source: RepoSource, file: string): string {
  return `https://raw.githubusercontent.com/${source.repo}/${source.branch}/${source.root}/${file}`;
}

function cachePath(source: RepoSource, file: string): string {
  return path.join(rawCacheDir, source.repo, source.branch, source.root, file);
}

/** The sha git gives a file's content, as listed by the trees API. */
export function gitBlobSha(body: Buffer): string {
  return createHash("sha1").update(`blob ${body.length}\0`).update(body).digest("hex");
}

export const fetchStats = { cached: 0, downloaded: 0, retried: 0 };

let active = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  if (active >= maxConcurrent) await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
  try {
    return await task();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function retryable(status: number): boolean {
  return status === 429 || status === 403 || status >= 500;
}

/** GET with retries on rate limits, server errors and network errors. */
async function politeFetch(url: string, headers: Record<string, string> = {}): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    let res: Response | null = null;
    try {
      res = await fetch(url, { headers });
      // An exhausted API quota resets within the hour; waiting it out here would stall the run.
      const quotaGone = res.headers.get("x-ratelimit-remaining") === "0";
      if (!retryable(res.status) || quotaGone || attempt === maxAttempts) return res;
    } catch (e) {
      if (attempt === maxAttempts) throw e;
    }
    const retryAfter = Number(res?.headers.get("retry-after"));
    const wait =
      retryAfter > 0
        ? retryAfter * 1000
        : Math.min(60_000, 1000 * 2 ** attempt) * (0.5 + Math.random());
    fetchStats.retried++;
    console.warn(`[下載] ${res?.status ?? "網路錯誤"},${Math.round(wait / 1000)} 秒後重試: ${url}`);
    await sleep(wait);
  }
}

/**
 * The cached copy when it matches `sha` (or when no sha is given); otherwise download and
 * cache it. Returns null on HTTP 404.
 */
export async function fetchCached(
  source: RepoSource,
  file: string,
  sha?: string,
): Promise<Buffer | null> {
  const cached = cachePath(source, file);
  const hit = await readFile(cached).catch(() => null);
  if (hit && (sha === undefined || gitBlobSha(hit) === sha)) {
    fetchStats.cached++;
    return hit;
  }
  const url = sourceUrl(source, file);
  return withSlot(async () => {
    const res = await politeFetch(url);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`下載失敗 ${res.status}: ${url}`);
    const body = Buffer.from(await res.arrayBuffer());
    fetchStats.downloaded++;
    await mkdir(path.dirname(cached), { recursive: true });
    const tmp = `${cached}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    await writeFile(tmp, body);
    await rename(tmp, cached);
    return body;
  });
}

export async function fetchJson<T>(source: RepoSource, file: string, sha?: string): Promise<T> {
  const body = await fetchCached(source, file, sha);
  if (body === null) throw new Error(`找不到原始檔: ${sourceUrl(source, file)}`);
  return JSON.parse(body.toString("utf8")) as T;
}

/** Blob sha by path relative to the listed directory. */
export type TreeListing = Map<string, string>;

/**
 * List every file under `dir` with one trees-API call (60 calls/hour without a token; set
 * GITHUB_TOKEN to lift that). Returns null when the listing is unavailable; callers then trust
 * the cache as is and learn about missing files from 404s.
 */
export async function listTree(source: RepoSource, dir = ""): Promise<TreeListing | null> {
  const treeish = `${source.branch}:${[source.root, dir].filter(Boolean).join("/")}`;
  const url = `https://api.github.com/repos/${source.repo}/git/trees/${treeish}?recursive=1`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "ak-snapshot-viewer-pipeline",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  try {
    const res = await politeFetch(url, headers);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as {
      truncated: boolean;
      tree: { path: string; type: string; sha: string }[];
    };
    if (body.truncated) throw new Error("清單被截斷");
    return new Map(body.tree.filter((t) => t.type === "blob").map((t) => [t.path, t.sha]));
  } catch (e) {
    console.warn(`[清單] 無法列出 ${source.repo} ${treeish}(${String(e)}),改用既有快取`);
    return null;
  }
}

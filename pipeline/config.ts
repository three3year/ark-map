import path from "node:path";
import { fileURLToPath } from "node:url";

/** A directory inside a GitHub repo, read through raw.githubusercontent.com. */
export interface RepoSource {
  repo: string;
  branch: string;
  root: string;
}

export const sources = {
  /** CN server game data: level files, enemy database, stage table. */
  cn: { repo: "Kengxxiao/ArknightsGameData", branch: "master", root: "zh_CN/gamedata" },
  /** TW server game data: Traditional Chinese names. */
  tw: { repo: "ArknightsAssets/ArknightsGamedata", branch: "master", root: "tw/gamedata" },
  /** Enemy avatars, `<enemy id>.png`. */
  avatars: { repo: "yuanyan3060/ArknightsGameResource", branch: "main", root: "enemy" },
} satisfies Record<string, RepoSource>;

/** Stages the site publishes. Ticket 06 replaces this with the full stage index. */
export const stageIds = ["main_01-07"];

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Raw downloads are cached here; set AK_RAW_CACHE to share a cache between checkouts. */
export const rawCacheDir = process.env.AK_RAW_CACHE ?? path.join(repoRoot, ".cache", "raw");

/** Pipeline output, served by Vite from `public/`. */
export const outDir = path.join(repoRoot, "public", "data");

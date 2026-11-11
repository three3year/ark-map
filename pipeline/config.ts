import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Raw downloads are cached here; set AK_RAW_CACHE to share a cache between checkouts. */
export const rawCacheDir = process.env.AK_RAW_CACHE ?? path.join(repoRoot, ".cache", "raw");

/** Pipeline output, served by Vite from `public/`. */
export const outDir = path.join(repoRoot, "public", "data");

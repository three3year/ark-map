import type { DataVersion } from "../src/level/index.ts";

/** The 版號 file, relative to the server's `excel` directory. */
export const versionFile = "gamedata_const.json";

export interface DataVersionInput {
  /** The `excel` directory's listing; null when it could not be fetched. */
  listing: ReadonlyMap<string, string> | null;
  /** The 版號 file's text, cached or downloaded; null when the download was a 404. */
  body: string | null;
  /** When the cached 版號 file was last written; null when there is none. */
  cachedAt: Date | null;
  now: Date;
}

/** The server's 資料版本; its version is null when the 版號 file gives none. */
export function dataVersion({ listing, body, cachedAt, now }: DataVersionInput): DataVersion {
  return {
    version: versionFileListed(listing) && body !== null ? parseVersion(body) : null,
    checkedAt: confirmedAt(listing, cachedAt, now).toISOString(),
  };
}

/** Whether to read the 版號 file: without a listing the cache is trusted; with one, only if listed. */
export function versionFileListed(listing: ReadonlyMap<string, string> | null): boolean {
  return !listing || listing.has(versionFile);
}

/**
 * When the data was last confirmed current: this run when the listing came back. Without it the
 * cache was trusted as is, so when the cached 版號 file was written, or this run if there is none.
 */
function confirmedAt(
  listing: ReadonlyMap<string, string> | null,
  cachedAt: Date | null,
  now: Date,
): Date {
  if (listing) return now;
  return cachedAt ?? now;
}

function parseVersion(body: string): string | null {
  try {
    const { dataVersion } = JSON.parse(body) as { dataVersion?: unknown };
    return typeof dataVersion === "string" ? dataVersion : null;
  } catch {
    return null;
  }
}

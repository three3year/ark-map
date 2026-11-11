// One server's 資料版本, from what the pipeline could fetch of its `excel` directory.
import type { DataVersion } from "../src/level/index.ts";

/** The 版號 file, relative to the server's `excel` directory. */
export const versionFile = "gamedata_const.json";

export interface DataVersionInput {
  /** The `excel` directory's listing; null when it could not be fetched. */
  listing: ReadonlyMap<string, string> | null;
  /** The 版號 file's text; null when it was not fetched or the download was a 404. */
  body: string | null;
  /** When the cached 版號 file was last written; null when there is none. */
  cachedAt: Date | null;
  now: Date;
}

export function dataVersion({ listing, body, cachedAt, now }: DataVersionInput): {
  version: DataVersion;
  warn: boolean;
} {
  // Without the listing the pipeline trusts the cache, so the cached file's age is the newest
  // confirmation there is.
  const checkedAt = (listing ? now : (cachedAt ?? now)).toISOString();
  // A listing without the file means upstream dropped it; a cached copy would be a stale version.
  const listed = !listing || listing.has(versionFile);
  const version = listed && body !== null ? parseVersion(body) : null;
  return { version: { version, checkedAt }, warn: version === null };
}

function parseVersion(body: string): string | null {
  try {
    const { dataVersion } = JSON.parse(body) as { dataVersion?: unknown };
    return typeof dataVersion === "string" ? dataVersion : null;
  } catch {
    return null;
  }
}

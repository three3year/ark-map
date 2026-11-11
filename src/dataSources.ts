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
  devices: { repo: "yuanyan3060/ArknightsGameResource", branch: "main", root: "avatar" },
} satisfies Record<string, RepoSource>;

export function repoUrl(source: RepoSource): string {
  return `https://github.com/${source.repo}`;
}

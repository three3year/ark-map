import { describe, expect, it } from "vitest";
import { repoUrl, sources } from "./dataSources.ts";

describe("repoUrl", () => {
  it("is the repo's GitHub home page", () => {
    expect(repoUrl(sources.cn)).toBe("https://github.com/Kengxxiao/ArknightsGameData");
    expect(repoUrl(sources.tw)).toBe("https://github.com/ArknightsAssets/ArknightsGamedata");
  });

  it("is the same page for avatars and devices, which share one repo", () => {
    expect(repoUrl(sources.avatars)).toBe(repoUrl(sources.devices));
  });
});

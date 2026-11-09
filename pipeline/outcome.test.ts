// Whether the data-pipeline step passes (user story 34: a CI failure says which step broke).
import { describe, expect, it } from "vitest";
import { pipelineOutcome } from "./outcome.ts";

describe("data pipeline outcome", () => {
  const missing = {
    stageId: "act4d0_01",
    levelPath: "activities/act4d0/level_act4d0_01",
    reason: "missingFile" as const,
  };

  it("a level file upstream lacks is listed, and the step passes", () => {
    expect(pipelineOutcome([missing], [])).toEqual({
      missing: [missing],
      failures: [],
      exitCode: 0,
    });
  });

  it("a level file that fails to convert fails the step, listed once as a failure", () => {
    const broken = {
      stageId: "main_01-07",
      levelPath: "obt/main/level_main_01-07",
      reason: "missingFile" as const,
    };
    const failure = { levelPath: broken.levelPath, message: "敵人資料庫沒有 enemy_x" };
    expect(pipelineOutcome([missing, broken], [failure])).toEqual({
      missing: [missing],
      failures: [failure],
      exitCode: 1,
    });
  });
});

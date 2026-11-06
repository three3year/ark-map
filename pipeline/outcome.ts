// Whether the data-pipeline step passes: upstream gaps are expected, conversion errors are not.
import type { SkippedStage } from "./stageIndex.ts";

/** A level file that failed to convert. */
export interface ConversionFailure {
  levelPath: string;
  message: string;
}

export interface PipelineOutcome {
  /** Stages left out because upstream has no level file: listed, not an error. */
  missing: SkippedStage[];
  failures: ConversionFailure[];
  /** 1 when any level file failed to convert, so the CI step fails; else 0. */
  exitCode: 0 | 1;
}

/** `skipped` also holds the stages of failed level files; those count as failures only. */
export function pipelineOutcome(
  skipped: SkippedStage[],
  failures: ConversionFailure[],
): PipelineOutcome {
  const failed = new Set(failures.map((f) => f.levelPath));
  return {
    missing: skipped.filter((s) => !failed.has(s.levelPath)),
    failures,
    exitCode: failures.length > 0 ? 1 : 0,
  };
}

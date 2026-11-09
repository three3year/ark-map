import {
  shownLevelFile,
  type ExpansionChoice,
  type StageEntry,
  type Variant,
  type VariantId,
} from "../level/index.ts";

/**
 * What a level page shows: 關卡, 變體 and 實際顯示的關卡檔. 開關狀態, 收起 and 端點篩選 hold for
 * one view only.
 */
export interface LevelView {
  stageId: string;
  variant: VariantId;
  shownFile: string;
}

export function levelView(stage: StageEntry, variant: Variant, choice: ExpansionChoice): LevelView {
  return {
    stageId: stage.id,
    variant: variant.id,
    shownFile: shownLevelFile(stage, variant, choice),
  };
}

export function sameView(a: LevelView | undefined, b: LevelView | undefined): boolean {
  return a?.stageId === b?.stageId && a?.variant === b?.variant && a?.shownFile === b?.shownFile;
}

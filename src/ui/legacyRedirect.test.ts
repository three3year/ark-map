import { describe, expect, it } from "vitest";
import type { StageEntry, Variant, VariantId } from "../level/index.ts";
import { legacyRedirect } from "./legacyRedirect.ts";
import { parseHash, type LevelRoute } from "./route.ts";

const variant = (id: VariantId, sourceStageId: string): Variant => ({
  id,
  sourceStageId,
  levelFile: `${sourceStageId}.json`,
  difficulty: id === "emergency" ? "FOUR_STAR" : "NORMAL",
});

const stages: StageEntry[] = [
  {
    id: "ro4_n_1_1",
    code: "ISW-NO",
    name: "",
    variants: [variant("normal", "ro4_n_1_1"), variant("emergency", "ro4_e_1_1")],
    expansions: [
      { number: 1, levelFile: "r1.json" },
      { number: 2, levelFile: "r2.json" },
    ],
  },
  {
    id: "ro5_n_7_1",
    code: "ISW-NO",
    name: "",
    variants: [variant("normal", "ro5_n_7_1")],
    expansions: [{ number: 2, levelFile: "dlc2.json" }],
  },
];

function redirect(hash: string): LevelRoute | null {
  const route = parseHash(hash);
  if (route.page !== "level") throw new Error(`${hash} is no level link`);
  return legacyRedirect(route, stages);
}

const level = (stageId: string, variant: string | null, expansion: number | null) => ({
  page: "level",
  stageId,
  variant,
  expansion,
});

describe("old links", () => {
  it("a link to a stage that exists stays, whatever its v", () => {
    expect(redirect("#/level/ro4_n_1_1?v=emergency&x=2")).toBeNull();
    expect(redirect("#/level/ro4_n_1_1?v=foo")).toBeNull();
  });

  it("a stage no index lists, moved or not, stays for the not-found message", () => {
    expect(redirect("#/level/ro9_e_1_1")).toBeNull();
  });

  it("an old 緊急作戰 opens its node's 緊急作戰, keeping x", () => {
    expect(redirect("#/level/ro4_e_1_1")).toEqual(level("ro4_n_1_1", "emergency", null));
    expect(redirect("#/level/ro4_e_1_1?x=1")).toEqual(level("ro4_n_1_1", "emergency", 1));
    expect(redirect("#/level/ro4_e_1_1?v=emergency")).toEqual(
      level("ro4_n_1_1", "emergency", null),
    );
  });

  it("an old 緊急作戰 with an unknown v opens its node with that v, for the no-variant message", () => {
    expect(redirect("#/level/ro4_e_1_1?v=foo&x=1")).toEqual(level("ro4_n_1_1", "foo", 1));
  });

  it("replaceN becomes x: the N-th of the node's 內容拓展, over any x", () => {
    expect(redirect("#/level/ro4_n_1_1?v=replace1")).toEqual(level("ro4_n_1_1", null, 1));
    expect(redirect("#/level/ro4_n_1_1?v=replace1&x=2")).toEqual(level("ro4_n_1_1", null, 1));
    expect(redirect("#/level/ro5_n_7_1?v=replace1")).toEqual(level("ro5_n_7_1", null, 2));
    expect(redirect("#/level/ro4_e_1_1?v=replace2")).toEqual(level("ro4_n_1_1", "emergency", 2));
  });

  it("replaceN past the node's 內容拓展 is 原版", () => {
    expect(redirect("#/level/ro4_n_1_1?v=replace3&x=1")).toEqual(level("ro4_n_1_1", null, null));
  });
});

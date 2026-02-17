import { describe, expect, it } from "vitest";
import { getFrequencyRankForWord } from "./frequencyRanks";

describe("getFrequencyRankForWord", () => {
  it("uses the minimum rank between normalized and stem when both exist", () => {
    const ranks = new Map<string, number>([
      ["confusing", 300000],
      ["confuse", 280000],
    ]);

    expect(getFrequencyRankForWord({ normalized: "confusing", stem: "confuse" }, ranks)).toBe(
      280000,
    );
  });

  it("falls back to whichever rank exists", () => {
    const ranks = new Map<string, number>([["prepare", 219311]]);

    expect(getFrequencyRankForWord({ normalized: "prepared", stem: "prepare" }, ranks)).toBe(
      219311,
    );
    expect(getFrequencyRankForWord({ normalized: "prepare", stem: "missing" }, ranks)).toBe(219311);
  });
});

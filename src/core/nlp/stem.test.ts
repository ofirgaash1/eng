import { describe, expect, it } from "vitest";
import { stem } from "./stem";

describe("stem", () => {
  it("handles possessives and contractions", () => {
    expect(stem("cavalry's")).toBe("cavalry");
    expect(stem("squatter's")).toBe("squatter");
    expect(stem("What'd")).toBe("what");
  });

  it("keeps non-suffixed words intact", () => {
    expect(stem("corrugator")).toBe("corrugator");
    expect(stem("disincorporation")).toBe("disincorporation");
    expect(stem("meticulousness")).toBe("meticulousness");
    expect(stem("thready")).toBe("thready");
  });

  it("covers supported english suffix endings", () => {
    const cases: Array<[string, string]> = [
      ["cities", "city"],
      ["running", "runn"],
      ["boggled", "boggl"],
      ["quickly", "quick"],
      ["churches", "churche"],
      ["tractors", "tractor"],
      ["goddess", "goddess"],
      ["kindness", "kindness"],
    ];

    cases.forEach(([input, expected]) => {
      expect(stem(input)).toBe(expected);
    });
  });
});

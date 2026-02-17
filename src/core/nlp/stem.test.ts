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

  it("normalizes common inflections", () => {
    const cases: Array<[string, string]> = [
      ["cities", "city"],
      ["running", "run"],
      ["boggled", "boggle"],
      ["quickly", "quick"],
      ["churches", "church"],
      ["tractors", "tractor"],
      ["goddess", "goddess"],
      ["kindness", "kindness"],
    ];

    cases.forEach(([input, expected]) => {
      expect(stem(input)).toBe(expected);
    });
  });

  it("handles tricky suffix patterns seen in the wild", () => {
    const cases: Array<[string, string]> = [
      ["glossier", "glossy"],
      ["apprised", "apprise"],
      ["hemming", "hem"],
      ["rallied", "rally"],
      ["piddling", "piddle"],
      ["swabbed", "swab"],
      ["mugged", "mug"],
      ["slurring", "slur"],
      ["fumigated", "fumigate"],
      ["roaches", "roach"],
      ["loquacious", "loquacious"],
      ["snogging", "snog"],
      ["boonies", "boonie"],
      ["haunches", "haunch"],
      ["stoked", "stoke"],
      ["strutting", "strut"],
      ["nauseated", "nauseate"],
      ["divulging", "divulg"],
      ["bugging", "bug"],
      ["opposed", "oppose"],
      ["tortured", "torture"],
      ["automatically", "automatic"],
      ["everything's", "everything"],
      ["thieves", "thief"],
      ["cheated", "cheat"],
      ["cheating", "cheat"],
      ["dangled", "dangle"],
      ["mcgarr", "mcgarr"],
      ["greenbay", "greenbay"],
      ["amusing", "amuse"],
      ["oldrich", "oldrich"],
      ["gallows", "gallows"],
      ["ignored", "ignore"],
      ["eating", "eat"],
      ["cruising", "cruise"],
      ["splutters", "splutter"],
      ["gilos", "gilos"],
      ["prepared", "prepare"],
      ["patronise", "patronise"],
      ["decided", "decide"],
      ["something", "something"],
      ["atomized", "atomize"],
      ["calories", "calorie"],
      ["confused", "confuse"],
      ["confusing", "confuse"],
      ["contributing", "contribute"],
      ["succeed", "succeed"],
      ["microlensing", "microlens"],
      ["possibly", "possible"],
      ["overbite", "overbite"],
      ["evolved", "evolve"],
      ["bioengineered", "bioengineer"],
      ["themselves", "themselves"],
      ["brainbox", "brainbox"],
      ["believed", "believe"],
      ["believing", "believe"],
      ["wieden", "wieden"],
      ["disavowal", "disavowal"],
      ["advanced", "advance"],
      ["bedpan", "bedpan"],
      ["gatz", "gatz"],
      ["carved", "carve"],
      ["whining", "whine"],
      ["bifurcated", "bifurcate"],
      ["excited", "excite"],
      ["amazing", "amaze"],
      ["reproduced", "reproduce"],
      ["civilized", "civilize"],
    ];

    cases.forEach(([input, expected]) => {
      expect(stem(input)).toBe(expected);
    });
  });
});

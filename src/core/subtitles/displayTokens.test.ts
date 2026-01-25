import { describe, expect, it } from "vitest";
import { tokenize } from "../nlp/tokenize";
import { parseSrt } from "../parsing/srtParser";
import { buildDisplayTokens } from "./displayTokens";

const SAMPLE_SRT = `1
00:00:14,139 --> 00:00:15,419
[person on speaker] <i>Who are you?</i>

2
00:00:26,151 --> 00:00:27,152
<i>Who are you?</i>

3
00:00:30,697 --> 00:00:31,698
[groans]

4
00:00:36,787 --> 00:00:37,788
[groans]

5
00:00:44,378 --> 00:00:48,090
[static feedback]

6
00:00:49,716 --> 00:00:50,717
Hello?
`;

describe("subtitle display tokens", () => {
  it("strips tags and bracket cues before building display tokens", () => {
    const cues = parseSrt(SAMPLE_SRT);
    expect(cues.map((cue) => cue.rawText)).toEqual(["Who are you?", "Who are you?", "Hello?"]);
    expect(cues.some((cue) => /[<>[\]]/.test(cue.rawText))).toBe(false);

    const firstTokens = buildDisplayTokens(tokenize(cues[0].rawText)).map((token) => token.text);
    expect(firstTokens).toEqual(["Who", "are", "you?"]);

    const lastTokens = buildDisplayTokens(tokenize(cues[2].rawText)).map((token) => token.text);
    expect(lastTokens).toEqual(["Hello?"]);
  });

  it("merges RTL punctuation so it does not render mid-sentence", () => {
    const rtlText = `46
00:03:52,941 --> 00:03:57,070
שאלה ארבע, מה ארוחת הבוקר
?האהובה על מר איגן
`;
    const [cue] = parseSrt(rtlText);
    const tokens = buildDisplayTokens(tokenize(cue.rawText)).map((token) => token.text);
    expect(tokens).toEqual([
      "שאלה",
      "ארבע,",
      "מה",
      "ארוחת",
      "הבוקר?",
      "האהובה",
      "על",
      "מר",
      "איגן",
    ]);
    expect(tokens).not.toContain("?");
  });
});

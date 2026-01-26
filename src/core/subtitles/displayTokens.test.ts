import { describe, expect, it } from "vitest";
import { ITALIC_END, ITALIC_START, parseSrt } from "../parsing/srtParser";
import { buildDisplayTokens, tokenizeWithItalics } from "./displayTokens";

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
  it("strips tags but preserves bracket cues and italics", () => {
    const cues = parseSrt(SAMPLE_SRT);
    const cleanedRaw = cues.map((cue) =>
      cue.rawText.replaceAll(ITALIC_START, "").replaceAll(ITALIC_END, ""),
    );
    expect(cleanedRaw).toEqual([
      "[person on speaker] Who are you?",
      "Who are you?",
      "[groans]",
      "[groans]",
      "[static feedback]",
      "Hello?",
    ]);
    expect(cues.some((cue) => /<[^>]+>/.test(cue.rawText))).toBe(false);

    const firstTokens = buildDisplayTokens(tokenizeWithItalics(cues[0].rawText));
    expect(firstTokens.map((token) => token.text)).toEqual([
      "[person",
      "on",
      "speaker]",
      "Who",
      "are",
      "you?",
    ]);
    expect(firstTokens.slice(0, 3).every((token) => token.italic)).toBe(false);
    expect(firstTokens.slice(3).every((token) => token.italic)).toBe(true);

    const lastTokens = buildDisplayTokens(tokenizeWithItalics(cues[5].rawText)).map(
      (token) => token.text,
    );
    expect(lastTokens).toEqual(["Hello?"]);
  });

  it("merges RTL punctuation so it does not render mid-sentence", () => {
    const rtlText = `46
00:03:52,941 --> 00:03:57,070
שאלה ארבע, מה ארוחת הבוקר
?האהובה על מר איגן
`;
    const [cue] = parseSrt(rtlText);
    const tokens = buildDisplayTokens(tokenizeWithItalics(cue.rawText)).map(
      (token) => token.text,
    );
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

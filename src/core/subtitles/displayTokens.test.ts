import { describe, expect, it } from "vitest";
import { ITALIC_END, ITALIC_START, parseSrt } from "../parsing/srtParser";
import { buildDisplayLines, buildDisplayTokens, tokenizeWithItalics } from "./displayTokens";

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
    expect(firstTokens.some((token) => /[\u0001\u0002]/.test(token.text))).toBe(false);
    expect(firstTokens.slice(0, 3).every((token) => token.italic)).toBe(false);
    expect(firstTokens.slice(3).every((token) => token.italic)).toBe(true);
    expect(firstTokens.filter((token) => token.italic).map((token) => token.text)).toEqual([
      "Who",
      "are",
      "you?",
    ]);
  });

  it("keeps LTR-compensated RTL punctuation within the same subtitle line", () => {
    const rtlText = `138
00:06:10,950 --> 00:06:14,300
"כולל התקליט "החלום של מונק
.חתום ע"י תלוניוס בעצמו`;
    const [cue] = parseSrt(rtlText);
    const lines = buildDisplayLines(cue.rawText).map((line) => line.map((token) => token.text));

    expect(lines).toEqual([
      ["כולל", "התקליט", "\"החלום", "של", "מונק\""],
      ["חתום", "ע\"י", "תלוניוס", "בעצמו."],
    ]);
  });

  it("normalizes compensated trailing quotes and dialogue dashes in RTL lines", () => {
    const rtlText = `99
00:05:00,440 --> 00:05:03,480
טקילה "קורבו"? -טקילה
.רבולוסיון, סילבר", בלי ליים"`;
    const [cue] = parseSrt(rtlText);
    const lines = buildDisplayLines(cue.rawText).map((line) => line.map((token) => token.text));

    expect(lines).toEqual([
      ["טקילה", "\"קורבו\"?", "-טקילה"],
      ["\"רבולוסיון,", "סילבר\",", "בלי", "ליים."],
    ]);
  });
});

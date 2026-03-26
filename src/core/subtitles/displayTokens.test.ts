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

const COMPENSATED_RTL_SRT = `138
00:06:10,950 --> 00:06:14,300
"\u05db\u05d5\u05dc\u05dc \u05d4\u05ea\u05e7\u05dc\u05d9\u05d8 "\u05d4\u05d7\u05dc\u05d5\u05dd \u05e9\u05dc \u05de\u05d5\u05e0\u05e7
.\u05d7\u05ea\u05d5\u05dd \u05e2"\u05d9 \u05ea\u05dc\u05d5\u05e0\u05d9\u05d5\u05e1 \u05d1\u05e2\u05e6\u05de\u05d5`;

const TRAILING_QUOTES_RTL_SRT = `99
00:05:00,440 --> 00:05:03,480
\u05d8\u05e7\u05d9\u05dc\u05d4 "\u05e7\u05d5\u05e8\u05d1\u05d5"? -\u05d8\u05e7\u05d9\u05dc\u05d4
.\u05e8\u05d1\u05d5\u05dc\u05d5\u05e1\u05d9\u05d5\u05df, \u05e1\u05d9\u05dc\u05d1\u05e8", \u05d1\u05dc\u05d9 \u05dc\u05d9\u05d9\u05dd"`;

const MIXED_EDGE_QUOTES_RTL_SRT = `190
00:11:28,250 --> 00:11:31,539
\u05db\u05e8\u05d9\u05e1 \u05d1\u05d8\u05d5\u05d7 \u05e9\u05d4\u05d5\u05d0 \u05d4\u05e1\u05e4\u05d5\u05e8\u05d8\u05d0\u05d9
,\u0027\u05d4\u05db\u05d9 \u05d2\u05e8\u05d5\u05e2 \u05d1\u05db\u05dc \u05e9\u05db\u05d1\u05ea \u05db\u05d9\u05ea\u05d5\u05ea \u05d7"`;

const RTL_CURRENCY_AMOUNT_SRT = `347
00:22:26,210 --> 00:22:30,070
"\u05d0\u05ea\u05d4 \u05d7\u05d9\u05d9\u05d1 \u05dc"\u05de\u05e8\u05e7\u05d8 \u05e1\u05e7\u05d9\u05d5\u05e8\u05d9\u05d8\u05d9
.$750,000`;

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
    const [cue] = parseSrt(COMPENSATED_RTL_SRT);
    const lines = buildDisplayLines(cue.rawText).map((line) => line.map((token) => token.text));

    expect(lines).toEqual([
      [
        "\u05db\u05d5\u05dc\u05dc",
        "\u05d4\u05ea\u05e7\u05dc\u05d9\u05d8",
        "\"\u05d4\u05d7\u05dc\u05d5\u05dd",
        "\u05e9\u05dc",
        "\u05de\u05d5\u05e0\u05e7\"",
      ],
      [
        "\u05d7\u05ea\u05d5\u05dd",
        "\u05e2\"\u05d9",
        "\u05ea\u05dc\u05d5\u05e0\u05d9\u05d5\u05e1",
        "\u05d1\u05e2\u05e6\u05de\u05d5.",
      ],
    ]);
  });

  it("normalizes compensated trailing quotes and dialogue dashes in RTL lines", () => {
    const [cue] = parseSrt(TRAILING_QUOTES_RTL_SRT);
    const lines = buildDisplayLines(cue.rawText).map((line) => line.map((token) => token.text));

    expect(lines).toEqual([
      [
        "\u05d8\u05e7\u05d9\u05dc\u05d4",
        "\"\u05e7\u05d5\u05e8\u05d1\u05d5\"?",
        "-\u05d8\u05e7\u05d9\u05dc\u05d4",
      ],
      [
        "\"\u05e8\u05d1\u05d5\u05dc\u05d5\u05e1\u05d9\u05d5\u05df,",
        "\u05e1\u05d9\u05dc\u05d1\u05e8\",",
        "\u05d1\u05dc\u05d9",
        "\u05dc\u05d9\u05d9\u05dd.",
      ],
    ]);
  });

  it("keeps mixed compensated quote clusters attached in RTL lines", () => {
    const [cue] = parseSrt(MIXED_EDGE_QUOTES_RTL_SRT);
    const lines = buildDisplayLines(cue.rawText).map((line) => line.map((token) => token.text));

    expect(lines).toEqual([
      [
        "\u05db\u05e8\u05d9\u05e1",
        "\u05d1\u05d8\u05d5\u05d7",
        "\u05e9\u05d4\u05d5\u05d0",
        "\u05d4\u05e1\u05e4\u05d5\u05e8\u05d8\u05d0\u05d9",
      ],
      [
        "\"\u05d4\u05db\u05d9",
        "\u05d2\u05e8\u05d5\u05e2",
        "\u05d1\u05db\u05dc",
        "\u05e9\u05db\u05d1\u05ea",
        "\u05db\u05d9\u05ea\u05d5\u05ea",
        "\u05d7,\u0027",
      ],
    ]);
  });

  it("keeps compensated currency amounts readable in RTL lines", () => {
    const [cue] = parseSrt(RTL_CURRENCY_AMOUNT_SRT);
    const lines = buildDisplayLines(cue.rawText).map((line) => line.map((token) => token.text));

    expect(lines).toEqual([
      [
        "\u05d0\u05ea\u05d4",
        "\u05d7\u05d9\u05d9\u05d1",
        "\u05dc\"\u05de\u05e8\u05e7\u05d8",
        "\u05e1\u05e7\u05d9\u05d5\u05e8\u05d9\u05d8\u05d9\"",
      ],
      ["$750,000."],
    ]);
  });
});

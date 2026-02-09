import { describe, expect, it } from "vitest";
import { parseSrt } from "./srtParser";

describe("parseSrt", () => {
  it("parses standard SRT blocks", () => {
    const input = `1
00:00:01,000 --> 00:00:02,500
Hello there.

2
00:00:03,000 --> 00:00:04,100
General Kenobi!`;

    const cues = parseSrt(input);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({
      index: 1,
      startMs: 1000,
      endMs: 2500,
      rawText: "Hello there.",
    });
  });

  it("parses cues even when the numeric index line is missing", () => {
    const input = `00:00:10,000 --> 00:00:11,000
No index line`;

    const cues = parseSrt(input);
    expect(cues).toHaveLength(1);
    expect(cues[0]?.startMs).toBe(10000);
    expect(cues[0]?.endMs).toBe(11000);
    expect(cues[0]?.rawText).toBe("No index line");
  });

  it("ignores non-SRT content instead of creating fake zero-time cues", () => {
    const input = `{
  "version": 1,
  "data": { "words": [] }
}`;

    expect(parseSrt(input)).toEqual([]);
  });
});

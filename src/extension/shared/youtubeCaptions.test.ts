import { describe, expect, it } from "vitest";
import {
  buildJson3CaptionsUrl,
  chooseBestCaptionTrack,
  parseYouTubeJson3Captions,
} from "./youtubeCaptions";

describe("youtube caption helpers", () => {
  it("prefers manual english tracks over auto captions", () => {
    const track = chooseBestCaptionTrack([
      {
        baseUrl: "https://www.youtube.com/api/timedtext?v=1&lang=en",
        languageCode: "en",
        kind: "asr",
        name: "English (auto-generated)",
      },
      {
        baseUrl: "https://www.youtube.com/api/timedtext?v=1&lang=en-US",
        languageCode: "en-US",
        name: "English",
      },
    ]);

    expect(track?.languageCode).toBe("en-US");
  });

  it("adds json3 output to the caption url", () => {
    const url = buildJson3CaptionsUrl("https://www.youtube.com/api/timedtext?v=1&lang=en");
    expect(new URL(url).searchParams.get("fmt")).toBe("json3");
  });

  it("parses json3 caption events into cues", () => {
    const cues = parseYouTubeJson3Captions({
      events: [
        {
          tStartMs: 1500,
          dDurationMs: 1200,
          segs: [{ utf8: "Hello " }, { utf8: "world" }],
        },
        {
          tStartMs: 3200,
          dDurationMs: 800,
          segs: [{ utf8: "\n" }],
        },
      ],
    });

    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({
      index: 0,
      startMs: 1500,
      endMs: 2700,
      rawText: "Hello world",
    });
    expect(cues[0].tokens?.map((token) => token.text)).toEqual(["Hello", "world"]);
  });
});

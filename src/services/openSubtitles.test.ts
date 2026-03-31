import { describe, expect, it, vi } from "vitest";
import {
  buildOpenSubtitlesSearchQueries,
  buildPrefixedSubtitleFileName,
  ensureSrtFileName,
  pickMostDownloadedSubtitle,
  withOpenSubtitlesApiKeyFallback,
  type OpenSubtitlesItem,
} from "./openSubtitles";

describe("openSubtitles helpers", () => {
  it("keeps or normalizes subtitle file names to .srt", () => {
    expect(ensureSrtFileName("episode.srt", "1")).toBe("episode.srt");
    expect(ensureSrtFileName("episode.zip", "1")).toBe("episode.srt");
    expect(ensureSrtFileName("episode", "1")).toBe("episode.srt");
  });

  it("builds prefixed fallback names from the video file name", () => {
    expect(buildPrefixedSubtitleFileName("eng", "Show.S01E01.mkv")).toBe(
      "eng.Show.S01E01.srt",
    );
    expect(buildPrefixedSubtitleFileName("heb", "movie.mp4")).toBe("heb.movie.srt");
  });

  it("builds progressively simpler fallback search queries from noisy video names", () => {
    expect(
      buildOpenSubtitlesSearchQueries(
        "Homeland (2011) - S02E05 - Q&A (1080p BluRay x265 Silence).mkv",
      ),
    ).toEqual([
      "Homeland (2011) - S02E05 - Q&A (1080p BluRay x265 Silence)",
      "Homeland - S02E05 - Q&A (1080p BluRay x265 Silence)",
      "Homeland - S02E05 - Q&A",
      "Homeland - S02E05",
      "Homeland S02E05",
    ]);
  });

  it("picks the searchable result with the highest download count", () => {
    const items: OpenSubtitlesItem[] = [
      {
        id: "low",
        attributes: {
          language: "en",
          download_count: 12,
          files: [{ file_id: 1, file_name: "low.srt" }],
        },
      },
      {
        id: "missing-file",
        attributes: {
          language: "en",
          download_count: 999,
          files: [],
        },
      },
      {
        id: "high",
        attributes: {
          language: "en",
          download_count: 55,
          files: [{ file_id: 2, file_name: "high.srt" }],
        },
      },
    ];

    expect(pickMostDownloadedSubtitle(items)?.id).toBe("high");
  });

  it("falls back across API keys until one works", async () => {
    const action = vi.fn(async (apiKey: string) => {
      if (apiKey === "first") {
        throw new Error("first failed");
      }
      return "ok";
    });

    await expect(
      withOpenSubtitlesApiKeyFallback(["first", "second"], action),
    ).resolves.toBe("ok");
    expect(action).toHaveBeenNthCalledWith(1, "first");
    expect(action).toHaveBeenNthCalledWith(2, "second");
  });
});

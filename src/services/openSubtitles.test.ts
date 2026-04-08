import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildOpenSubtitlesSearchQueries,
  buildPrefixedSubtitleFileName,
  ensureSrtFileName,
  isBlockedOpenSubtitlesItem,
  pickMostDownloadedSubtitle,
  searchOpenSubtitlesSubtitlesWithFallback,
  withOpenSubtitlesApiKeyFallback,
  type OpenSubtitlesItem,
} from "./openSubtitles";

describe("openSubtitles helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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
      "Homeland (2011) - S02E05 - Q&A",
      "Homeland - S02E05 - Q&A (1080p BluRay x265 Silence)",
      "Homeland - S02E05 - Q&A",
      "Homeland - S02E05",
      "Homeland S02E05",
    ]);
  });

  it("strips release metadata from TV filenames without dropping the show and episode", () => {
    expect(
      buildOpenSubtitlesSearchQueries(
        "Homeland S03E03 Tower of David.1080p.WEB-DL.DD5.1.x265-n0m1",
      ),
    ).toEqual([
      "Homeland S03E03 Tower of David 1080p WEB-DL DD5 1 x265-n0m1",
      "Homeland S03E03 Tower of David",
      "Homeland - S03E03",
      "Homeland S03E03",
    ]);
  });

  it("keeps movie title and year when stripping release metadata", () => {
    expect(buildOpenSubtitlesSearchQueries("The.Matrix.1999.1080p.BluRay.x264-YIFY.mkv")).toEqual([
      "The Matrix 1999 1080p BluRay x264-YIFY",
      "The Matrix 1999",
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

  it("blocks IMMERSE releases from selection", () => {
    const blockedItem: OpenSubtitlesItem = {
      id: "blocked",
      attributes: {
        language: "en",
        release: "Homeland.S03E09.720p.HDTV.x264-IMMERSE",
        download_count: 999,
        files: [{ file_id: 1, file_name: "Homeland.S03E09.720p.HDTV.x264-IMMERSE.srt" }],
      },
    };
    const allowedItem: OpenSubtitlesItem = {
      id: "allowed",
      attributes: {
        language: "en",
        download_count: 50,
        files: [{ file_id: 2, file_name: "Homeland.S03E09.720p.HDTV.x264-OTHER.srt" }],
      },
    };

    expect(isBlockedOpenSubtitlesItem(blockedItem)).toBe(true);
    expect(isBlockedOpenSubtitlesItem(allowedItem)).toBe(false);
    expect(pickMostDownloadedSubtitle([blockedItem, allowedItem])?.id).toBe("allowed");
  });

  it("searches every fallback query and deduplicates returned subtitles", async () => {
    const exactItem: OpenSubtitlesItem = {
      id: "exact",
      attributes: {
        language: "en",
        download_count: 12,
        files: [{ file_id: 1, file_name: "exact.srt" }],
      },
    };
    const sharedItem: OpenSubtitlesItem = {
      id: "shared",
      attributes: {
        language: "en",
        download_count: 20,
        files: [{ file_id: 2, file_name: "shared.srt" }],
      },
    };
    const broadItem: OpenSubtitlesItem = {
      id: "broad",
      attributes: {
        language: "en",
        download_count: 50,
        files: [{ file_id: 3, file_name: "broad.srt" }],
      },
    };

    const payloadsByQuery = new Map<string, OpenSubtitlesItem[]>([
      [
        "Homeland S03E03 Tower of David 1080p WEB-DL DD5 1 x265-n0m1",
        [exactItem, sharedItem],
      ],
      ["Homeland S03E03 Tower of David", [sharedItem]],
      ["Homeland - S03E03", [broadItem]],
      ["Homeland S03E03", [broadItem]],
    ]);

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const query = url.searchParams.get("query") ?? "";
      const data = payloadsByQuery.get(query) ?? [];
      expect(url.searchParams.get("order_by")).toBe("download_count");

      return new Response(
        JSON.stringify({
          data,
          total_count: data.length,
        }),
        {
          status: 200,
          statusText: "OK",
          headers: { "Content-Type": "application/json" },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchOpenSubtitlesSubtitlesWithFallback({
      apiKey: "key",
      query: "Homeland S03E03 Tower of David.1080p.WEB-DL.DD5.1.x265-n0m1",
      language: "en",
    });

    expect(result.queries).toEqual(Array.from(payloadsByQuery.keys()));
    expect(result.items.map((item) => item.id)).toEqual(["exact", "shared", "broad"]);
    expect(result.totalCount).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("filters blocked IMMERSE results from fallback search results", async () => {
    const blockedItem: OpenSubtitlesItem = {
      id: "blocked",
      attributes: {
        language: "en",
        download_count: 999,
        files: [{ file_id: 1, file_name: "Homeland.S03E09.720p.HDTV.x264-IMMERSE.srt" }],
      },
    };
    const allowedItem: OpenSubtitlesItem = {
      id: "allowed",
      attributes: {
        language: "en",
        download_count: 10,
        files: [{ file_id: 2, file_name: "Homeland.S03E09.720p.HDTV.x264-OTHER.srt" }],
      },
    };

    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          data: [blockedItem, allowedItem],
          total_count: 2,
        }),
        {
          status: 200,
          statusText: "OK",
          headers: { "Content-Type": "application/json" },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchOpenSubtitlesSubtitlesWithFallback({
      apiKey: "key",
      query: "Homeland.S03E09.720p.HDTV.x264-IMMERSE",
      language: "en",
    });

    expect(result.items.map((item) => item.id)).toEqual(["allowed"]);
    expect(result.totalCount).toBe(1);
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

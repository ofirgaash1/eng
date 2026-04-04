import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("googleTranslate", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("requests Hebrew word translations and caches repeat lookups", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            translations: [
              {
                translatedText: "shalom &amp; bye",
                detectedSourceLanguage: "en",
              },
            ],
          },
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const service = await import("./googleTranslate");
    const first = await service.translateEnglishWordToHebrew("Hello");
    const second = await service.translateEnglishWordToHebrew("Hello");

    expect(first).toEqual({
      text: "shalom & bye",
      detectedSourceLanguage: "en",
    });
    expect(second.text).toBe("shalom & bye");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain("https://translation.googleapis.com/language/translate/v2");
    expect(String(url)).toContain("key=AIzaSyCL1slhaZAlAypXizqk-ZWL7Y86Ca8euko");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      q: "Hello",
      source: "en",
      target: "he",
      format: "text",
    });
  });

  it("surfaces API errors from Google", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: "The request is blocked.",
          },
        }),
        {
          status: 403,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const service = await import("./googleTranslate");

    await expect(service.translateEnglishCueToHebrew("Hello there")).rejects.toThrow("blocked");
  });
});

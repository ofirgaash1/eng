import { expect, test } from "@playwright/test";
import { resolve } from "node:path";

const contentScriptPath = resolve(process.cwd(), "dist-extension/content.js");

test("renders clickable tokens from the YouTube caption window DOM", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.setContent(`
    <!doctype html>
    <html>
      <head>
        <style>
          body {
            margin: 0;
            background: #111827;
          }

          #container {
            position: relative;
            width: 900px;
            margin: 32px auto;
          }

          video {
            display: block;
            width: 900px;
            height: 506px;
            background: black;
          }

          #ytp-caption-window-container {
            position: absolute;
            inset: 0;
            pointer-events: none;
          }

          .caption-window {
            position: absolute;
            left: 50%;
            bottom: 9%;
            width: 590px;
            min-height: 54px;
            margin-left: -295px;
          }

          .captions-text,
          .caption-visual-line {
            display: block;
          }

          .ytp-caption-segment {
            display: inline-block;
            font-size: 22px;
            color: white;
            background: rgba(8, 8, 8, 0.75);
            white-space: pre-wrap;
          }
        </style>
      </head>
      <body>
        <div id="container">
          <video></video>
          <div id="ytp-caption-window-container">
            <div
              class="caption-window ytp-caption-window-bottom ytp-caption-window-rollup"
              id="caption-window-1"
              dir="ltr"
              lang="en"
            >
              <span class="captions-text">
                <span class="caption-visual-line">
                  <span class="ytp-caption-segment">lovely. How are you?</span>
                </span>
                <span class="caption-visual-line">
                  <span class="ytp-caption-segment">&gt;&gt; How's today been? Has it been good fun?</span>
                </span>
              </span>
            </div>
          </div>
        </div>
      </body>
    </html>
  `);

  await page.evaluate(() => {
    const listeners: Array<(message: { type?: string; words?: unknown[] }) => void> = [];
    const savedWords: Array<{ normalized: string; stem: string }> = [];

    const runtime = {
      async sendMessage(message: { type: string; token?: { normalized: string; stem: string } }) {
        if (message.type === "GET_VOCABULARY_STATE") {
          return { ok: true, data: { words: savedWords } };
        }

        if (message.type === "SAVE_WORD" && message.token) {
          savedWords.push({
            normalized: message.token.normalized,
            stem: message.token.stem,
          });
          const payload = { type: "WORDS_UPDATED", words: [...savedWords] };
          listeners.forEach((listener) => listener(payload));
          return { ok: true, data: { words: [...savedWords] } };
        }

        if (message.type === "TRANSLATE_WORD") {
          return { ok: true, data: { text: "translated" } };
        }

        return { ok: true, data: {} };
      },
      onMessage: {
        addListener(listener: (message: { type?: string; words?: unknown[] }) => void) {
          listeners.push(listener);
        },
      },
      getURL() {
        return "data:text/javascript,";
      },
    };

    Object.assign(window, {
      chrome: { runtime },
      open: () => null,
    });
  });

  await page.addScriptTag({ path: contentScriptPath });

  await expect
    .poll(() =>
      page.evaluate(() => {
        const host = document.querySelector(".swt-host");
        if (!(host instanceof HTMLDivElement) || !host.shadowRoot) {
          return 0;
        }

        return host.shadowRoot.querySelectorAll(".swt-token-text").length;
      }),
    )
    .toBeGreaterThan(0);

  const overlayTexts = await page.evaluate(() => {
    const host = document.querySelector(".swt-host");
    if (!(host instanceof HTMLDivElement) || !host.shadowRoot) {
      return [];
    }

    return Array.from(host.shadowRoot.querySelectorAll(".swt-token-text")).map((node) =>
      (node.textContent ?? "").trim(),
    );
  });

  expect(overlayTexts).toContain("good");
  expect(overlayTexts.some((text) => text.startsWith("fun"))).toBe(true);

  await expect
    .poll(() =>
      page.evaluate(() => {
        const host = document.querySelector(".swt-host") as HTMLDivElement | null;
        if (!host?.shadowRoot) {
          return 0;
        }

        const tops = Array.from(host.shadowRoot.querySelectorAll(".swt-token"))
          .map((node) => Math.round(node.getBoundingClientRect().top))
          .filter((value, index, all) => all.indexOf(value) === index);

        return tops.length;
      }),
    )
    .toBe(2);

  await page.evaluate(() => {
    const host = document.querySelector(".swt-host") as HTMLDivElement | null;
    if (!host?.shadowRoot) {
      return;
    }

    const button = Array.from(host.shadowRoot.querySelectorAll(".swt-token")).find((node) => {
      const text = node.querySelector(".swt-token-text")?.textContent?.trim();
      return text === "good";
    }) as HTMLButtonElement | undefined;

    button?.click();
  });

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const host = document.querySelector(".swt-host") as HTMLDivElement | null;
        const active = host?.shadowRoot?.querySelector(".swt-token--exact .swt-token-text");
        return active?.textContent ?? null;
      }),
    )
    .toBe("good");

  await expect
    .poll(() =>
      page.evaluate(() => {
        const captionWindow = document.querySelector(
          "#ytp-caption-window-container .caption-window",
        ) as HTMLElement | null;
        return captionWindow?.style.opacity ?? "";
      }),
    )
    .toBe("0");
});

test("keeps the sentence background behind the full visible line", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.setContent(`
    <!doctype html>
    <html>
      <head>
        <style>
          body {
            margin: 0;
            background: #111827;
          }

          #container {
            position: relative;
            width: 900px;
            margin: 32px auto;
          }

          video {
            display: block;
            width: 900px;
            height: 506px;
            background: black;
          }

          #ytp-caption-window-container {
            position: absolute;
            inset: 0;
            pointer-events: none;
          }

          .caption-window {
            position: absolute;
            left: 50%;
            bottom: 9%;
            width: 360px;
            min-height: 54px;
            margin-left: -180px;
            text-align: left;
          }

          .captions-text,
          .caption-visual-line {
            display: block;
          }

          .ytp-caption-segment {
            display: inline-block;
            font-size: 22px;
            color: white;
            background: rgba(8, 8, 8, 0.75);
            white-space: pre-wrap;
          }
        </style>
      </head>
      <body>
        <div id="container">
          <video></video>
          <div id="ytp-caption-window-container">
            <div
              class="caption-window ytp-caption-window-bottom ytp-caption-window-rollup"
              id="caption-window-1"
              dir="ltr"
              lang="en"
            >
              <span class="captions-text">
                <span class="caption-visual-line">
                  <span class="ytp-caption-segment">This is a deliberately longer subtitle line with trailing words that used to escape the sentence background.</span>
                </span>
              </span>
            </div>
          </div>
        </div>
      </body>
    </html>
  `);

  await page.evaluate(() => {
    const listeners: Array<(message: { type?: string; words?: unknown[] }) => void> = [];

    const runtime = {
      async sendMessage() {
        return { ok: true, data: { words: [] } };
      },
      onMessage: {
        addListener(listener: (message: { type?: string; words?: unknown[] }) => void) {
          listeners.push(listener);
        },
      },
      getURL() {
        return "data:text/javascript,";
      },
    };

    Object.assign(window, {
      chrome: { runtime },
      open: () => null,
    });
  });

  await page.addScriptTag({ path: contentScriptPath });

  await expect
    .poll(() =>
      page.evaluate(() => {
        const host = document.querySelector(".swt-host") as HTMLDivElement | null;
        return host?.shadowRoot?.querySelectorAll(".swt-token").length ?? 0;
      }),
    )
    .toBeGreaterThan(0);

  const coverage = await page.evaluate(() => {
    const host = document.querySelector(".swt-host") as HTMLDivElement | null;
    if (!host?.shadowRoot) {
      return null;
    }

    const lineContent = host.shadowRoot.querySelector(".swt-line-content") as HTMLDivElement | null;
    const tokenRects = Array.from(host.shadowRoot.querySelectorAll(".swt-token")).map((node) =>
      node.getBoundingClientRect(),
    );
    if (!lineContent || tokenRects.length === 0) {
      return null;
    }

    const lineRect = lineContent.getBoundingClientRect();
    const lastTokenRight = Math.max(...tokenRects.map((rect) => rect.right));
    return {
      lineRight: lineRect.right,
      lastTokenRight,
    };
  });

  expect(coverage).not.toBeNull();
  expect(coverage!.lineRight).toBeGreaterThanOrEqual(coverage!.lastTokenRight - 1);
});

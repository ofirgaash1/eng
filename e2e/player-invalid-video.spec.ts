import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";

test("invalid mkv does not trigger endless reload churn", async ({ page }) => {
  await page.goto("/");

  const tempFile = path.join(os.tmpdir(), `invalid-${Date.now()}.mkv`);
  fs.writeFileSync(tempFile, "not a real mkv");

  await page.setInputFiles('label:has-text("Load video") input[type="file"]', tempFile);

  const samples: Array<{
    tick: number;
    timerDelayMs: number;
    readyState: number | null;
    networkState: number | null;
    errorCode: number | null;
    src: string | null;
  }> = [];

  for (let tick = 0; tick < 15; tick += 1) {
    await page.waitForTimeout(750);
    const sample = await page.evaluate(async () => {
      const timerDelayMs = await new Promise<number>((resolve) => {
        const start = performance.now();
        setTimeout(() => resolve(performance.now() - start), 0);
      });
      const video = document.querySelector("video");
      return {
        timerDelayMs,
        readyState: video ? video.readyState : null,
        networkState: video ? video.networkState : null,
        errorCode: video?.error?.code ?? null,
        src: video ? video.currentSrc : null,
      };
    });
    samples.push({ tick, ...sample });
  }

  const srcDistinctCount = new Set(samples.map((sample) => sample.src)).size;
  const errorCodes = new Set(samples.map((sample) => sample.errorCode));

  fs.unlinkSync(tempFile);

  expect(errorCodes.has(4)).toBe(true);
  expect(srcDistinctCount).toBeLessThanOrEqual(2);
});

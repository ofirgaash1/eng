import path from "node:path";
import { expect, test } from "@playwright/test";

test("video remains loaded after navigating to settings and back", async ({ page }) => {
  await page.goto("/");

  const videoFile = path.resolve(process.cwd(), "15seconds.mp4");
  await page.setInputFiles('label:has-text("Load video") input[type="file"]', videoFile);

  const videoLoadLabel = page.locator('label:has-text("Load video")');
  await expect(videoLoadLabel.getByText("Current: 15seconds.mp4")).toBeVisible();
  await page.waitForTimeout(200);

  await page.getByRole("link", { name: "Settings" }).click();
  await page.waitForTimeout(500);
  await expect(page.getByRole("heading", { name: "Subtitle Appearance" })).toBeVisible();
  await expect(page.getByText("Export everything")).toBeVisible();

  await page.reload();
  await page.waitForTimeout(500);
  await expect(page.getByRole("heading", { name: "Subtitle Appearance" })).toBeVisible();

  const heapSamples: Array<{ label: string; usedJSHeapSize: number | null }> = [];
  const sampleHeap = async (label: string) => {
    const usedHeap = await page.evaluate(() => {
      const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
      return memory?.usedJSHeapSize ?? null;
    });
    heapSamples.push({ label, usedJSHeapSize: usedHeap });
  };

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const cdpSamples: Array<{
    label: string;
    JSHeapUsedSize?: number;
    JSHeapTotalSize?: number;
    Nodes?: number;
    Documents?: number;
  }> = [];
  const sampleCdp = async (label: string) => {
    const { metrics } = await cdp.send("Performance.getMetrics");
    const metric = Object.fromEntries(metrics.map((entry) => [entry.name, entry.value])) as Record<
      string,
      number
    >;
    cdpSamples.push({
      label,
      JSHeapUsedSize: metric.JSHeapUsedSize,
      JSHeapTotalSize: metric.JSHeapTotalSize,
      Nodes: metric.Nodes,
      Documents: metric.Documents,
    });
  };

  const clickNav = async (name: string, assert: () => Promise<void>) => {
    await sampleHeap(`before:${name}`);
    await sampleCdp(`before:${name}`);
    await page.getByRole("link", { name }).click();
    await page.waitForTimeout(500);
    await assert();
    await sampleHeap(`after:${name}`);
    await sampleCdp(`after:${name}`);
  };

  const assertPlayer = async () => {
    await expect(videoLoadLabel).toBeVisible();
    await expect(videoLoadLabel.getByText("Current: 15seconds.mp4")).toBeVisible();
    await expect(videoLoadLabel.getByText("Current: None")).toHaveCount(0);
    const videoState = await page.evaluate(() => {
      const video = document.querySelector("video");
      if (!video) return null;
      return {
        currentSrc: video.currentSrc,
        src: video.getAttribute("src"),
        duration: video.duration,
        readyState: video.readyState,
        networkState: video.networkState,
      };
    });
    console.log("videoState", videoState);
    const blobInfo = await page.evaluate(async () => {
      const video = document.querySelector("video");
      if (!video?.currentSrc) return null;
      try {
        const response = await fetch(video.currentSrc);
        const blob = await response.blob();
        return { ok: response.ok, size: blob.size, type: blob.type };
      } catch (error) {
        return { ok: false, error: String(error) };
      }
    });
    console.log("videoBlobInfo", blobInfo);
    await expect(page.getByText("00:00 / --:--")).toHaveCount(0);
  };

  const assertSettings = async () => {
    await expect(page.getByRole("heading", { name: "Subtitle Appearance" })).toBeVisible();
  };

  await assertSettings();
  await clickNav("Player", assertPlayer);
  await clickNav("Words", async () => {
    await expect(page.getByRole("heading", { name: "Unknown Words" })).toBeVisible();
  });
  await clickNav("Player", assertPlayer);
  await clickNav("Quotes", async () => {
    await expect(page.getByRole("heading", { name: "Subtitle sources" })).toBeVisible();
  });
  await clickNav("Player", assertPlayer);
  await clickNav("Find Subs", async () => {
    await expect(page.getByRole("heading", { name: /Find subtitles/i })).toBeVisible();
  });
  await clickNav("Player", assertPlayer);
  await clickNav("?", async () => {
    await expect(page.getByTitle("Tutorial")).toBeVisible();
  });
  await clickNav("Player", assertPlayer);

  expect(heapSamples.length).toBeGreaterThan(0);
  for (const sample of heapSamples) {
    if (sample.usedJSHeapSize !== null) {
      expect(Number.isFinite(sample.usedJSHeapSize)).toBe(true);
      expect(sample.usedJSHeapSize).toBeGreaterThan(0);
    }
  }
  console.log("heapSamples", heapSamples);
  console.log("cdpSamples", cdpSamples);

  const afterSamples = cdpSamples.filter((sample) => sample.label.startsWith("after:"));
  const nodeCounts = afterSamples
    .map((sample) => sample.Nodes)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (nodeCounts.length >= 3) {
    const growsEveryStep = nodeCounts.every((value, index) =>
      index === 0 ? true : value >= nodeCounts[index - 1],
    );
    if (growsEveryStep) {
      const totalIncrease = nodeCounts[nodeCounts.length - 1] - nodeCounts[0];
      expect(totalIncrease).toBe(0);
    }
  }

  await expect(videoLoadLabel).toBeVisible();
  await expect(videoLoadLabel.getByText("Current: 15seconds.mp4")).toBeVisible();
  await expect(videoLoadLabel.getByText("Current: None")).toHaveCount(0);
});

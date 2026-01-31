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

  await page.getByRole("link", { name: "Player" }).click();
  await page.waitForTimeout(500);
  await expect(videoLoadLabel).toBeVisible();
  await expect(videoLoadLabel.getByText("Current: 15seconds.mp4")).toBeVisible();
  await expect(videoLoadLabel.getByText("Current: None")).toHaveCount(0);
});

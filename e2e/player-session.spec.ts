import path from "node:path";
import { expect, test } from "@playwright/test";

test("video remains loaded after navigating to settings and back", async ({ page }) => {
  await page.goto("/");

  const videoFile = path.resolve(process.cwd(), "15seconds.mp4");
  await page.setInputFiles('label:has-text("Load video") input[type="file"]', videoFile);

  await expect(page.getByText("Current: 15seconds.mp4")).toBeVisible();
  await page.waitForTimeout(200);

  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Subtitle Appearance" })).toBeVisible();

  await page.getByRole("link", { name: "Player" }).click();
  await expect(page.getByText("Current: 15seconds.mp4")).toBeVisible();
});

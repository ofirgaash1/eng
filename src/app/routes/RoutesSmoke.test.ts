import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type PageSpec = {
  name: string;
  relativePath: string;
  marker: string;
};

const pages: PageSpec[] = [
  {
    name: "PlayerPage",
    relativePath: "src/app/routes/PlayerPage.tsx",
    marker: "Load video",
  },
  {
    name: "WordsPage",
    relativePath: "src/app/routes/WordsPage.tsx",
    marker: "Unknown Words",
  },
  {
    name: "QuotesPage",
    relativePath: "src/app/routes/QuotesPage.tsx",
    marker: "Quote contexts",
  },
  {
    name: "StatsPage",
    relativePath: "src/app/routes/StatsPage.tsx",
    marker: "Unknown words saved",
  },
  {
    name: "SettingsPage",
    relativePath: "src/app/routes/SettingsPage.tsx",
    marker: "Subtitle Appearance",
  },
  {
    name: "VlsubPage",
    relativePath: "src/app/routes/VlsubPage.tsx",
    marker: "VLSub Web",
  },
];

describe("page smoke markers", () => {
  pages.forEach((page) => {
    it(`keeps ${page.name} present`, async () => {
      const filePath = resolve(process.cwd(), page.relativePath);
      const contents = await readFile(filePath, "utf-8");
      expect(contents).toContain(page.marker);
    });
  });
});

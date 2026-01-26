import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("PlayerPage subtitle layering", () => {
  it("keeps subtitle token buttons above timeline controls while wrappers remain click-through", async () => {
    const filePath = resolve(process.cwd(), "src/app/routes/PlayerPage.tsx");
    const contents = await readFile(filePath, "utf-8");

    expect(contents).toContain("pointer-events-none flex flex-wrap");
    expect(contents).toContain("pointer-events-auto relative z-40");
    expect(contents).toContain("absolute inset-0 z-30");
    expect(contents).toContain("z-20");
  });
});

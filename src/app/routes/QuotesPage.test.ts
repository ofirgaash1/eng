import { describe, expect, it } from "vitest";
import { UNKNOWN_LIST_DIMENSIONS } from "./QuotesPage";

describe("UNKNOWN_LIST_DIMENSIONS", () => {
  it("keeps the unknown words list tall and scrollable", () => {
    expect(UNKNOWN_LIST_DIMENSIONS.minHeight).toBe("60vh");
    expect(UNKNOWN_LIST_DIMENSIONS.maxHeight).toBe("calc(100vh - 10rem)");
  });
});

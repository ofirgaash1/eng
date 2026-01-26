import { describe, expect, it } from "vitest";
import { formatTimeMs } from "./timeFormat";

describe("formatTimeMs", () => {
  it("formats minutes and seconds", () => {
    expect(formatTimeMs(0)).toBe("00:00");
    expect(formatTimeMs(65_000)).toBe("01:05");
    expect(formatTimeMs(2_606_000)).toBe("43:26");
  });

  it("does not clamp large minutes", () => {
    expect(formatTimeMs(7_569_000)).toBe("126:09");
  });
});

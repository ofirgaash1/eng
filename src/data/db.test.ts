import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetDbStateForTests, withDb, withDbVoid } from "./db";

describe("db helpers", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetDbStateForTests();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("returns the fallback when database open fails without logging console errors", async () => {
    vi.spyOn(db, "open").mockRejectedValue(new Error("db unavailable"));
    const result = await withDb("fallback", async () => "value");
    expect(result).toBe("fallback");
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("skips actions when database open fails", async () => {
    vi.spyOn(db, "open").mockRejectedValue(new Error("db unavailable"));
    const action = vi.fn();
    await withDbVoid(action);
    expect(action).not.toHaveBeenCalled();
  });
});

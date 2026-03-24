import { describe, expect, it } from "vitest";
import { normalizeSyncUsername } from "./usernameSync";

describe("username sync", () => {
  it("normalizes valid usernames", () => {
    expect(normalizeSyncUsername(" OfirGaash ")).toBe("ofirgaash");
    expect(normalizeSyncUsername("family_sync-01")).toBe("family_sync-01");
  });

  it("rejects invalid usernames", () => {
    expect(() => normalizeSyncUsername("ab")).toThrow(/3-32 characters/i);
    expect(() => normalizeSyncUsername("with space")).toThrow(/lowercase letters/i);
    expect(() => normalizeSyncUsername("UPPER")).not.toThrow();
  });
});

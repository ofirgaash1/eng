import { describe, expect, it } from "vitest";
import {
  LAST_SYNC_USERNAME_STORAGE_KEY,
  loadLastSyncUsername,
  saveLastSyncUsername,
} from "./syncUsernameStorage";

function createStorageMock(initialValue?: string) {
  const map = new Map<string, string>();
  if (initialValue !== undefined) {
    map.set(LAST_SYNC_USERNAME_STORAGE_KEY, initialValue);
  }

  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

describe("sync username storage", () => {
  it("loads the last saved username", () => {
    const storage = createStorageMock("ofirgaash");
    expect(loadLastSyncUsername(storage)).toBe("ofirgaash");
  });

  it("trims and saves the username", () => {
    const storage = createStorageMock();
    saveLastSyncUsername("  ofirgaash  ", storage);

    expect(storage.getItem(LAST_SYNC_USERNAME_STORAGE_KEY)).toBe("ofirgaash");
  });

  it("clears the saved username when given an empty value", () => {
    const storage = createStorageMock("ofirgaash");
    saveLastSyncUsername("   ", storage);

    expect(loadLastSyncUsername(storage)).toBe("");
  });
});

import { describe, expect, it } from "vitest";
import {
  TRACKED_SYNC_DIRTY_STORAGE_KEY,
  USERNAME_SYNC_STATE_STORAGE_KEY_PREFIX,
  clearTrackedSyncDataChanges,
  hasTrackedSyncDataChanges,
  LAST_SYNC_USERNAME_STORAGE_KEY,
  loadLastSyncUsername,
  loadUsernameSyncState,
  markTrackedSyncDataChanged,
  saveLastSyncUsername,
  saveUsernameSyncState,
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

  it("saves and loads username sync state per normalized username", () => {
    const storage = createStorageMock();
    saveUsernameSyncState(
      " OfirGaash ",
      {
        lastPublishedAt: 123,
        lastPublishedTrackedHash: "abc123",
      },
      storage
    );

    expect(loadUsernameSyncState("ofirgaash", storage)).toEqual({
      lastPublishedAt: 123,
      lastPublishedTrackedHash: "abc123",
    });
    expect(storage.getItem(`${USERNAME_SYNC_STATE_STORAGE_KEY_PREFIX}ofirgaash`)).toBe(
      JSON.stringify({
        lastPublishedAt: 123,
        lastPublishedTrackedHash: "abc123",
      })
    );
  });

  it("ignores invalid stored username sync state", () => {
    const storage = createStorageMock();
    storage.setItem(
      `${USERNAME_SYNC_STATE_STORAGE_KEY_PREFIX}ofirgaash`,
      JSON.stringify({ lastPublishedAt: 0, lastPublishedTrackedHash: "" })
    );

    expect(loadUsernameSyncState("ofirgaash", storage)).toBeUndefined();
  });

  it("tracks pending sync data changes", () => {
    const storage = createStorageMock();

    expect(hasTrackedSyncDataChanges(storage)).toBe(false);

    markTrackedSyncDataChanged(storage);
    expect(storage.getItem(TRACKED_SYNC_DIRTY_STORAGE_KEY)).toBe("1");
    expect(hasTrackedSyncDataChanges(storage)).toBe(true);

    clearTrackedSyncDataChanges(storage);
    expect(hasTrackedSyncDataChanges(storage)).toBe(false);
  });
});

export const LAST_SYNC_USERNAME_STORAGE_KEY = "subtitle-word-tracker:last-sync-username";

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadLastSyncUsername(storage: Pick<Storage, "getItem"> | null = getLocalStorage()): string {
  const value = storage?.getItem(LAST_SYNC_USERNAME_STORAGE_KEY)?.trim();
  return value ?? "";
}

export function saveLastSyncUsername(
  username: string,
  storage: Pick<Storage, "setItem" | "removeItem"> | null = getLocalStorage(),
): void {
  if (!storage) {
    return;
  }

  const normalized = username.trim();
  if (!normalized) {
    storage.removeItem(LAST_SYNC_USERNAME_STORAGE_KEY);
    return;
  }

  storage.setItem(LAST_SYNC_USERNAME_STORAGE_KEY, normalized);
}

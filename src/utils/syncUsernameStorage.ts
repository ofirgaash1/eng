export const LAST_SYNC_USERNAME_STORAGE_KEY = "subtitle-word-tracker:last-sync-username";
export const TRACKED_SYNC_DIRTY_STORAGE_KEY = "subtitle-word-tracker:tracked-sync-dirty";
export const USERNAME_SYNC_STATE_STORAGE_KEY_PREFIX = "subtitle-word-tracker:username-sync-state:";

export type UsernameSyncState = {
  lastPublishedAt: number;
  lastPublishedTrackedHash: string;
};

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

function normalizeStoredUsername(username: string): string {
  return username.trim().toLowerCase();
}

function usernameSyncStateKey(username: string): string {
  return `${USERNAME_SYNC_STATE_STORAGE_KEY_PREFIX}${normalizeStoredUsername(username)}`;
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

export function loadUsernameSyncState(
  username: string,
  storage: Pick<Storage, "getItem"> | null = getLocalStorage(),
): UsernameSyncState | undefined {
  const normalized = normalizeStoredUsername(username);
  if (!normalized) {
    return undefined;
  }

  const raw = storage?.getItem(usernameSyncStateKey(normalized));
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<UsernameSyncState>;
    if (
      typeof parsed.lastPublishedAt !== "number" ||
      !Number.isFinite(parsed.lastPublishedAt) ||
      parsed.lastPublishedAt <= 0 ||
      typeof parsed.lastPublishedTrackedHash !== "string" ||
      parsed.lastPublishedTrackedHash.trim().length === 0
    ) {
      return undefined;
    }
    return {
      lastPublishedAt: parsed.lastPublishedAt,
      lastPublishedTrackedHash: parsed.lastPublishedTrackedHash,
    };
  } catch {
    return undefined;
  }
}

export function saveUsernameSyncState(
  username: string,
  state: UsernameSyncState | undefined,
  storage: Pick<Storage, "setItem" | "removeItem"> | null = getLocalStorage(),
): void {
  if (!storage) {
    return;
  }

  const normalized = normalizeStoredUsername(username);
  if (!normalized || !state) {
    if (normalized) {
      storage.removeItem(usernameSyncStateKey(normalized));
    }
    return;
  }

  storage.setItem(usernameSyncStateKey(normalized), JSON.stringify(state));
}

export function hasTrackedSyncDataChanges(
  storage: Pick<Storage, "getItem"> | null = getLocalStorage(),
): boolean {
  return storage?.getItem(TRACKED_SYNC_DIRTY_STORAGE_KEY) === "1";
}

export function markTrackedSyncDataChanged(
  storage: Pick<Storage, "setItem"> | null = getLocalStorage(),
): void {
  storage?.setItem(TRACKED_SYNC_DIRTY_STORAGE_KEY, "1");
}

export function clearTrackedSyncDataChanges(
  storage: Pick<Storage, "removeItem"> | null = getLocalStorage(),
): void {
  storage?.removeItem(TRACKED_SYNC_DIRTY_STORAGE_KEY);
}

const LAST_SYNC_USERNAME_STORAGE_KEY = "subtitle-word-tracker:extension:last-sync-username";
const TRACKED_SYNC_DIRTY_STORAGE_KEY = "subtitle-word-tracker:extension:tracked-sync-dirty";
const USERNAME_SYNC_STATE_STORAGE_KEY_PREFIX =
  "subtitle-word-tracker:extension:username-sync-state:";

export type UsernameSyncState = {
  lastPublishedAt: number;
  lastPublishedTrackedHash: string;
};

function normalizeStoredUsername(username: string): string {
  return username.trim().toLowerCase();
}

function usernameSyncStateKey(username: string): string {
  return `${USERNAME_SYNC_STATE_STORAGE_KEY_PREFIX}${normalizeStoredUsername(username)}`;
}

function readChromeError(): Error | null {
  const message = chrome.runtime?.lastError?.message;
  return typeof message === "string" && message.trim().length > 0 ? new Error(message) : null;
}

function getStorageArea() {
  return chrome.storage?.local;
}

async function storageGetRaw<T = Record<string, unknown>>(keys: string | string[]): Promise<T> {
  const storage = getStorageArea();
  if (!storage) {
    return {} as T;
  }

  return new Promise<T>((resolve, reject) => {
    storage.get(keys, (items: T) => {
      const error = readChromeError();
      if (error) {
        reject(error);
        return;
      }
      resolve(items ?? ({} as T));
    });
  });
}

async function storageSetRaw(items: Record<string, unknown>): Promise<void> {
  const storage = getStorageArea();
  if (!storage) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    storage.set(items, () => {
      const error = readChromeError();
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function storageRemoveRaw(keys: string | string[]): Promise<void> {
  const storage = getStorageArea();
  if (!storage) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    storage.remove(keys, () => {
      const error = readChromeError();
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export async function loadLastSyncUsername(): Promise<string> {
  const result = await storageGetRaw<Record<string, string | undefined>>(LAST_SYNC_USERNAME_STORAGE_KEY);
  return result[LAST_SYNC_USERNAME_STORAGE_KEY]?.trim() ?? "";
}

export async function saveLastSyncUsername(username: string): Promise<void> {
  const normalized = username.trim();
  if (!normalized) {
    await storageRemoveRaw(LAST_SYNC_USERNAME_STORAGE_KEY);
    return;
  }

  await storageSetRaw({ [LAST_SYNC_USERNAME_STORAGE_KEY]: normalized });
}

export async function loadUsernameSyncState(
  username: string,
): Promise<UsernameSyncState | undefined> {
  const normalized = normalizeStoredUsername(username);
  if (!normalized) {
    return undefined;
  }

  const key = usernameSyncStateKey(normalized);
  const result = await storageGetRaw<Record<string, string | undefined>>(key);
  const raw = result[key];
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

export async function saveUsernameSyncState(
  username: string,
  state: UsernameSyncState | undefined,
): Promise<void> {
  const normalized = normalizeStoredUsername(username);
  if (!normalized || !state) {
    if (normalized) {
      await storageRemoveRaw(usernameSyncStateKey(normalized));
    }
    return;
  }

  await storageSetRaw({
    [usernameSyncStateKey(normalized)]: JSON.stringify(state),
  });
}

export async function hasTrackedSyncDataChanges(): Promise<boolean> {
  const result = await storageGetRaw<Record<string, string | undefined>>(TRACKED_SYNC_DIRTY_STORAGE_KEY);
  return result[TRACKED_SYNC_DIRTY_STORAGE_KEY] === "1";
}

export async function markTrackedSyncDataChanged(): Promise<void> {
  await storageSetRaw({ [TRACKED_SYNC_DIRTY_STORAGE_KEY]: "1" });
}

export async function clearTrackedSyncDataChanges(): Promise<void> {
  await storageRemoveRaw(TRACKED_SYNC_DIRTY_STORAGE_KEY);
}

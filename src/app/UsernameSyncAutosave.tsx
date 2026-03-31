import { useEffect, useRef } from "react";
import { exportAllData, importAllData, serializeTrackedBackupData } from "../data/backupRepo";
import { useDictionaryStore } from "../state/dictionaryStore";
import { usePrefsStore } from "../state/prefsStore";
import {
  importBackupFromUsername,
  isUsernameSyncConfigured,
  publishBackupToUsername,
} from "../services/usernameSync";
import { sha256Hex } from "../utils/sha256";
import {
  clearTrackedSyncDataChanges,
  hasTrackedSyncDataChanges,
  loadLastSyncUsername,
  loadUsernameSyncState,
  saveUsernameSyncState,
} from "../utils/syncUsernameStorage";

const AUTOSAVE_CHECK_INTERVAL_MS = 60_000;
const AUTOSAVE_MIN_SAVE_GAP_MS = 30 * 60_000;
const AUTOSAVE_RETRY_DELAY_MS = 5 * 60_000;

function parseTimestamp(value: string | null | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function refreshStoresAfterImport() {
  usePrefsStore.setState({ initialized: false });
  void usePrefsStore.getState().initialize();
  useDictionaryStore.setState({ initialized: false });
  void useDictionaryStore.getState().initialize();
}

async function hashTrackedBackup(input: unknown): Promise<string> {
  return sha256Hex(serializeTrackedBackupData(input));
}

export default function UsernameSyncAutosave() {
  const syncInFlightRef = useRef(false);
  const retryAfterRef = useRef(0);

  useEffect(() => {
    let disposed = false;

    const runAutosave = async () => {
      if (disposed || syncInFlightRef.current || Date.now() < retryAfterRef.current) {
        return;
      }
      if (!isUsernameSyncConfigured() || !hasTrackedSyncDataChanges()) {
        return;
      }

      const username = loadLastSyncUsername();
      if (!username) {
        return;
      }

      const syncState = loadUsernameSyncState(username);
      if (!syncState) {
        return;
      }
      if (Date.now() - syncState.lastPublishedAt < AUTOSAVE_MIN_SAVE_GAP_MS) {
        return;
      }

      syncInFlightRef.current = true;
      try {
        const { payload: localPayload } = await exportAllData({ includeCueTokens: false });
        const localHash = await hashTrackedBackup(localPayload);

        if (localHash === syncState.lastPublishedTrackedHash) {
          clearTrackedSyncDataChanges();
          return;
        }

        const remote = await importBackupFromUsername(username);
        const remoteHash = await hashTrackedBackup(remote.payload);
        const remotePublishedAt = parseTimestamp(remote.metadata.exportedAt) ?? Date.now();

        if (remoteHash === localHash) {
          saveUsernameSyncState(username, {
            lastPublishedAt: remotePublishedAt,
            lastPublishedTrackedHash: localHash,
          });
          clearTrackedSyncDataChanges();
          return;
        }

        await importAllData(remote.payload);
        refreshStoresAfterImport();

        const { payload: mergedPayload } = await exportAllData({ includeCueTokens: false });
        const mergedHash = await hashTrackedBackup(mergedPayload);

        if (mergedHash === remoteHash) {
          saveUsernameSyncState(username, {
            lastPublishedAt: remotePublishedAt,
            lastPublishedTrackedHash: mergedHash,
          });
          clearTrackedSyncDataChanges();
          return;
        }

        const result = await publishBackupToUsername(username, mergedPayload);
        saveUsernameSyncState(username, {
          lastPublishedAt: parseTimestamp(result.exportedAt) ?? Date.now(),
          lastPublishedTrackedHash: mergedHash,
        });
        clearTrackedSyncDataChanges();
      } catch (error) {
        retryAfterRef.current = Date.now() + AUTOSAVE_RETRY_DELAY_MS;
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn("[username-sync] Autosave failed.", error);
        }
      } finally {
        syncInFlightRef.current = false;
      }
    };

    void runAutosave();

    const interval = window.setInterval(() => {
      void runAutosave();
    }, AUTOSAVE_CHECK_INTERVAL_MS);

    const handleOnline = () => {
      void runAutosave();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void runAutosave();
      }
    };

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return null;
}

import type { Token, UnknownWord } from "../core/types";
import { exportAllData, importAllData, serializeTrackedBackupData } from "../data/backupRepo";
import { getAllWords, saveWord } from "../data/wordsRepo";
import { translateEnglishWordToHebrew } from "../services/googleTranslate";
import {
  createUsernameProfile,
  importBackupFromUsername,
  isUsernameSyncConfigured,
  normalizeSyncUsername,
  publishBackupToUsername,
} from "../services/usernameSync";
import { sha256Hex } from "../utils/sha256";
import {
  clearTrackedSyncDataChanges,
  hasTrackedSyncDataChanges,
  loadLastSyncUsername,
  loadUsernameSyncState,
  markTrackedSyncDataChanged,
  saveLastSyncUsername,
  saveUsernameSyncState,
} from "./shared/chromeStorage";
import type {
  ExtensionRequest,
  ExtensionResponse,
  SyncStatus,
  VocabularyState,
} from "./shared/messages";
import { upsertUnknownWord } from "./shared/unknownWords";

const SYNC_ALARM_NAME = "subtitle-word-tracker-extension-sync";
const AUTOSAVE_MIN_SAVE_GAP_MS = 30 * 60_000;
const AUTOSAVE_RETRY_DELAY_MS = 5 * 60_000;

let syncInFlight: Promise<SyncStatus> | null = null;
let retryAfter = 0;

function createSuccess<T>(data: T): ExtensionResponse<T> {
  return { ok: true, data };
}

function createFailure<T>(error: unknown): ExtensionResponse<T> {
  return {
    ok: false,
    error: error instanceof Error ? error.message : "Unexpected extension error.",
  };
}

function parseTimestamp(value: string | null | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function resolveLastPublishedAt(
  remoteExportedAt: string | null | undefined,
  fallback?: number,
): number {
  return parseTimestamp(remoteExportedAt) ?? fallback ?? Date.now();
}

async function hashTrackedBackup(input: unknown): Promise<string> {
  return sha256Hex(serializeTrackedBackupData(input));
}

async function broadcastWordsUpdated(words?: UnknownWord[]) {
  const payload = words ?? (await getAllWords());
  chrome.tabs.query({ url: ["https://www.youtube.com/*"] }, (tabs: Array<{ id?: number }>) => {
    tabs.forEach((tab) => {
      if (typeof tab.id !== "number") {
        return;
      }
      try {
        chrome.tabs.sendMessage(tab.id, {
          type: "WORDS_UPDATED",
          words: payload,
        });
      } catch {
        // Ignore tabs without the content script.
      }
    });
  });
}

async function buildSyncStatus(message?: string): Promise<SyncStatus> {
  const username = await loadLastSyncUsername();
  const words = await getAllWords();
  const syncState = username ? await loadUsernameSyncState(username) : undefined;
  return {
    configured: isUsernameSyncConfigured(),
    username,
    dirty: await hasTrackedSyncDataChanges(),
    wordCount: words.length,
    lastPublishedAt: syncState?.lastPublishedAt,
    message,
  };
}

async function addWord(token: Token, originalSentence?: string): Promise<VocabularyState> {
  const words = await getAllWords();
  const { nextWords, savedWord } = upsertUnknownWord(words, token, originalSentence);
  if (!savedWord) {
    return { words };
  }

  await saveWord(savedWord);
  await markTrackedSyncDataChanged();
  await broadcastWordsUpdated(nextWords);
  return { words: nextWords };
}

async function ensureSyncAlarm(): Promise<void> {
  await new Promise<void>((resolve) => {
    chrome.alarms.create(SYNC_ALARM_NAME, { periodInMinutes: 5 });
    resolve();
  });
}

async function runSync(force: boolean): Promise<SyncStatus> {
  if (syncInFlight) {
    if (!force) {
      return syncInFlight;
    }
    await syncInFlight.catch(() => undefined);
    if (syncInFlight) {
      return syncInFlight;
    }
  }

  syncInFlight = (async () => {
    if (!isUsernameSyncConfigured()) {
      return buildSyncStatus("Username sync is not configured.");
    }

    const username = await loadLastSyncUsername();
    if (!username) {
      return buildSyncStatus("Set a username first.");
    }

    if (!force && Date.now() < retryAfter) {
      return buildSyncStatus("Sync retry deferred after the last failure.");
    }

    if (!force && !(await hasTrackedSyncDataChanges())) {
      return buildSyncStatus("Vocabulary is already up to date.");
    }

    try {
      const { payload: localPayload } = await exportAllData({ includeCueTokens: false });
      const localHash = await hashTrackedBackup(localPayload);
      const syncState = await loadUsernameSyncState(username);

      if (syncState && localHash === syncState.lastPublishedTrackedHash) {
        await clearTrackedSyncDataChanges();
        return buildSyncStatus("Vocabulary is already up to date.");
      }

      const remote = await importBackupFromUsername(username);
      const remoteHash = await hashTrackedBackup(remote.payload);
      const remotePublishedAt = resolveLastPublishedAt(
        remote.metadata.exportedAt,
        syncState?.lastPublishedAt,
      );
      const effectiveSyncState = {
        lastPublishedAt: remotePublishedAt,
        lastPublishedTrackedHash: remoteHash,
      };

      await saveUsernameSyncState(username, effectiveSyncState);

      if (remoteHash === localHash) {
        await clearTrackedSyncDataChanges();
        return buildSyncStatus("Vocabulary matches the current remote backup.");
      }

      if (!force && Date.now() - effectiveSyncState.lastPublishedAt < AUTOSAVE_MIN_SAVE_GAP_MS) {
        return buildSyncStatus("Waiting for the next autosave window before publishing.");
      }

      await importAllData(remote.payload);
      const { payload: mergedPayload } = await exportAllData({ includeCueTokens: false });
      const mergedHash = await hashTrackedBackup(mergedPayload);

      if (mergedHash === remoteHash) {
        await clearTrackedSyncDataChanges();
        await broadcastWordsUpdated();
        return buildSyncStatus("Imported remote updates into the extension.");
      }

      const result = await publishBackupToUsername(username, mergedPayload);
      await saveUsernameSyncState(username, {
        lastPublishedAt: parseTimestamp(result.exportedAt) ?? Date.now(),
        lastPublishedTrackedHash: mergedHash,
      });
      await clearTrackedSyncDataChanges();
      await broadcastWordsUpdated();
      return buildSyncStatus("Merged local and remote data, then published the result.");
    } catch (error) {
      retryAfter = Date.now() + AUTOSAVE_RETRY_DELAY_MS;
      return buildSyncStatus(
        error instanceof Error ? error.message : "Unable to complete vocabulary sync.",
      );
    } finally {
      syncInFlight = null;
    }
  })();

  return syncInFlight;
}

chrome.runtime.onInstalled.addListener(() => {
  void ensureSyncAlarm();
});

chrome.runtime.onStartup?.addListener(() => {
  void ensureSyncAlarm();
  void runSync(false);
});

chrome.alarms.onAlarm.addListener((alarm: { name?: string }) => {
  if (alarm?.name === SYNC_ALARM_NAME) {
    void runSync(false);
  }
});

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionRequest,
    _sender: unknown,
    sendResponse: (response: ExtensionResponse<unknown>) => void,
  ) => {
    void (async () => {
      try {
        switch (message.type) {
          case "GET_VOCABULARY_STATE": {
            sendResponse(createSuccess<VocabularyState>({ words: await getAllWords() }));
            return;
          }
          case "SAVE_WORD": {
            const result = await addWord(message.token, message.originalSentence);
            void runSync(false);
            sendResponse(createSuccess<VocabularyState>(result));
            return;
          }
          case "TRANSLATE_WORD": {
            const result = await translateEnglishWordToHebrew(message.text);
            sendResponse(createSuccess({ text: result.text }));
            return;
          }
          case "GET_SYNC_STATUS": {
            sendResponse(createSuccess(await buildSyncStatus()));
            return;
          }
          case "SET_SYNC_USERNAME": {
            const username = normalizeSyncUsername(message.username);
            await saveLastSyncUsername(username);
            sendResponse(createSuccess(await buildSyncStatus(`Saved username '${username}'.`)));
            return;
          }
          case "CREATE_SYNC_USERNAME": {
            const metadata = await createUsernameProfile(message.username);
            await saveLastSyncUsername(metadata.username);
            sendResponse(
              createSuccess(await buildSyncStatus(`Created username '${metadata.username}'.`)),
            );
            return;
          }
          case "SYNC_NOW": {
            sendResponse(createSuccess(await runSync(true)));
            return;
          }
          default: {
            sendResponse(createFailure(new Error("Unknown extension message.")));
          }
        }
      } catch (error) {
        sendResponse(createFailure(error));
      }
    })();

    return true;
  },
);

void ensureSyncAlarm();
void runSync(false);

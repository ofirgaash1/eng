import type { Table } from "dexie";
import type {
  RecentSessionRecord,
  SubtitleCueRecord,
  SubtitleFile,
  UnknownWord,
  UserPrefs,
} from "../core/types";
import { db, ensureDbReady, withDb, withDbVoid } from "./db";

const PREFS_ID = "prefs";

export type BackupPayload = {
  version: 1;
  exportedAt: string;
  data: {
    words: UnknownWord[];
    subtitleFiles: SubtitleFile[];
    subtitleCues: SubtitleCueRecord[];
    prefs?: UserPrefs;
    sessions?: RecentSessionRecord[];
  };
};

export type BackupCounts = {
  words: number;
  addedWords: number;
  subtitleFiles: number;
  addedSubtitleFiles: number;
  subtitleCues: number;
  sessions: number;
  hasPrefs: boolean;
};

export type BackupSummary = {
  words: number;
  subtitleFiles: number;
  subtitleCues: number;
  sessions: number;
  hasPrefs: boolean;
};

export type ImportProgress = {
  percent: number;
  stage: string;
};

type ImportOptions = {
  onProgress?: (progress: ImportProgress) => void;
};

function stripPrefsForTransfer(prefs: UserPrefs): UserPrefs {
  return {
    ...prefs,
    mediaLibrary: undefined,
  };
}

function stripSessionForTransfer(session: RecentSessionRecord): RecentSessionRecord {
  return session;
}

function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function looksLikeBackupData(value: unknown): value is BackupPayload["data"] {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BackupPayload["data"]>;
  return (
    Array.isArray(candidate.words) ||
    Array.isArray(candidate.subtitleFiles) ||
    Array.isArray(candidate.subtitleCues) ||
    Array.isArray(candidate.sessions) ||
    Boolean(candidate.prefs && typeof candidate.prefs === "object")
  );
}

function extractBackupData(input: unknown): BackupPayload["data"] {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid backup file.");
  }

  const candidates: unknown[] = [
    input,
    (input as { data?: unknown }).data,
    (input as { payload?: unknown }).payload,
    (input as { backup?: unknown }).backup,
  ];

  for (const candidate of candidates) {
    const parsed = parseMaybeJson(candidate);
    if (looksLikeBackupData(parsed)) {
      return parsed;
    }
    if (parsed && typeof parsed === "object" && "data" in parsed) {
      const nested = parseMaybeJson((parsed as { data?: unknown }).data);
      if (looksLikeBackupData(nested)) {
        return nested;
      }
    }
  }

  throw new Error("Invalid backup file: missing data.");
}

function buildBackupSummary(
  words: UnknownWord[],
  subtitleFiles: SubtitleFile[],
  subtitleCues: SubtitleCueRecord[],
  sessions: RecentSessionRecord[],
  prefs: UserPrefs | undefined
): BackupSummary {
  return {
    words: words.length,
    subtitleFiles: subtitleFiles.length,
    subtitleCues: subtitleCues.length,
    sessions: sessions.length,
    hasPrefs: !!prefs,
  };
}

export function summarizeBackup(input: unknown): BackupSummary {
  const data = extractBackupData(input);
  const words = ensureArray<UnknownWord>(data.words);
  const subtitleFiles = ensureArray<SubtitleFile>(data.subtitleFiles);
  const subtitleCues = ensureArray<SubtitleCueRecord>(data.subtitleCues);
  const prefs =
    data.prefs && typeof data.prefs === "object"
      ? stripPrefsForTransfer(data.prefs as UserPrefs)
      : undefined;
  const sessions = ensureArray<RecentSessionRecord>(data.sessions).map(stripSessionForTransfer);
  return buildBackupSummary(words, subtitleFiles, subtitleCues, sessions, prefs);
}

function pickString(primary: string | undefined, fallback: string | undefined) {
  if (primary && primary.trim()) return primary;
  return fallback ?? "";
}

function mergeWords(existing: UnknownWord[], incoming: UnknownWord[]) {
  const byKey = new Map<string, UnknownWord>();
  const keyFor = (word: UnknownWord) => `${word.normalized}::${word.stem}`;

  for (const word of existing) {
    byKey.set(keyFor(word), word);
  }

  for (const word of incoming) {
    const key = keyFor(word);
    const prior = byKey.get(key);
    if (!prior) {
      byKey.set(key, word);
      continue;
    }
    const preferIncoming = (word.updatedAt ?? 0) >= (prior.updatedAt ?? 0);
    const primary = preferIncoming ? word : prior;
    const secondary = preferIncoming ? prior : word;
    const createdAt = Math.min(
      prior.createdAt ?? primary.createdAt ?? Date.now(),
      word.createdAt ?? primary.createdAt ?? Date.now()
    );
    byKey.set(key, {
      id: prior.id,
      original: pickString(primary.original, secondary.original),
      originalSentence: pickString(primary.originalSentence, secondary.originalSentence) || undefined,
      normalized: prior.normalized || word.normalized,
      stem: prior.stem || word.stem,
      createdAt,
      updatedAt: Math.max(prior.updatedAt ?? 0, word.updatedAt ?? 0),
    });
  }

  return Array.from(byKey.values());
}

function mergeSubtitleFiles(existing: SubtitleFile[], incoming: SubtitleFile[]) {
  const byHash = new Map<string, SubtitleFile>();

  for (const file of existing) {
    byHash.set(file.bytesHash, file);
  }

  for (const file of incoming) {
    const prior = byHash.get(file.bytesHash);
    if (!prior) {
      byHash.set(file.bytesHash, file);
      continue;
    }
    const preferIncoming = (file.addedAt ?? 0) >= (prior.addedAt ?? 0);
    const primary = preferIncoming ? file : prior;
    const secondary = preferIncoming ? prior : file;
    byHash.set(file.bytesHash, {
      id: prior.id,
      name: pickString(primary.name, secondary.name),
      bytesHash: prior.bytesHash,
      totalCues: Math.max(prior.totalCues ?? 0, file.totalCues ?? 0),
      language: primary.language ?? secondary.language,
      addedAt: Math.max(prior.addedAt ?? 0, file.addedAt ?? 0),
    });
  }

  return Array.from(byHash.values());
}

function mergeSubtitleCues(existing: SubtitleCueRecord[], incoming: SubtitleCueRecord[]) {
  const byId = new Map<string, SubtitleCueRecord>();

  for (const cue of existing) {
    byId.set(cue.id, cue);
  }

  for (const cue of incoming) {
    byId.set(cue.id, cue);
  }

  return Array.from(byId.values());
}

function mergePrefs(existing: UserPrefs | undefined, incoming: UserPrefs | undefined) {
  if (!incoming) {
    return existing;
  }
  const base = existing ?? incoming;
  return stripPrefsForTransfer({
    ...base,
    ...incoming,
    subtitleStyle: { ...base.subtitleStyle, ...incoming.subtitleStyle },
    highlightColors: { ...base.highlightColors, ...incoming.highlightColors },
  });
}

function mergeSessions(existing: RecentSessionRecord[], incoming: RecentSessionRecord[]) {
  const byId = new Map<string, RecentSessionRecord>();

  for (const session of existing) {
    byId.set(session.id, session);
  }

  for (const session of incoming) {
    const prior = byId.get(session.id);
    if (!prior || (session.updatedAt ?? 0) >= (prior.updatedAt ?? 0)) {
      byId.set(session.id, session);
    }
  }

  return Array.from(byId.values());
}

async function bulkPutChunked<T extends { id: string }>(
  table: Table<T, string>,
  records: T[],
  chunkSize: number,
  onChunk: (count: number) => void
) {
  if (records.length === 0) return;
  for (let index = 0; index < records.length; index += chunkSize) {
    const chunk = records.slice(index, index + chunkSize);
    await table.bulkPut(chunk);
    onChunk(chunk.length);
  }
}

export async function exportAllData(): Promise<{ payload: BackupPayload; counts: BackupCounts }> {
  const [words, subtitleFiles, subtitleCues, prefsRecord, sessions] = await Promise.all([
    withDb([], () => db.words.toArray()),
    withDb([], () => db.subtitleFiles.toArray()),
    withDb([], () => db.subtitleCues.toArray()),
    withDb(undefined, () => db.prefs.get(PREFS_ID)),
    withDb([], () => db.sessions.toArray()),
  ]);

  const prefs = prefsRecord?.value ? stripPrefsForTransfer(prefsRecord.value) : undefined;
  const safeSessions = sessions.map(stripSessionForTransfer);

  const payload: BackupPayload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      words,
      subtitleFiles,
      subtitleCues,
      prefs,
      sessions: safeSessions,
    },
  };

  return {
    payload,
    counts: {
      words: words.length,
      addedWords: 0,
      subtitleFiles: subtitleFiles.length,
      addedSubtitleFiles: 0,
      subtitleCues: subtitleCues.length,
      sessions: safeSessions.length,
      hasPrefs: Boolean(prefs),
    },
  };
}

export async function importAllData(
  input: unknown,
  options?: ImportOptions
): Promise<BackupCounts> {
  const report = (percent: number, stage: string) => {
    options?.onProgress?.({ percent, stage });
  };

  const data = extractBackupData(input);

  report(2, "Opening database");
  const dbReady = await ensureDbReady();
  if (!dbReady) {
    return {
      words: 0,
      addedWords: 0,
      subtitleFiles: 0,
      addedSubtitleFiles: 0,
      subtitleCues: 0,
      sessions: 0,
      hasPrefs: false,
    };
  }

  const words = ensureArray<UnknownWord>(data.words);
  const subtitleFiles = ensureArray<SubtitleFile>(data.subtitleFiles);
  const subtitleCues = ensureArray<SubtitleCueRecord>(data.subtitleCues);
  const prefs =
    data.prefs && typeof data.prefs === "object"
      ? stripPrefsForTransfer(data.prefs as UserPrefs)
      : undefined;
  const sessions = ensureArray<RecentSessionRecord>(data.sessions).map(stripSessionForTransfer);
  const sourceSummary = buildBackupSummary(
    words,
    subtitleFiles,
    subtitleCues,
    sessions,
    prefs
  );

  report(5, "Loading existing data");
  const [existingWords, existingSubtitleFiles, existingSubtitleCues, prefsRecord, existingSessions] =
    await Promise.all([
      withDb([], () => db.words.toArray()),
      withDb([], () => db.subtitleFiles.toArray()),
      withDb([], () => db.subtitleCues.toArray()),
      withDb(undefined, () => db.prefs.get(PREFS_ID)),
      withDb([], () => db.sessions.toArray()),
    ]);
  const safeExistingSessions = existingSessions.map(stripSessionForTransfer);

  report(25, "Merging data");
  const mergedWords = mergeWords(existingWords, words);
  const mergedSubtitleFiles = mergeSubtitleFiles(existingSubtitleFiles, subtitleFiles);
  const mergedSubtitleCues = mergeSubtitleCues(existingSubtitleCues, subtitleCues);
  const mergedPrefs = mergePrefs(prefsRecord?.value, prefs);
  const mergedSessions = mergeSessions(safeExistingSessions, sessions);

  const addedWords = Math.max(0, mergedWords.length - existingWords.length);
  const addedSubtitleFiles = Math.max(
    0,
    mergedSubtitleFiles.length - existingSubtitleFiles.length
  );

  const totalWrites =
    mergedWords.length +
    mergedSubtitleFiles.length +
    mergedSubtitleCues.length +
    (mergedPrefs ? 1 : 0) +
    mergedSessions.length;
  let written = 0;
  const writeBase = 35;
  const writeCap = 95;
  const reportWrite = (stage: string, delta = 0) => {
    if (totalWrites === 0) {
      report(writeCap, stage);
      return;
    }
    if (delta > 0) {
      written += delta;
    }
    const progress = writeBase + (written / totalWrites) * (writeCap - writeBase);
    report(Math.min(writeCap, Math.max(writeBase, progress)), stage);
  };

  if (mergedWords.length > 0) {
    reportWrite("Saving words");
    await withDbVoid(() =>
      bulkPutChunked(db.words, mergedWords, 500, (count) =>
        reportWrite("Saving words", count)
      )
    );
  }
  if (mergedSubtitleFiles.length > 0) {
    reportWrite("Saving subtitle files");
    await withDbVoid(() =>
      bulkPutChunked(db.subtitleFiles, mergedSubtitleFiles, 200, (count) =>
        reportWrite("Saving subtitle files", count)
      )
    );
  }
  if (mergedSubtitleCues.length > 0) {
    reportWrite("Saving subtitle cues");
    await withDbVoid(() =>
      bulkPutChunked(db.subtitleCues, mergedSubtitleCues, 1000, (count) =>
        reportWrite("Saving subtitle cues", count)
      )
    );
  }
  if (mergedPrefs) {
    reportWrite("Saving preferences");
    await withDbVoid(() =>
      db.prefs.put({ id: PREFS_ID, value: mergedPrefs, updatedAt: Date.now() })
    );
    reportWrite("Saving preferences", 1);
  }
  if (mergedSessions.length > 0) {
    reportWrite("Saving sessions");
    await withDbVoid(() =>
      bulkPutChunked(db.sessions, mergedSessions, 200, (count) =>
        reportWrite("Saving sessions", count)
      )
    );
  }

  report(100, "Finalizing");
  const [finalWords, finalSubtitleFiles, finalSubtitleCues, finalSessions, finalPrefs] =
    await Promise.all([
      withDb(0, () => db.words.count()),
      withDb(0, () => db.subtitleFiles.count()),
      withDb(0, () => db.subtitleCues.count()),
      withDb(0, () => db.sessions.count()),
      withDb(undefined, () => db.prefs.get(PREFS_ID)),
    ]);

  const hasSourceData =
    sourceSummary.words > 0 ||
    sourceSummary.subtitleFiles > 0 ||
    sourceSummary.subtitleCues > 0 ||
    sourceSummary.sessions > 0 ||
    sourceSummary.hasPrefs;
  const hasStoredPrefs = Boolean(finalPrefs?.value);
  if (
    hasSourceData &&
    finalWords === 0 &&
    finalSubtitleFiles === 0 &&
    finalSubtitleCues === 0 &&
    finalSessions === 0 &&
    !hasStoredPrefs
  ) {
    throw new Error(
      "Import did not write any data. Check browser storage permissions and retry."
    );
  }

  return {
    words: finalWords,
    addedWords: Math.max(0, finalWords - existingWords.length),
    subtitleFiles: finalSubtitleFiles,
    addedSubtitleFiles: Math.max(0, finalSubtitleFiles - existingSubtitleFiles.length),
    subtitleCues: finalSubtitleCues,
    sessions: finalSessions,
    hasPrefs: hasStoredPrefs,
  };
}

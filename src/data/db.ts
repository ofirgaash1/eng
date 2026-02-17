import Dexie, { Table } from "dexie";
import type {
  RecentSessionRecord,
  SubtitleCueRecord,
  SubtitleFile,
  UnknownWord,
  UserPrefs,
  CandidateWordSource,
  WordDecisionRecord,
} from "../core/types";
import { reportDbError } from "./dbErrorReporter";

export interface PrefsRecord {
  id: string;
  value: UserPrefs;
  updatedAt: number;
}

function sanitizeWordRecords(records: UnknownWord[]): UnknownWord[] {
  return records.map((word) => ({
    id: word.id,
    original: word.original,
    originalSentence: word.originalSentence,
    normalized: word.normalized,
    stem: word.stem,
    createdAt: word.createdAt,
    updatedAt: word.updatedAt,
  }));
}

async function sanitizeWordsTable(tx: unknown) {
  const transaction = tx as { table: (name: string) => { toArray: () => Promise<unknown[]>; clear: () => Promise<void>; bulkPut: (records: unknown[]) => Promise<unknown>; }; };
  const records = await transaction.table("words").toArray();
  const sanitized = sanitizeWordRecords(records as UnknownWord[]);
  await transaction.table("words").clear();
  await transaction.table("words").bulkPut(sanitized);
}

export class SubtitleLearnerDB extends Dexie {
  words!: Table<UnknownWord, string>;
  subtitleFiles!: Table<SubtitleFile, string>;
  subtitleCues!: Table<SubtitleCueRecord, string>;
  prefs!: Table<PrefsRecord, string>;
  sessions!: Table<RecentSessionRecord, string>;
  candidateWordSources!: Table<CandidateWordSource, string>;
  wordDecisions!: Table<WordDecisionRecord, string>;

  constructor() {
    super("subtitle-learner");
    this.version(1).stores({
      words: "&id, normalized, stem, updatedAt",
      subtitleFiles: "&id, bytesHash, addedAt",
      prefs: "&id, updatedAt",
    });
    this.version(2).stores({
      words: "&id, normalized, stem, updatedAt",
      subtitleFiles: "&id, bytesHash, addedAt",
      prefs: "&id, updatedAt",
      subtitleCues: "&id, fileHash, index",
      sessions: "&id, updatedAt",
    });
    this.version(3)
      .stores({
        words: "&id, normalized, stem, updatedAt",
        subtitleFiles: "&id, bytesHash, addedAt",
        prefs: "&id, updatedAt",
        subtitleCues: "&id, fileHash, index",
        sessions: "&id, updatedAt",
      })
      .upgrade((tx) => sanitizeWordsTable(tx));
    this.version(4)
      .stores({
        words: "&id, normalized, stem, updatedAt",
        subtitleFiles: "&id, bytesHash, addedAt",
        prefs: "&id, updatedAt",
        subtitleCues: "&id, fileHash, index",
        sessions: "&id, updatedAt",
      })
      .upgrade((tx) => sanitizeWordsTable(tx));
    this.version(5)
      .stores({
        words: "&id, normalized, stem, updatedAt",
        subtitleFiles: "&id, bytesHash, addedAt",
        prefs: "&id, updatedAt",
        subtitleCues: "&id, fileHash, index",
        sessions: "&id, updatedAt",
      })
      .upgrade((tx) => {
        return tx
          .table("sessions")
          .toArray()
          .then((records) => {
            const sanitized = records.map((record) => {
              if (!record || typeof record !== "object") {
                return record;
              }
              const { videoBlob, ...rest } = record as { videoBlob?: Blob };
              return rest;
            });
            return tx.table("sessions").clear().then(() => tx.table("sessions").bulkPut(sanitized));
          });
      });

    this.version(6).stores({
      words: "&id, normalized, stem, updatedAt",
      subtitleFiles: "&id, bytesHash, addedAt",
      prefs: "&id, updatedAt",
      subtitleCues: "&id, fileHash, index",
      sessions: "&id, updatedAt",
      candidateWordSources: "&id, normalized, stem, fileHash, updatedAt",
      wordDecisions: "&normalized, decision, updatedAt",
    });
  }
}

export const db = new SubtitleLearnerDB();

let dbReadyPromise: Promise<boolean> | null = null;
let dbReady = false;
let dbUnavailable = false;

function logDbError(error: unknown, context: string) {
  const message = error instanceof Error ? error.message : String(error);
  reportDbError({
    context,
    message,
    stack: error instanceof Error ? error.stack : undefined,
  });
  if (import.meta.env.DEV && import.meta.env.MODE !== "test") {
    // eslint-disable-next-line no-console
    console.error(`[db] ${context}:`, error);
  }
}

export async function ensureDbReady(): Promise<boolean> {
  if (dbReady) return true;
  if (dbUnavailable) return false;
  if (!dbReadyPromise) {
    dbReadyPromise = db
      .open()
      .then(() => {
        dbReady = true;
        return true;
      })
      .catch((error) => {
        dbUnavailable = true;
        logDbError(error, "Failed to open IndexedDB");
        return false;
      });
  }
  return dbReadyPromise;
}

export async function withDb<T>(fallback: T, action: () => PromiseLike<T>): Promise<T> {
  const ready = await ensureDbReady();
  if (!ready) return fallback;
  try {
    return await action();
  } catch (error) {
    logDbError(error, "DB operation failed");
    return fallback;
  }
}

export async function withDbVoid(action: () => PromiseLike<unknown> | void): Promise<void> {
  const ready = await ensureDbReady();
  if (!ready) return;
  try {
    await action();
  } catch (error) {
    logDbError(error, "DB operation failed");
  }
}

export function resetDbStateForTests(): void {
  dbReadyPromise = null;
  dbReady = false;
  dbUnavailable = false;
}

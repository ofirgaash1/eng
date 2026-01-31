import Dexie, { Table } from "dexie";
import type {
  RecentSessionRecord,
  SubtitleCueRecord,
  SubtitleFile,
  UnknownWord,
  UserPrefs,
} from "../core/types";

export interface PrefsRecord {
  id: string;
  value: UserPrefs;
  updatedAt: number;
}

export class SubtitleLearnerDB extends Dexie {
  words!: Table<UnknownWord, string>;
  subtitleFiles!: Table<SubtitleFile, string>;
  subtitleCues!: Table<SubtitleCueRecord, string>;
  prefs!: Table<PrefsRecord, string>;
  sessions!: Table<RecentSessionRecord, string>;

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
    this.version(3).stores({
      words: "&id, normalized, stem, updatedAt",
      subtitleFiles: "&id, bytesHash, addedAt",
      prefs: "&id, updatedAt",
      subtitleCues: "&id, fileHash, index",
      sessions: "&id, updatedAt",
    });
    this.version(3).upgrade((tx) => {
      return tx.table("words").toArray().then((records) => {
        const sanitized = records.map((word) => ({
          id: word.id,
          original: word.original,
          originalSentence: word.originalSentence,
          normalized: word.normalized,
          stem: word.stem,
          createdAt: word.createdAt,
          updatedAt: word.updatedAt,
        }));
        return tx.table("words").clear().then(() => tx.table("words").bulkPut(sanitized));
      });
    });
    this.version(4).stores({
      words: "&id, normalized, stem, updatedAt",
      subtitleFiles: "&id, bytesHash, addedAt",
      prefs: "&id, updatedAt",
      subtitleCues: "&id, fileHash, index",
      sessions: "&id, updatedAt",
    });
    this.version(4).upgrade((tx) => {
      return tx.table("words").toArray().then((records) => {
        const sanitized = records.map((word) => ({
          id: word.id,
          original: word.original,
          originalSentence: word.originalSentence,
          normalized: word.normalized,
          stem: word.stem,
          createdAt: word.createdAt,
          updatedAt: word.updatedAt,
        }));
        return tx.table("words").clear().then(() => tx.table("words").bulkPut(sanitized));
      });
    });
  }
}

export const db = new SubtitleLearnerDB();

let dbReadyPromise: Promise<boolean> | null = null;
let dbReady = false;
let dbUnavailable = false;

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
      .catch(() => {
        dbUnavailable = true;
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
  } catch {
    return fallback;
  }
}

export async function withDbVoid(action: () => PromiseLike<unknown> | void): Promise<void> {
  const ready = await ensureDbReady();
  if (!ready) return;
  try {
    await action();
  } catch {
    // Swallow DB errors to avoid uncaught promise rejections in constrained environments.
  }
}

export function resetDbStateForTests(): void {
  dbReadyPromise = null;
  dbReady = false;
  dbUnavailable = false;
}

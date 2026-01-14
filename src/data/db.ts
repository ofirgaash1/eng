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

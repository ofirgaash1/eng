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
      words: "&id, normalized, stem, status, updatedAt",
      subtitleFiles: "&id, bytesHash, addedAt",
      prefs: "&id, updatedAt",
    });
    this.version(2).stores({
      words: "&id, normalized, stem, status, updatedAt",
      subtitleFiles: "&id, bytesHash, addedAt",
      prefs: "&id, updatedAt",
      subtitleCues: "&id, fileHash, index",
      sessions: "&id, updatedAt",
    });
  }
}

export const db = new SubtitleLearnerDB();

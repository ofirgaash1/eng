import Dexie from "dexie";
export class SubtitleLearnerDB extends Dexie {
    constructor() {
        super("subtitle-learner");
        Object.defineProperty(this, "words", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "subtitleFiles", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "subtitleCues", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "prefs", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "sessions", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
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
//# sourceMappingURL=db.js.map
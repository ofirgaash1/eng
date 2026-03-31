import { describe, expect, it } from "vitest";
import { serializeTrackedBackupData } from "./backupRepo";

describe("serializeTrackedBackupData", () => {
  it("ignores exportedAt, cue tokens, and record ordering", () => {
    const first = {
      version: 1,
      exportedAt: "2026-03-31T10:00:00.000Z",
      data: {
        words: [
          {
            id: "b",
            original: "Bravo",
            normalized: "bravo",
            stem: "bravo",
            createdAt: 2,
            updatedAt: 3,
          },
          {
            id: "a",
            original: "Alpha",
            normalized: "alpha",
            stem: "alpha",
            createdAt: 1,
            updatedAt: 2,
          },
        ],
        subtitleFiles: [
          {
            id: "file-b",
            name: "b.srt",
            bytesHash: "hash-b",
            totalCues: 2,
            addedAt: 20,
          },
        ],
        subtitleCues: [
          {
            id: "hash-b:1",
            fileHash: "hash-b",
            index: 1,
            startMs: 1000,
            endMs: 2000,
            rawText: "Bravo",
            tokens: [{ text: "Bravo", normalized: "bravo", stem: "bravo", isWord: true }],
          },
          {
            id: "hash-b:0",
            fileHash: "hash-b",
            index: 0,
            startMs: 0,
            endMs: 900,
            rawText: "Alpha",
            tokens: [{ text: "Alpha", normalized: "alpha", stem: "alpha", isWord: true }],
          },
        ],
      },
    };

    const second = {
      version: 1,
      exportedAt: "2026-03-31T11:00:00.000Z",
      data: {
        words: [
          {
            id: "a",
            original: "Alpha",
            normalized: "alpha",
            stem: "alpha",
            createdAt: 1,
            updatedAt: 2,
          },
          {
            id: "b",
            original: "Bravo",
            normalized: "bravo",
            stem: "bravo",
            createdAt: 2,
            updatedAt: 3,
          },
        ],
        subtitleFiles: [
          {
            id: "file-b",
            name: "b.srt",
            bytesHash: "hash-b",
            totalCues: 2,
            addedAt: 20,
          },
        ],
        subtitleCues: [
          {
            id: "hash-b:0",
            fileHash: "hash-b",
            index: 0,
            startMs: 0,
            endMs: 900,
            rawText: "Alpha",
          },
          {
            id: "hash-b:1",
            fileHash: "hash-b",
            index: 1,
            startMs: 1000,
            endMs: 2000,
            rawText: "Bravo",
          },
        ],
      },
    };

    expect(serializeTrackedBackupData(first)).toBe(serializeTrackedBackupData(second));
  });
});

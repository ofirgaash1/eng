import type { Cue, SubtitleCueRecord } from "../core/types";
import { db, withDb, withDbVoid } from "./db";
import { indexCandidateWordsForFile } from "./candidateWordsRepo";

function isValidCue(cue: Cue): boolean {
  return (
    Number.isInteger(cue.index) &&
    cue.index >= 0 &&
    Number.isFinite(cue.startMs) &&
    cue.startMs >= 0 &&
    Number.isFinite(cue.endMs) &&
    cue.endMs >= cue.startMs &&
    typeof cue.rawText === "string" &&
    cue.rawText.trim().length > 0
  );
}

function isValidCueRecord(record: SubtitleCueRecord): boolean {
  return isValidCue({
    index: record.index,
    startMs: record.startMs,
    endMs: record.endMs,
    rawText: record.rawText,
    tokens: record.tokens,
  });
}

function toCue(record: SubtitleCueRecord): Cue {
  const { index, startMs, endMs, rawText, tokens } = record;
  return {
    index,
    startMs,
    endMs,
    rawText,
    tokens,
  };
}

function toRecord(fileHash: string, cue: Cue): SubtitleCueRecord {
  return {
    id: `${fileHash}:${cue.index}`,
    fileHash,
    index: cue.index,
    startMs: cue.startMs,
    endMs: cue.endMs,
    rawText: cue.rawText,
    tokens: cue.tokens ?? [],
  };
}

export async function getCuesForFile(fileHash: string): Promise<Cue[] | undefined> {
  return withDb(undefined, async () => {
    const records = await db.subtitleCues.where("fileHash").equals(fileHash).sortBy("index");
    const validRecords = records.filter(isValidCueRecord);
    if (validRecords.length === 0) {
      return undefined;
    }
    return validRecords.map(toCue);
  });
}

export async function saveCuesForFile(fileHash: string, cues: Cue[]): Promise<void> {
  const validCues = cues.filter(isValidCue);
  await withDbVoid(() =>
    db.transaction("rw", db.subtitleCues, async () => {
      await db.subtitleCues.where("fileHash").equals(fileHash).delete();
      if (validCues.length > 0) {
        await db.subtitleCues.bulkPut(validCues.map((cue) => toRecord(fileHash, cue)));
      }
    })
  );
  await indexCandidateWordsForFile(fileHash, validCues);
}

export async function deleteCuesForFile(fileHash: string): Promise<void> {
  await withDbVoid(() => db.subtitleCues.where("fileHash").equals(fileHash).delete());
}

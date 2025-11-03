import type { Cue, SubtitleCueRecord } from "../core/types";
import { db } from "./db";

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
  const records = await db.subtitleCues.where("fileHash").equals(fileHash).sortBy("index");
  if (records.length === 0) {
    return undefined;
  }
  return records.map(toCue);
}

export async function saveCuesForFile(fileHash: string, cues: Cue[]): Promise<void> {
  await db.transaction("rw", db.subtitleCues, async () => {
    await db.subtitleCues.where("fileHash").equals(fileHash).delete();
    if (cues.length > 0) {
      await db.subtitleCues.bulkPut(cues.map((cue) => toRecord(fileHash, cue)));
    }
  });
}

export async function deleteCuesForFile(fileHash: string): Promise<void> {
  await db.subtitleCues.where("fileHash").equals(fileHash).delete();
}

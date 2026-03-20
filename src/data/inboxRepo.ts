import type { Cue } from "../core/types";
import { rebuildAllCandidateWords } from "./candidateWordsRepo";
import { getCuesForFile } from "./cuesRepo";
import { listSubtitleFiles } from "./filesRepo";

export async function listStoredSubtitleCueRecords(): Promise<
  Array<{ fileHash: string; cues: Cue[] }>
> {
  const files = await listSubtitleFiles();
  const records: Array<{ fileHash: string; cues: Cue[] }> = [];

  for (const file of files) {
    const cues = await getCuesForFile(file.bytesHash);
    if (cues && cues.length > 0) {
      records.push({ fileHash: file.bytesHash, cues });
    }
  }

  return records;
}

export async function rebuildInboxFromStoredSubtitleFiles(): Promise<number> {
  const records = await listStoredSubtitleCueRecords();
  await rebuildAllCandidateWords(records);
  return records.length;
}

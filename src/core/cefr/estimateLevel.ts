import type { UnknownWord } from "../types";
import { levelLexicon, type CefrBucket, type CefrLevel } from "./lexicon";

const LEVELS: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
const BUCKETS: CefrBucket[] = [...LEVELS, "Unknown"];

export function estimateCefrLevel(word: Pick<UnknownWord, "normalized">): CefrBucket {
  const normalized = word.normalized.toLowerCase();
  for (const level of LEVELS) {
    if (levelLexicon[level].has(normalized)) {
      return level;
    }
  }
  return "Unknown";
}

export function summarizeLevels(words: UnknownWord[]) {
  const counts: Record<CefrBucket, number> = {
    A1: 0,
    A2: 0,
    B1: 0,
    B2: 0,
    C1: 0,
    C2: 0,
    Unknown: 0,
  };

  for (const word of words) {
    const level = estimateCefrLevel(word);
    counts[level] += 1;
  }

  return { buckets: BUCKETS, counts };
}

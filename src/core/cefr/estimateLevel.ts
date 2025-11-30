import type { UnknownWord } from "../types";
import { levelLexicon, type CefrLevel } from "./lexicon";

const LEVELS: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

function fallbackByLength(normalized: string): CefrLevel {
  if (normalized.length <= 4) return "A2";
  if (normalized.length <= 6) return "B1";
  if (normalized.length <= 8) return "B2";
  if (normalized.length <= 12) return "C1";
  return "C2";
}

export function estimateCefrLevel(word: Pick<UnknownWord, "normalized">): CefrLevel {
  const normalized = word.normalized.toLowerCase();
  for (const level of LEVELS) {
    if (levelLexicon[level].has(normalized)) {
      return level;
    }
  }
  return fallbackByLength(normalized);
}

export function summarizeLevels(words: UnknownWord[]) {
  const counts: Record<CefrLevel, number> = {
    A1: 0,
    A2: 0,
    B1: 0,
    B2: 0,
    C1: 0,
    C2: 0,
  };

  for (const word of words) {
    const level = estimateCefrLevel(word);
    counts[level] += 1;
  }

  return { counts };
}

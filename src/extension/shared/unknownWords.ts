import { nanoid } from "nanoid";
import type { Token, UnknownWord } from "../../core/types";
import { tokenize } from "../../core/nlp/tokenize";

function sortWords(words: UnknownWord[]): UnknownWord[] {
  return [...words].sort((a, b) => b.updatedAt - a.updatedAt);
}

function normalizeTokenInput(input: Token | string): Token | undefined {
  if (typeof input !== "string") {
    return input;
  }

  const [first] = tokenize(input);
  return first;
}

export function upsertUnknownWord(
  words: UnknownWord[],
  input: Token | string,
  originalSentence?: string,
): { nextWords: UnknownWord[]; savedWord?: UnknownWord } {
  const token = normalizeTokenInput(input);
  if (!token || !token.isWord) {
    return { nextWords: words };
  }

  const existing = words.find(
    (word) => word.normalized === token.normalized || word.stem === token.stem,
  );
  const now = Date.now();

  if (existing) {
    const updated: UnknownWord = {
      ...existing,
      updatedAt: now,
      original: existing.original || token.text,
      originalSentence: originalSentence ?? existing.originalSentence,
    };

    return {
      nextWords: sortWords(words.map((word) => (word.id === existing.id ? updated : word))),
      savedWord: updated,
    };
  }

  const next: UnknownWord = {
    id: nanoid(),
    original: token.text,
    originalSentence,
    normalized: token.normalized,
    stem: token.stem,
    createdAt: now,
    updatedAt: now,
  };

  return {
    nextWords: sortWords([...words, next]),
    savedWord: next,
  };
}

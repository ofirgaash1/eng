import { nanoid } from "nanoid";
import { create } from "zustand";
import type { Token, UnknownWord } from "../core/types";
import { tokenize } from "../core/nlp/tokenize";
import {
  deleteWord as deleteWordFromDb,
  getAllWords,
  replaceAllWords,
  saveWord,
} from "../data/wordsRepo";

interface DictionaryState {
  words: UnknownWord[];
  initialized: boolean;
  initialize: () => Promise<void>;
  addUnknownWordFromToken: (token: Token | string, originalSentence?: string) => Promise<void>;
  updateWord: (id: string, updates: Partial<Omit<UnknownWord, "id" | "createdAt">>) => Promise<void>;
  removeWord: (id: string) => Promise<void>;
  importWords: (words: ImportedUnknownWord[]) => Promise<void>;
  classForToken: (token: Token) => string;
}

export interface ImportedUnknownWord {
  id?: string;
  original?: string;
  originalSentence?: string;
  normalized?: string;
  stem?: string;
  createdAt?: number;
  updatedAt?: number;
}

function sortWords(words: UnknownWord[]): UnknownWord[] {
  return [...words].sort((a, b) => b.updatedAt - a.updatedAt);
}

function normalizeToken(token: Token | string) {
  if (typeof token === "string") {
    const [first] = tokenize(token);
    return first;
  }
  return token;
}

export const useDictionaryStore = create<DictionaryState>((set, get) => ({
  words: [],
  initialized: false,
  initialize: async () => {
    if (get().initialized) return;
    const stored = await getAllWords();
    set({ words: sortWords(stored), initialized: true });
  },
  addUnknownWordFromToken: async (input, originalSentence) => {
    const token = normalizeToken(input);
    if (!token || !token.isWord) return;

    const existing = get().words.find(
      (word) => word.normalized === token.normalized || word.stem === token.stem
    );
    const now = Date.now();

    if (existing) {
      const updated: UnknownWord = {
        ...existing,
        updatedAt: now,
        original: existing.original || token.text,
        originalSentence: originalSentence ?? existing.originalSentence,
      };
      set((state) => ({
        words: sortWords(state.words.map((word) => (word.id === existing.id ? updated : word))),
      }));
      await saveWord(updated);
      return;
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

    set((state) => ({ words: sortWords([...state.words, next]) }));
    await saveWord(next);
  },
  updateWord: async (id, updates) => {
    const current = get().words.find((word) => word.id === id);
    if (!current) return;

    const updated: UnknownWord = {
      ...current,
      ...updates,
      updatedAt: Date.now(),
    };

    set((state) => ({
      words: sortWords(state.words.map((word) => (word.id === id ? updated : word))),
    }));

    await saveWord(updated);
  },
  removeWord: async (id) => {
    set((state) => ({ words: state.words.filter((word) => word.id !== id) }));
    await deleteWordFromDb(id);
  },
  importWords: async (incoming) => {
    const now = Date.now();
    const keyFor = (word: Pick<UnknownWord, "normalized" | "stem">) =>
      `${word.normalized}::${word.stem}`;

    const map = new Map<string, UnknownWord>();
    for (const word of get().words) {
      map.set(keyFor(word), word);
    }

    for (const candidate of incoming) {
      if (!candidate.normalized || !candidate.stem) continue;
      const key = `${candidate.normalized}::${candidate.stem}`;
      const previous = map.get(key);

      map.set(key, {
        id: candidate.id ?? previous?.id ?? nanoid(),
        original: candidate.original ?? previous?.original ?? candidate.normalized,
        originalSentence: candidate.originalSentence ?? previous?.originalSentence,
        normalized: candidate.normalized,
        stem: candidate.stem,
        createdAt: candidate.createdAt ?? previous?.createdAt ?? now,
        updatedAt: candidate.updatedAt ?? now,
      });
    }

    const next = sortWords(Array.from(map.values()));
    set({ words: next, initialized: true });
    await replaceAllWords(next);
  },
  classForToken: (token) => {
    const exact = new Set(get().words.map((word) => word.normalized));
    const variants = new Set(get().words.map((word) => word.stem));
    if (exact.has(token.normalized)) {
      return "hl-exact text-white";
    }
    if (variants.has(token.stem)) {
      return "hl-variant text-white";
    }
    return "bg-transparent";
  },
}));

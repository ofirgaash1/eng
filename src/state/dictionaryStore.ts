import { nanoid } from "nanoid";
import { create } from "zustand";
import type { Token, UnknownWord } from "../core/types";
import { tokenize } from "../core/nlp/tokenize";

interface DictionaryState {
  words: UnknownWord[];
  addUnknownWordFromToken: (token: Token | string) => void;
  updateWord: (id: string, updates: Partial<Omit<UnknownWord, "id" | "createdAt">>) => void;
  classForToken: (token: Token) => string;
}

const statusOrder: Record<UnknownWord["status"], number> = {
  learning: 0,
  known: 1,
};

function normalizeToken(token: Token | string) {
  if (typeof token === "string") {
    const [first] = tokenize(token);
    return first;
  }
  return token;
}

export const useDictionaryStore = create<DictionaryState>((set, get) => ({
  words: [],
  addUnknownWordFromToken: (input) => {
    const token = normalizeToken(input);
    if (!token.isWord) return;

    set((state) => {
      const existing = state.words.find(
        (word) => word.normalized === token.normalized || word.stem === token.stem
      );
      if (existing) {
        return {
          words: state.words.map((word) =>
            word.id === existing.id
              ? { ...word, updatedAt: Date.now(), original: word.original || token.text }
              : word
          ),
        };
      }

      const now = Date.now();
      const next: UnknownWord = {
        id: nanoid(),
        original: token.text,
        normalized: token.normalized,
        stem: token.stem,
        createdAt: now,
        updatedAt: now,
        status: "learning",
      };
      const list = [...state.words, next];
      list.sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || b.updatedAt - a.updatedAt);
      return { words: list };
    });
  },
  updateWord: (id, updates) => {
    set((state) => ({
      words: state.words
        .map((word) =>
          word.id === id
            ? {
                ...word,
                ...updates,
                updatedAt: Date.now(),
              }
            : word
        )
        .sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || b.updatedAt - a.updatedAt),
    }));
  },
  classForToken: (token) => {
    const words = get().words;
    const exact = new Set(words.map((word) => word.normalized));
    if (exact.has(token.normalized)) {
      return "hl-exact text-white";
    }
    const variants = new Set(words.map((word) => word.stem));
    if (variants.has(token.stem)) {
      return "hl-variant text-white";
    }
    return "bg-transparent";
  },
}));

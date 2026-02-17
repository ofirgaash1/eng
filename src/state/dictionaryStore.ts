import { nanoid } from "nanoid";
import { create } from "zustand";
import type { CandidateWordStat, Token, UnknownWord, WordDecision } from "../core/types";
import { stem } from "../core/nlp/stem";
import { tokenize } from "../core/nlp/tokenize";
import {
  deleteWord as deleteWordFromDb,
  getAllWords,
  replaceAllWords,
  saveWord,
} from "../data/wordsRepo";
import { getWordDecisions, listCandidateWordSources, saveWordDecision } from "../data/candidateWordsRepo";

interface DictionaryState {
  words: UnknownWord[];
  candidateWords: CandidateWordStat[];
  decisions: Record<string, WordDecision>;
  initialized: boolean;
  initialize: () => Promise<void>;
  addUnknownWordFromToken: (token: Token | string, originalSentence?: string) => Promise<void>;
  updateWord: (id: string, updates: Partial<Omit<UnknownWord, "id" | "createdAt">>) => Promise<void>;
  removeWord: (id: string) => Promise<void>;
  importWords: (words: ImportedUnknownWord[]) => Promise<void>;
  reanalyzeStems: () => Promise<void>;
  classForToken: (token: Token) => string;
  refreshCandidateWords: () => Promise<void>;
  setWordDecision: (normalized: string, decision: WordDecision) => Promise<void>;
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

function applyStemAnalysis(words: UnknownWord[]) {
  let changed = false;
  const next = words.map((word) => {
    const nextStem = stem(word.normalized);
    if (nextStem === word.stem) return word;
    changed = true;
    return { ...word, stem: nextStem };
  });
  return { next, changed };
}

export const useDictionaryStore = create<DictionaryState>((set, get) => ({
  words: [],
  candidateWords: [],
  decisions: {},
  initialized: false,
  initialize: async () => {
    if (get().initialized) return;
    const [stored, candidateSources, decisionRows] = await Promise.all([
      getAllWords(),
      listCandidateWordSources(),
      getWordDecisions(),
    ]);
    const { next, changed } = applyStemAnalysis(stored);
    const sorted = sortWords(next);
    const aggregate = new Map<string, CandidateWordStat>();
    for (const source of candidateSources) {
      const existing = aggregate.get(source.normalized);
      if (existing) {
        existing.subtitleCount += source.count;
        existing.sourceCount += 1;
        if (source.updatedAt > existing.updatedAt) {
          existing.updatedAt = source.updatedAt;
          existing.example = source.example || existing.example;
          existing.stem = source.stem || existing.stem;
        }
      } else {
        aggregate.set(source.normalized, {
          normalized: source.normalized,
          stem: source.stem,
          subtitleCount: source.count,
          sourceCount: 1,
          example: source.example,
          updatedAt: source.updatedAt,
        });
      }
    }
    const decisions = Object.fromEntries(decisionRows.map((row) => [row.normalized, row.decision] as const));
    set({
      words: sorted,
      candidateWords: Array.from(aggregate.values()),
      decisions,
      initialized: true,
    });
    if (changed) {
      await replaceAllWords(sorted);
    }
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
      if (!candidate.normalized) continue;
      const normalized = candidate.normalized;
      const candidateStem = candidate.stem ?? stem(normalized);
      const key = `${normalized}::${candidateStem}`;
      const previous = map.get(key);

      map.set(key, {
        id: candidate.id ?? previous?.id ?? nanoid(),
        original: candidate.original ?? previous?.original ?? normalized,
        originalSentence: candidate.originalSentence ?? previous?.originalSentence,
        normalized,
        stem: candidateStem,
        createdAt: candidate.createdAt ?? previous?.createdAt ?? now,
        updatedAt: candidate.updatedAt ?? now,
      });
    }

    const next = sortWords(Array.from(map.values()));
    set({ words: next, initialized: true });
    await replaceAllWords(next);
  },
  reanalyzeStems: async () => {
    const { next, changed } = applyStemAnalysis(get().words);
    if (!changed) return;
    const sorted = sortWords(next);
    set({ words: sorted });
    await replaceAllWords(sorted);
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
  refreshCandidateWords: async () => {
    const [candidateSources, decisionRows] = await Promise.all([
      listCandidateWordSources(),
      getWordDecisions(),
    ]);
    const aggregate = new Map<string, CandidateWordStat>();
    for (const source of candidateSources) {
      const existing = aggregate.get(source.normalized);
      if (existing) {
        existing.subtitleCount += source.count;
        existing.sourceCount += 1;
        if (source.updatedAt > existing.updatedAt) {
          existing.updatedAt = source.updatedAt;
          existing.example = source.example || existing.example;
          existing.stem = source.stem || existing.stem;
        }
      } else {
        aggregate.set(source.normalized, {
          normalized: source.normalized,
          stem: source.stem,
          subtitleCount: source.count,
          sourceCount: 1,
          example: source.example,
          updatedAt: source.updatedAt,
        });
      }
    }
    const decisions = Object.fromEntries(decisionRows.map((row) => [row.normalized, row.decision] as const));
    set({ candidateWords: Array.from(aggregate.values()), decisions });
  },
  setWordDecision: async (normalized, decision) => {
    set((state) => ({ decisions: { ...state.decisions, [normalized]: decision } }));
    await saveWordDecision(normalized, decision);
  },
}));

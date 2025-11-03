import { nanoid } from "nanoid";
import { create } from "zustand";
import { tokenize } from "../core/nlp/tokenize";
import { deleteWord as deleteWordFromDb, getAllWords, replaceAllWords, saveWord, } from "../data/wordsRepo";
const statusOrder = {
    learning: 0,
    known: 1,
};
function sortWords(words) {
    return [...words].sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || b.updatedAt - a.updatedAt);
}
function normalizeToken(token) {
    if (typeof token === "string") {
        const [first] = tokenize(token);
        return first;
    }
    return token;
}
export const useDictionaryStore = create((set, get) => ({
    words: [],
    initialized: false,
    initialize: async () => {
        if (get().initialized)
            return;
        const stored = await getAllWords();
        set({ words: sortWords(stored), initialized: true });
    },
    addUnknownWordFromToken: async (input) => {
        const token = normalizeToken(input);
        if (!token || !token.isWord)
            return;
        const existing = get().words.find((word) => word.normalized === token.normalized || word.stem === token.stem);
        const now = Date.now();
        if (existing) {
            const updated = {
                ...existing,
                updatedAt: now,
                original: existing.original || token.text,
                status: "learning",
            };
            set((state) => ({
                words: sortWords(state.words.map((word) => (word.id === existing.id ? updated : word))),
            }));
            await saveWord(updated);
            return;
        }
        const next = {
            id: nanoid(),
            original: token.text,
            normalized: token.normalized,
            stem: token.stem,
            createdAt: now,
            updatedAt: now,
            status: "learning",
        };
        set((state) => ({ words: sortWords([...state.words, next]) }));
        await saveWord(next);
    },
    updateWord: async (id, updates) => {
        const current = get().words.find((word) => word.id === id);
        if (!current)
            return;
        const updated = {
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
        const keyFor = (word) => `${word.normalized}::${word.stem}`;
        const map = new Map();
        for (const word of get().words) {
            map.set(keyFor(word), word);
        }
        for (const candidate of incoming) {
            if (!candidate.normalized || !candidate.stem)
                continue;
            const key = `${candidate.normalized}::${candidate.stem}`;
            const previous = map.get(key);
            const translation = candidate.translation ?? previous?.translation;
            const notes = candidate.notes ?? previous?.notes;
            map.set(key, {
                id: candidate.id ?? previous?.id ?? nanoid(),
                original: candidate.original ?? previous?.original ?? candidate.normalized,
                normalized: candidate.normalized,
                stem: candidate.stem,
                translation: translation ? translation.trim() || undefined : undefined,
                notes: notes ? notes.trim() || undefined : undefined,
                status: candidate.status ?? previous?.status ?? "learning",
                createdAt: candidate.createdAt ?? previous?.createdAt ?? now,
                updatedAt: candidate.updatedAt ?? now,
            });
        }
        const next = sortWords(Array.from(map.values()));
        set({ words: next, initialized: true });
        await replaceAllWords(next);
    },
    classForToken: (token) => {
        const exact = new Set();
        const variants = new Set();
        for (const word of get().words) {
            if (word.status !== "learning")
                continue;
            exact.add(word.normalized);
            variants.add(word.stem);
        }
        if (exact.has(token.normalized)) {
            return "hl-exact text-white";
        }
        if (variants.has(token.stem)) {
            return "hl-variant text-white";
        }
        return "bg-transparent";
    },
}));
//# sourceMappingURL=dictionaryStore.js.map
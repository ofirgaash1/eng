import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState, } from "react";
import { useDictionaryStore } from "../../state/dictionaryStore";
import { listSubtitleFiles, upsertSubtitleFile, deleteSubtitleFile } from "../../data/filesRepo";
import { getCuesForFile, saveCuesForFile } from "../../data/cuesRepo";
import { hashBlob } from "../../utils/file";
import { tokenize } from "../../core/nlp/tokenize";
import { parseSrt } from "../../core/parsing/srtParser";
const CONTEXT_OPTIONS = [0, 1, 2, 3];
function formatTime(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60)
        .toString()
        .padStart(2, "0");
    const seconds = (totalSeconds % 60).toString().padStart(2, "0");
    return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
}
function tokensMatchWord(tokens, word) {
    return tokens.some((token) => token.isWord &&
        (token.normalized === word.normalized || token.stem === word.stem));
}
function parseTextWithFallback(text) {
    return parseSrt(text).map((cue) => ({
        ...cue,
        tokens: cue.tokens ?? tokenize(cue.rawText),
    }));
}
export default function QuotesPage() {
    const [selectedWordId, setSelectedWordId] = useState(null);
    const [contextRadius, setContextRadius] = useState(1);
    const [library, setLibrary] = useState([]);
    const [libraryLoading, setLibraryLoading] = useState(false);
    const [processingFiles, setProcessingFiles] = useState(false);
    const [error, setError] = useState(null);
    const [cuesByHash, setCuesByHash] = useState({});
    const workerRef = useRef(null);
    const pendingParsesRef = useRef(new Map());
    const dictionaryInitialized = useDictionaryStore((state) => state.initialized);
    const initializeDictionary = useDictionaryStore((state) => state.initialize);
    const words = useDictionaryStore((state) => state.words);
    useEffect(() => {
        if (!dictionaryInitialized) {
            void initializeDictionary();
        }
    }, [dictionaryInitialized, initializeDictionary]);
    useEffect(() => {
        const worker = new Worker(new URL("../../workers/srtWorker.ts", import.meta.url), {
            type: "module",
        });
        const handleMessage = (event) => {
            const pending = pendingParsesRef.current.get(event.data.id);
            if (!pending) {
                return;
            }
            pendingParsesRef.current.delete(event.data.id);
            if (event.data.error) {
                pending.reject(new Error(event.data.error));
                return;
            }
            pending.resolve(event.data.cues);
        };
        worker.addEventListener("message", handleMessage);
        workerRef.current = worker;
        return () => {
            worker.removeEventListener("message", handleMessage);
            worker.terminate();
            workerRef.current = null;
            for (const [, pending] of pendingParsesRef.current) {
                pending.reject(new Error("Parsing cancelled"));
            }
            pendingParsesRef.current.clear();
        };
    }, []);
    const parseWithWorker = useCallback(async (text) => {
        const worker = workerRef.current;
        if (!worker) {
            return parseTextWithFallback(text);
        }
        const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
        return new Promise((resolve, reject) => {
            pendingParsesRef.current.set(id, { resolve, reject });
            worker.postMessage({ id, text });
        });
    }, []);
    const refreshLibrary = useCallback(async () => {
        setLibraryLoading(true);
        try {
            const files = await listSubtitleFiles();
            setLibrary(files);
        }
        finally {
            setLibraryLoading(false);
        }
    }, []);
    useEffect(() => {
        void refreshLibrary();
    }, [refreshLibrary]);
    useEffect(() => {
        let cancelled = false;
        if (library.length === 0) {
            setCuesByHash({});
            return;
        }
        void (async () => {
            const entries = await Promise.all(library.map(async (file) => {
                const cues = await getCuesForFile(file.bytesHash);
                return [file.bytesHash, cues ?? []];
            }));
            if (cancelled) {
                return;
            }
            const map = {};
            for (const [hash, cues] of entries) {
                map[hash] = cues;
            }
            setCuesByHash(map);
        })();
        return () => {
            cancelled = true;
        };
    }, [library]);
    const learningWords = useMemo(() => words.filter((word) => word.status === "learning"), [words]);
    useEffect(() => {
        if (learningWords.length === 0) {
            setSelectedWordId(null);
            return;
        }
        if (!selectedWordId || !learningWords.some((word) => word.id === selectedWordId)) {
            setSelectedWordId(learningWords[0].id);
        }
    }, [learningWords, selectedWordId]);
    const selectedWord = useMemo(() => learningWords.find((word) => word.id === selectedWordId) ?? null, [learningWords, selectedWordId]);
    const quotes = useMemo(() => {
        if (!selectedWord) {
            return [];
        }
        const results = [];
        for (const file of library) {
            const cues = cuesByHash[file.bytesHash] ?? [];
            cues.forEach((cue, index) => {
                const tokens = cue.tokens ?? tokenize(cue.rawText);
                if (!tokensMatchWord(tokens, selectedWord)) {
                    return;
                }
                const startIndex = Math.max(0, index - contextRadius);
                const endIndex = Math.min(cues.length - 1, index + contextRadius);
                const contextCues = cues.slice(startIndex, endIndex + 1);
                results.push({
                    id: `${file.id}:${cue.index}:${startIndex}:${endIndex}`,
                    file,
                    focusIndex: index - startIndex,
                    cues: contextCues,
                    contextStartMs: contextCues[0]?.startMs ?? cue.startMs,
                    contextEndMs: contextCues[contextCues.length - 1]?.endMs ?? cue.endMs,
                });
            });
        }
        return results.sort((a, b) => {
            if (a.file.name === b.file.name) {
                return a.contextStartMs - b.contextStartMs;
            }
            return a.file.name.localeCompare(b.file.name);
        });
    }, [selectedWord, library, cuesByHash, contextRadius]);
    const handleSelectWord = useCallback((wordId) => {
        setSelectedWordId(wordId);
    }, []);
    const handleContextChange = useCallback((event) => {
        setContextRadius(Number(event.target.value));
    }, []);
    const handleAddFiles = useCallback(async (event) => {
        const fileList = event.target.files;
        if (!fileList || fileList.length === 0) {
            return;
        }
        setProcessingFiles(true);
        setError(null);
        try {
            for (const file of Array.from(fileList)) {
                try {
                    const hash = await hashBlob(file);
                    let cues = await getCuesForFile(hash);
                    if (!cues) {
                        const text = await file.text();
                        cues = await parseWithWorker(text);
                        await saveCuesForFile(hash, cues);
                    }
                    await upsertSubtitleFile({ name: file.name, bytesHash: hash, totalCues: cues.length });
                }
                catch (fileError) {
                    const message = fileError instanceof Error ? fileError.message : "Failed to add subtitle file.";
                    setError(`Failed to process ${file.name}: ${message}`);
                }
            }
            await refreshLibrary();
        }
        finally {
            setProcessingFiles(false);
            event.target.value = "";
        }
    }, [parseWithWorker, refreshLibrary]);
    const handleRemoveFile = useCallback(async (file) => {
        await deleteSubtitleFile(file.id);
        setCuesByHash((current) => {
            const next = { ...current };
            delete next[file.bytesHash];
            return next;
        });
        await refreshLibrary();
    }, [refreshLibrary]);
    return (_jsxs("div", { className: "grid gap-6 lg:grid-cols-[1fr,2fr]", children: [_jsx("section", { className: "space-y-4", children: _jsxs("div", { className: "rounded-lg bg-black/40 p-4", children: [_jsx("h2", { className: "text-lg font-semibold", children: "Unknown words" }), learningWords.length === 0 ? (_jsx("p", { className: "mt-3 text-sm text-white/60", children: "Add words from the player to explore their quotes." })) : (_jsx("ul", { className: "mt-3 space-y-2", children: learningWords.map((word) => (_jsx("li", { children: _jsxs("button", { type: "button", onClick: () => handleSelectWord(word.id), className: `flex w-full flex-col gap-1 rounded-lg border px-3 py-2 text-left transition focus:outline-none focus-visible:outline-none ${word.id === selectedWordId
                                        ? "border-emerald-500 bg-emerald-500/10 text-white"
                                        : "border-white/10 bg-white/5 text-white/80 hover:border-white/20 hover:text-white"}`, children: [_jsx("span", { className: "text-sm font-medium text-white", children: word.original }), _jsx("div", { className: "text-xs text-white/60", children: word.translation ? _jsx("span", { children: word.translation }) : _jsx("span", { children: "No translation yet" }) })] }) }, word.id))) }))] }) }), _jsxs("section", { className: "space-y-6", children: [_jsxs("div", { className: "rounded-lg bg-black/40 p-4", children: [_jsxs("div", { className: "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-lg font-semibold", children: "Subtitle sources" }), _jsx("p", { className: "text-sm text-white/60", children: "Quotes are gathered from the files listed below." })] }), _jsxs("label", { className: "inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-white/20 bg-white/5 px-3 py-2 text-sm text-white/80 transition hover:border-white/40", children: [_jsx("input", { type: "file", accept: ".srt", multiple: true, className: "hidden", onChange: handleAddFiles }), _jsx("span", { className: "font-medium", children: "Add subtitles" })] })] }), processingFiles && (_jsx("p", { className: "mt-3 text-xs text-white/50", children: "Processing subtitle files\u2026" })), error && _jsx("p", { className: "mt-2 text-xs text-red-400", children: error }), _jsx("ul", { className: "mt-4 space-y-2", children: libraryLoading ? (_jsx("li", { className: "text-sm text-white/60", children: "Loading files\u2026" })) : library.length === 0 ? (_jsx("li", { className: "text-sm text-white/60", children: "No subtitle files stored yet." })) : (library.map((file) => (_jsxs("li", { className: "flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80", children: [_jsxs("div", { children: [_jsx("div", { className: "font-medium text-white", children: file.name }), _jsxs("div", { className: "text-xs text-white/50", children: [file.totalCues, " cues \u00B7 Added ", new Date(file.addedAt).toLocaleString()] })] }), _jsx("button", { type: "button", onClick: () => handleRemoveFile(file), className: "rounded bg-white/10 px-2 py-1 text-xs text-white transition hover:bg-white/20 focus:outline-none focus-visible:outline-none", children: "Remove" })] }, file.id)))) })] }), _jsxs("div", { className: "rounded-lg bg-black/40 p-4", children: [_jsxs("div", { className: "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", children: [_jsx("h2", { className: "text-lg font-semibold", children: "Quote contexts" }), _jsxs("label", { className: "flex items-center gap-2 text-sm text-white/70", children: [_jsx("span", { children: "Context lines" }), _jsx("select", { value: contextRadius, onChange: handleContextChange, className: "rounded-md border border-white/20 bg-white/5 px-2 py-1 focus:outline-none focus-visible:outline-none", children: CONTEXT_OPTIONS.map((option) => (_jsx("option", { value: option, children: option }, option))) })] })] }), !selectedWord ? (_jsx("p", { className: "mt-3 text-sm text-white/60", children: "Select a word to see how it appears across your subtitles." })) : quotes.length === 0 ? (_jsx("p", { className: "mt-3 text-sm text-white/60", children: "No quotes found for this word in the stored subtitle files." })) : (_jsx("ul", { className: "mt-4 space-y-4", children: quotes.map((quote) => (_jsxs("li", { className: "space-y-2 rounded-md border border-white/10 bg-white/5 p-3 text-sm text-white/80", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2 text-xs text-white/60", children: [_jsx("span", { className: "font-medium text-white", children: quote.file.name }), _jsxs("span", { children: [formatTime(quote.contextStartMs), " \u2013 ", formatTime(quote.contextEndMs)] })] }), _jsx("div", { className: "space-y-1 rounded bg-black/40 p-2", children: quote.cues.map((cue, index) => (_jsx("p", { className: `whitespace-pre-line ${index === quote.focusIndex ? "font-semibold text-white" : "text-white/80"}`, children: cue.rawText }, `${cue.index}-${index}`))) })] }, quote.id))) }))] })] })] }));
}
//# sourceMappingURL=QuotesPage.js.map
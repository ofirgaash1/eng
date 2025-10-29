import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import type { Cue, SubtitleFile, Token, UnknownWord } from "../../core/types";
import { useDictionaryStore } from "../../state/dictionaryStore";
import { listSubtitleFiles, upsertSubtitleFile, deleteSubtitleFile } from "../../data/filesRepo";
import { getCuesForFile, saveCuesForFile } from "../../data/cuesRepo";
import { hashBlob } from "../../utils/file";
import { tokenize } from "../../core/nlp/tokenize";
import { parseSrt } from "../../core/parsing/srtParser";

interface WorkerResponse {
  id: string;
  cues: Cue[];
  error?: string;
}

type PendingRequest = {
  resolve: (value: Cue[]) => void;
  reject: (reason?: unknown) => void;
};

const CONTEXT_OPTIONS = [0, 1, 2, 3];

function formatTime(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
}

function tokensMatchWord(tokens: Token[], word: UnknownWord) {
  return tokens.some(
    (token) =>
      token.isWord &&
      (token.normalized === word.normalized || token.stem === word.stem)
  );
}

function parseTextWithFallback(text: string): Cue[] {
  return parseSrt(text).map((cue) => ({
    ...cue,
    tokens: cue.tokens ?? tokenize(cue.rawText),
  }));
}

type QuoteResult = {
  id: string;
  file: SubtitleFile;
  focusIndex: number;
  cues: Cue[];
  contextStartMs: number;
  contextEndMs: number;
};

export default function QuotesPage() {
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [contextRadius, setContextRadius] = useState<number>(1);
  const [library, setLibrary] = useState<SubtitleFile[]>([]);
  const [libraryLoading, setLibraryLoading] = useState<boolean>(false);
  const [processingFiles, setProcessingFiles] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [cuesByHash, setCuesByHash] = useState<Record<string, Cue[]>>({});
  const workerRef = useRef<Worker | null>(null);
  const pendingParsesRef = useRef<Map<string, PendingRequest>>(new Map());

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
    const handleMessage = (event: MessageEvent<WorkerResponse>) => {
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

  const parseWithWorker = useCallback(async (text: string): Promise<Cue[]> => {
    const worker = workerRef.current;
    if (!worker) {
      return parseTextWithFallback(text);
    }
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    return new Promise<Cue[]>((resolve, reject) => {
      pendingParsesRef.current.set(id, { resolve, reject });
      worker.postMessage({ id, text });
    });
  }, []);

  const refreshLibrary = useCallback(async () => {
    setLibraryLoading(true);
    try {
      const files = await listSubtitleFiles();
      setLibrary(files);
    } finally {
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
      const entries = await Promise.all(
        library.map(async (file) => {
          const cues = await getCuesForFile(file.bytesHash);
          return [file.bytesHash, cues ?? []] as const;
        })
      );
      if (cancelled) {
        return;
      }
      const map: Record<string, Cue[]> = {};
      for (const [hash, cues] of entries) {
        map[hash] = cues;
      }
      setCuesByHash(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [library]);

  const learningWords = useMemo(
    () => words.filter((word) => word.status === "learning"),
    [words]
  );

  useEffect(() => {
    if (learningWords.length === 0) {
      setSelectedWordId(null);
      return;
    }
    if (!selectedWordId || !learningWords.some((word) => word.id === selectedWordId)) {
      setSelectedWordId(learningWords[0].id);
    }
  }, [learningWords, selectedWordId]);

  const selectedWord = useMemo(
    () => learningWords.find((word) => word.id === selectedWordId) ?? null,
    [learningWords, selectedWordId]
  );

  const quotes = useMemo(() => {
    if (!selectedWord) {
      return [] as QuoteResult[];
    }
    const results: QuoteResult[] = [];
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

  const handleSelectWord = useCallback((wordId: string) => {
    setSelectedWordId(wordId);
  }, []);

  const handleContextChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    setContextRadius(Number(event.target.value));
  }, []);

  const handleAddFiles = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
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
          } catch (fileError) {
            const message =
              fileError instanceof Error ? fileError.message : "Failed to add subtitle file.";
            setError(`Failed to process ${file.name}: ${message}`);
          }
        }
        await refreshLibrary();
      } finally {
        setProcessingFiles(false);
        event.target.value = "";
      }
    },
    [parseWithWorker, refreshLibrary]
  );

  const handleRemoveFile = useCallback(
    async (file: SubtitleFile) => {
      await deleteSubtitleFile(file.id);
      setCuesByHash((current) => {
        const next = { ...current };
        delete next[file.bytesHash];
        return next;
      });
      await refreshLibrary();
    },
    [refreshLibrary]
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr,2fr]">
      <section className="space-y-4">
        <div className="rounded-lg bg-black/40 p-4">
          <h2 className="text-lg font-semibold">Unknown words</h2>
          {learningWords.length === 0 ? (
            <p className="mt-3 text-sm text-white/60">Add words from the player to explore their quotes.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {learningWords.map((word) => (
                <li key={word.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectWord(word.id)}
                    className={`flex w-full flex-col gap-1 rounded-lg border px-3 py-2 text-left transition focus:outline-none focus-visible:outline-none ${
                      word.id === selectedWordId
                        ? "border-emerald-500 bg-emerald-500/10 text-white"
                        : "border-white/10 bg-white/5 text-white/80 hover:border-white/20 hover:text-white"
                    }`}
                  >
                    <span className="text-sm font-medium text-white">{word.original}</span>
                    <div className="text-xs text-white/60">
                      {word.translation ? <span>{word.translation}</span> : <span>No translation yet</span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      <section className="space-y-6">
        <div className="rounded-lg bg-black/40 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Subtitle sources</h2>
              <p className="text-sm text-white/60">Quotes are gathered from the files listed below.</p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-white/20 bg-white/5 px-3 py-2 text-sm text-white/80 transition hover:border-white/40">
              <input type="file" accept=".srt" multiple className="hidden" onChange={handleAddFiles} />
              <span className="font-medium">Add subtitles</span>
            </label>
          </div>
          {processingFiles && (
            <p className="mt-3 text-xs text-white/50">Processing subtitle files…</p>
          )}
          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
          <ul className="mt-4 space-y-2">
            {libraryLoading ? (
              <li className="text-sm text-white/60">Loading files…</li>
            ) : library.length === 0 ? (
              <li className="text-sm text-white/60">No subtitle files stored yet.</li>
            ) : (
              library.map((file) => (
                <li
                  key={file.id}
                  className="flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80"
                >
                  <div>
                    <div className="font-medium text-white">{file.name}</div>
                    <div className="text-xs text-white/50">
                      {file.totalCues} cues · Added {new Date(file.addedAt).toLocaleString()}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(file)}
                    className="rounded bg-white/10 px-2 py-1 text-xs text-white transition hover:bg-white/20 focus:outline-none focus-visible:outline-none"
                  >
                    Remove
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
        <div className="rounded-lg bg-black/40 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold">Quote contexts</h2>
            <label className="flex items-center gap-2 text-sm text-white/70">
              <span>Context lines</span>
              <select
                value={contextRadius}
                onChange={handleContextChange}
                className="rounded-md border border-white/20 bg-white/5 px-2 py-1 focus:outline-none focus-visible:outline-none"
              >
                {CONTEXT_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!selectedWord ? (
            <p className="mt-3 text-sm text-white/60">Select a word to see how it appears across your subtitles.</p>
          ) : quotes.length === 0 ? (
            <p className="mt-3 text-sm text-white/60">No quotes found for this word in the stored subtitle files.</p>
          ) : (
            <ul className="mt-4 space-y-4">
              {quotes.map((quote) => (
                <li key={quote.id} className="space-y-2 rounded-md border border-white/10 bg-white/5 p-3 text-sm text-white/80">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/60">
                    <span className="font-medium text-white">{quote.file.name}</span>
                    <span>
                      {formatTime(quote.contextStartMs)} – {formatTime(quote.contextEndMs)}
                    </span>
                  </div>
                  <div className="space-y-1 rounded bg-black/40 p-2">
                    {quote.cues.map((cue, index) => (
                      <p
                        key={`${cue.index}-${index}`}
                        className={`whitespace-pre-line ${index === quote.focusIndex ? "font-semibold text-white" : "text-white/80"}`}
                      >
                        {cue.rawText}
                      </p>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

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
import { usePrefsStore } from "../../state/prefsStore";
import { listSubtitleFiles, upsertSubtitleFile, deleteSubtitleFile } from "../../data/filesRepo";
import { getCuesForFile, saveCuesForFile } from "../../data/cuesRepo";
import { hashBlob, readSubtitleText } from "../../utils/file";
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
const VIDEO_EXTENSIONS = [".mp4", ".mkv", ".mov", ".avi", ".m4v", ".webm"];

export const UNKNOWN_LIST_DIMENSIONS = {
  minHeight: "60vh",
  maxHeight: "calc(100vh - 10rem)",
};

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
  const [showSubtitleSources, setShowSubtitleSources] = useState<boolean>(true);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [playbackStatus, setPlaybackStatus] = useState<string | null>(null);
  const [playbackRange, setPlaybackRange] = useState<{ startMs: number; endMs: number } | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const pendingParsesRef = useRef<Map<string, PendingRequest>>(new Map());
  const playbackVideoRef = useRef<HTMLVideoElement | null>(null);

  const dictionaryInitialized = useDictionaryStore((state) => state.initialized);
  const initializeDictionary = useDictionaryStore((state) => state.initialize);
  const words = useDictionaryStore((state) => state.words);
  const prefsInitialized = usePrefsStore((state) => state.initialized);
  const initializePrefs = usePrefsStore((state) => state.initialize);
  const mediaLibrary = usePrefsStore((state) => state.prefs.mediaLibrary);

  useEffect(() => {
    if (!dictionaryInitialized) {
      void initializeDictionary();
    }
  }, [dictionaryInitialized, initializeDictionary]);

  useEffect(() => {
    if (!prefsInitialized) {
      void initializePrefs();
    }
  }, [initializePrefs, prefsInitialized]);

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

  const ensureLibraryAccess = useCallback(async () => {
    if (!mediaLibrary?.handle) {
      setPlaybackError("Select a media library folder in Settings to enable playback.");
      return null;
    }
    try {
      const queryPermission = (mediaLibrary.handle as FileSystemDirectoryHandle & {
        queryPermission?: (options: unknown) => Promise<PermissionState>;
        requestPermission?: (options: unknown) => Promise<PermissionState>;
      }).queryPermission;
      const requestPermission = (mediaLibrary.handle as FileSystemDirectoryHandle & {
        requestPermission?: (options: unknown) => Promise<PermissionState>;
      }).requestPermission;

      if (!queryPermission || !requestPermission) {
        return mediaLibrary.handle;
      }

      const permission = await queryPermission.call(mediaLibrary.handle, { mode: "read" });
      if (permission === "granted") {
        return mediaLibrary.handle;
      }
      if (permission === "denied") {
        setPlaybackError("Folder access denied. Re-select the library and allow access.");
        return null;
      }
      const next = await requestPermission.call(mediaLibrary.handle, { mode: "read" });
      if (next === "granted") return mediaLibrary.handle;
      setPlaybackError("Folder access denied. Re-select the library and allow access.");
      return null;
    } catch (error) {
      setPlaybackError(error instanceof Error ? error.message : "Unable to use media library.");
      return null;
    }
  }, [mediaLibrary]);

  const findVideoHandle = useCallback(
    async (baseName: string): Promise<FileSystemFileHandle | null> => {
      const handle = await ensureLibraryAccess();
      if (!handle) return null;
      const target = baseName.toLowerCase();
      const queue: FileSystemDirectoryHandle[] = [handle];

      while (queue.length > 0) {
        const current = queue.shift();
        if (!current) continue;
        const iterator = (current as FileSystemDirectoryHandle & {
          values?: () => AsyncIterable<FileSystemDirectoryHandle | FileSystemFileHandle>;
        }).values;
        if (!iterator) continue;
        for await (const entry of iterator.call(current)) {
          if (entry.kind === "file") {
            const lower = entry.name.toLowerCase();
            if (VIDEO_EXTENSIONS.some((ext) => lower === `${target}${ext}`)) {
              return entry as FileSystemFileHandle;
            }
          } else if (entry.kind === "directory") {
            queue.push(entry as FileSystemDirectoryHandle);
          }
        }
      }

      return null;
    },
    [ensureLibraryAccess]
  );

  const handlePlayQuote = useCallback(
    async (quote: QuoteResult) => {
      setPlaybackError(null);
      setPlaybackStatus("Searching for matching video…");
      const baseName = quote.file.name.replace(/\.[^.]+$/, "");
      try {
        const fileHandle = await findVideoHandle(baseName);
        if (!fileHandle) {
          setPlaybackStatus(null);
          setPlaybackError("No matching video found under the selected media library.");
          return;
        }
        const file = await fileHandle.getFile();
        const nextUrl = URL.createObjectURL(file);
        setPlaybackUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return nextUrl;
        });
        setPlaybackRange({ startMs: quote.contextStartMs, endMs: quote.contextEndMs });
        setPlaybackStatus(`Playing ${fileHandle.name}`);
        queueMicrotask(() => {
          const video = playbackVideoRef.current;
          if (video) {
            video.currentTime = quote.contextStartMs / 1000;
            void video.play();
          }
        });
      } catch (error) {
        setPlaybackStatus(null);
        setPlaybackError(error instanceof Error ? error.message : "Unable to play quote.");
      }
    },
    [findVideoHandle]
  );

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

  useEffect(() => {
    return () => {
      setPlaybackUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }
        return null;
      });
      const video = playbackVideoRef.current;
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
    };
  }, []);

  useEffect(() => {
    const video = playbackVideoRef.current;
    if (!video || !playbackRange) return;
    const handleTimeUpdate = () => {
      if (playbackRange && video.currentTime * 1000 >= playbackRange.endMs) {
        video.pause();
      }
    };
    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
    };
  }, [playbackRange, playbackUrl]);

  const unknownWords = useMemo(() => words, [words]);

  useEffect(() => {
    if (unknownWords.length === 0) {
      setSelectedWordId(null);
      return;
    }
    if (!selectedWordId || !unknownWords.some((word) => word.id === selectedWordId)) {
      setSelectedWordId(unknownWords[0].id);
    }
  }, [unknownWords, selectedWordId]);

  const selectedWord = useMemo(
    () => unknownWords.find((word) => word.id === selectedWordId) ?? null,
    [unknownWords, selectedWordId]
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
              const text = await readSubtitleText(file);
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
          {unknownWords.length === 0 ? (
            <p className="mt-3 text-sm text-white/60">Add words from the player to explore their quotes.</p>
          ) : (
            <div
              className="mt-3 space-y-2 overflow-y-auto pr-1"
              style={{
                minHeight: UNKNOWN_LIST_DIMENSIONS.minHeight,
                maxHeight: UNKNOWN_LIST_DIMENSIONS.maxHeight,
              }}
            >
              {unknownWords.map((word) => (
                <div key={word.id}>
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
                    <div className="text-xs text-white/60">Tap to see contexts</div>
                  </button>
                </div>
              ))}
            </div>
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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSubtitleSources((current) => !current)}
                disabled={library.length === 0}
                className={`rounded-md border px-3 py-2 text-xs font-medium text-white transition focus:outline-none focus-visible:outline-none ${
                  library.length === 0
                    ? "cursor-not-allowed border-white/10 bg-white/5 text-white/40"
                    : "border-white/20 bg-white/10 hover:border-white/30 hover:bg-white/20"
                }`}
              >
                {library.length === 0
                  ? "No files yet"
                  : showSubtitleSources
                    ? "Collapse list"
                    : `Expand list (${library.length})`}
              </button>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-white/20 bg-white/5 px-3 py-2 text-sm text-white/80 transition hover:border-white/40">
                <input type="file" accept=".srt" multiple className="hidden" onChange={handleAddFiles} />
                <span className="font-medium">Add subtitles</span>
              </label>
            </div>
          </div>
          {processingFiles && (
            <p className="mt-3 text-xs text-white/50">Processing subtitle files…</p>
          )}
          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
          {showSubtitleSources ? (
            <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
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
          ) : (
            <p className="mt-4 text-sm text-white/70">
              {libraryLoading
                ? "Loading files…"
                : library.length === 0
                  ? "No subtitle files stored yet."
                  : `${library.length} subtitle file${library.length === 1 ? "" : "s"} stored. Expand to manage them.`}
            </p>
          )}
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
          <div className="mt-3 space-y-2 rounded-md border border-white/10 bg-black/40 p-3 text-sm text-white/80">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-white">Quote playback</span>
              {playbackStatus && <span className="text-xs text-white/60">{playbackStatus}</span>}
            </div>
            {playbackUrl ? (
              <video
                ref={playbackVideoRef}
                controls
                className="w-full rounded border border-white/10"
                src={playbackUrl}
                onLoadedMetadata={() => {
                  if (playbackRange && playbackVideoRef.current) {
                    playbackVideoRef.current.currentTime = playbackRange.startMs / 1000;
                  }
                }}
              />
            ) : (
              <p className="text-xs text-white/60">
                Select a media library folder in Settings to enable quote playback. Matching videos will be looked up by subtitle
                filename.
              </p>
            )}
            {playbackRange && (
              <p className="text-xs text-white/60">
                Segment: {formatTime(playbackRange.startMs)} – {formatTime(playbackRange.endMs)}
              </p>
            )}
            {playbackError && <p className="text-xs text-red-400">{playbackError}</p>}
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
                    <div className="flex flex-wrap items-center gap-2">
                      <span>
                        {formatTime(quote.contextStartMs)} – {formatTime(quote.contextEndMs)}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handlePlayQuote(quote)}
                        disabled={!mediaLibrary?.handle}
                        className="rounded border border-white/20 bg-white/10 px-2 py-1 text-[11px] font-medium text-white transition hover:border-white/30 hover:bg-white/20 focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/40"
                      >
                        Play quote
                      </button>
                    </div>
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

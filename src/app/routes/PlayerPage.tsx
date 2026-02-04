import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useDictionaryStore } from "../../state/dictionaryStore";
import { usePrefsStore } from "../../state/prefsStore";
import { useSessionStore } from "../../state/sessionStore";
import type { Cue, Token, UserPrefs } from "../../core/types";
import { tokenize } from "../../core/nlp/tokenize";
import {
  buildDisplayTokens,
  isWordLikeToken,
  shouldAddSpaceBefore,
  tokenizeWithItalics,
} from "../../core/subtitles/displayTokens";
import { handlePlayerKeyDown } from "./playerShortcuts";
import { formatTimeMs } from "../../utils/timeFormat";
import { hashBlob, readSubtitleText } from "../../utils/file";
import { upsertSubtitleFile } from "../../data/filesRepo";
import { getCuesForFile, saveCuesForFile } from "../../data/cuesRepo";
import { getLastSession, saveLastSession } from "../../data/sessionRepo";
import { parseSrt } from "../../core/parsing/srtParser";

const RTL_TEXT_RE = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/;
const RTL_LEADING_PUNCT_RE = /^[.!?…،؛؟]+$/u;
const VOLUME_STEPS = [1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100];

function detectRtlFromCues(cues: Cue[]): boolean {
  return cues.some((cue) => RTL_TEXT_RE.test(cue.rawText));
}

function shouldMoveLeadingPunctuation(token: Token): boolean {
  return !token.isWord && RTL_LEADING_PUNCT_RE.test(token.text);
}

function openDefinitionSearch(word: string) {
  const query = word.trim();
  if (!query) return;
  const encoded = encodeURIComponent(`${query} definition`);
  window.open(`https://www.google.com/search?q=${encoded}`, "_blank", "noopener,noreferrer");
}

interface SubtitleCueProps {
  cue: Cue;
  onTokenClick: (token: Token, cue: Cue) => void;
  onTokenContextMenu: (token: Token, cue: Cue) => void;
  classForToken: (token: Token) => string;
  isRtl?: boolean;
  className?: string;
}

type WorkerResponse = {
  id: string;
  cues: Cue[];
  error?: string;
};

type ShortcutAction = keyof NonNullable<UserPrefs["playerShortcuts"]>;

const INTERACTIVE_TAGS = ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "SUMMARY"];

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined") return false;
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return INTERACTIVE_TAGS.includes(target.tagName);
}

function formatShortcutLabel(event: KeyboardEvent): string {
  if (event.key === " ") return "Space";
  if (event.key === "Escape") return "Esc";
  if (event.key.startsWith("Arrow")) return event.key.replace("Arrow", "Arrow ");
  if (event.key.length === 1) return event.key.toUpperCase();
  return event.key;
}

function stopShortcutEvent(event: KeyboardEvent) {
  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === "function") {
    event.stopImmediatePropagation();
  }
}

function useDisplayTokens(cue: Cue, isRtl: boolean) {
  const tokens = useMemo(() => tokenizeWithItalics(cue.rawText), [cue.rawText]);
  const normalizedTokens = useMemo(() => {
    if (!isRtl) return tokens;
    const firstWordIndex = tokens.findIndex((token) => isWordLikeToken(token.token));
    if (firstWordIndex <= 0) return tokens;
    const leading = tokens.slice(0, firstWordIndex);
    if (leading.length === 0) return tokens;
    if (leading.every((token) => shouldMoveLeadingPunctuation(token.token))) {
      return [...tokens.slice(firstWordIndex), ...leading];
    }
    return tokens;
  }, [isRtl, tokens]);
  return useMemo(() => buildDisplayTokens(normalizedTokens, { isRtl }), [normalizedTokens, isRtl]);
}

export function SubtitleCue({
  cue,
  onTokenClick,
  onTokenContextMenu,
  classForToken,
  isRtl = false,
  className,
}: SubtitleCueProps) {
  const displayTokens = useDisplayTokens(cue, isRtl);
  return (
    <div
      className={`pointer-events-none flex flex-wrap ${className ?? ""}`}
      dir={isRtl ? "rtl" : "ltr"}
    >
      {displayTokens.map((displayToken, index) => {
        const prevToken = index > 0 ? displayTokens[index - 1].token : undefined;
        const token = displayToken.token;
        const spacingClass = shouldAddSpaceBefore(prevToken, token) ? "ms-1" : "";
        return (
          <button
            key={`${displayToken.text}-${index}`}
            type="button"
            className={`pointer-events-auto relative z-50 rounded px-0.5 text-left ${spacingClass} ${
              token.isWord ? "focus:outline-none focus-visible:outline-none" : "cursor-default"
            }`}
            onClick={(event) => {
              if (!token.isWord) return;
              onTokenClick(token, cue);
              if (event.currentTarget instanceof HTMLElement) {
                event.currentTarget.blur();
              }
            }}
            onContextMenu={(event) => {
              if (!token.isWord) return;
              event.preventDefault();
              onTokenContextMenu(token, cue);
            }}
            disabled={!token.isWord}
          >
            <span
              className={`rounded px-1 py-0.5 transition-colors ${
                displayToken.italic ? "italic" : ""
              } ${classForToken(token)}`}
            >
              {displayToken.text}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SubtitleCueBackground({
  cue,
  isRtl = false,
  className,
}: Pick<SubtitleCueProps, "cue" | "isRtl" | "className">) {
  const displayTokens = useDisplayTokens(cue, isRtl);
  return (
    <div className={`flex flex-wrap ${className ?? ""}`} dir={isRtl ? "rtl" : "ltr"}>
      {displayTokens.map((displayToken, index) => {
        const prevToken = index > 0 ? displayTokens[index - 1].token : undefined;
        const token = displayToken.token;
        const spacingClass = shouldAddSpaceBefore(prevToken, token) ? "ms-1" : "";
        return (
          <span
            key={`${displayToken.text}-${index}`}
            className={`rounded px-1 py-0.5 ${spacingClass}`}
          >
            {displayToken.text}
          </span>
        );
      })}
    </div>
  );
}

export default function PlayerPage({ isActive = true }: { isActive?: boolean }) {
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const pendingParseRef = useRef<
    Map<string, { hash: string; fileName: string; target: "primary" | "secondary" }>
  >(new Map());
  const latestParseRef = useRef<{ primary?: string; secondary?: string }>({});
  const videoName = useSessionStore((state) => state.videoName);
  const videoUrl = useSessionStore((state) => state.videoUrl);
  const videoDurationMs = useSessionStore((state) => state.videoDurationMs);
  const videoBlob = useSessionStore((state) => state.videoBlob);
  const setVideoFromFile = useSessionStore((state) => state.setVideoFromFile);
  const setVideoFromBlob = useSessionStore((state) => state.setVideoFromBlob);
  const setVideoDurationMs = useSessionStore((state) => state.setVideoDurationMs);
  const [savedVideoTime, setSavedVideoTime] = useState<number | null>(null);
  const [subtitleName, setSubtitleName] = useState<string>("");
  const [cues, setCues] = useState<Cue[]>([]);
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(0);
  const [subtitleLoading, setSubtitleLoading] = useState<boolean>(false);
  const [subtitleOffsetMs, setSubtitleOffsetMs] = useState<number>(0);
  const [subtitleError, setSubtitleError] = useState<string | null>(null);
  const [isSubtitleRtl, setIsSubtitleRtl] = useState<boolean>(false);
  const [secondarySubtitleName, setSecondarySubtitleName] = useState<string>("");
  const [secondaryCues, setSecondaryCues] = useState<Cue[]>([]);
  const [secondarySubtitleLoading, setSecondarySubtitleLoading] = useState<boolean>(false);
  const [secondarySubtitleOffsetMs, setSecondarySubtitleOffsetMs] = useState<number>(0);
  const [secondarySubtitleError, setSecondarySubtitleError] = useState<string | null>(null);
  const [secondarySubtitleEnabled, setSecondarySubtitleEnabled] = useState<boolean>(false);
  const [isSecondarySubtitleRtl, setIsSecondarySubtitleRtl] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(1);
  const [volumeOverlayPercent, setVolumeOverlayPercent] = useState<number | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [showCursor, setShowCursor] = useState<boolean>(true);
  const [skipSubtitleGaps, setSkipSubtitleGaps] = useState<boolean>(false);
  const [listeningShortcut, setListeningShortcut] = useState<ShortcutAction | null>(null);
  const hideControlsTimeoutRef = useRef<number | null>(null);
  const hideCursorTimeoutRef = useRef<number | null>(null);
  const volumeOverlayTimeoutRef = useRef<number | null>(null);
  const lastVideoTimeSavedRef = useRef<number>(0);
  const addWord = useDictionaryStore((state) => state.addUnknownWordFromToken);
  const classForToken = useDictionaryStore((state) => state.classForToken);
  const initializeDictionary = useDictionaryStore((state) => state.initialize);
  const dictionaryReady = useDictionaryStore((state) => state.initialized);
  const initializePrefs = usePrefsStore((state) => state.initialize);
  const prefsInitialized = usePrefsStore((state) => state.initialized);
  const setLastOpened = usePrefsStore((state) => state.setLastOpened);
  const playerShortcuts = usePrefsStore((state) => state.prefs.playerShortcuts);
  const mediaLibrary = usePrefsStore((state) => state.prefs.mediaLibrary);
  const updatePlayerShortcuts = usePrefsStore((state) => state.updatePlayerShortcuts);

  const handleTokenClick = useCallback(
    (token: Token, cue: Cue) => {
      void addWord(token, cue.rawText);
    },
    [addWord],
  );

  const handleTokenContextMenu = useCallback(
    (token: Token, cue: Cue) => {
      openDefinitionSearch(token.text);
      void addWord(token, cue.rawText);
    },
    [addWord],
  );

  const showVolumeOverlay = useCallback((nextPercent: number) => {
    setVolumeOverlayPercent(nextPercent);
    if (volumeOverlayTimeoutRef.current !== null) {
      window.clearTimeout(volumeOverlayTimeoutRef.current);
    }
    volumeOverlayTimeoutRef.current = window.setTimeout(() => {
      setVolumeOverlayPercent(null);
    }, 500);
  }, []);

  const applyPrimaryCuesState = useCallback((nextCues: Cue[]) => {
    setCues(nextCues);
    setIsSubtitleRtl(nextCues.length > 0 && detectRtlFromCues(nextCues));
  }, []);

  const applySecondaryCuesState = useCallback((nextCues: Cue[]) => {
    setSecondaryCues(nextCues);
    setIsSecondarySubtitleRtl(nextCues.length > 0 && detectRtlFromCues(nextCues));
  }, []);

  const applyParsedCues = useCallback(async (hash: string, fileName: string, parsed: Cue[]) => {
    applyPrimaryCuesState(parsed);
    await Promise.all([
      saveCuesForFile(hash, parsed),
      upsertSubtitleFile({ name: fileName, bytesHash: hash, totalCues: parsed.length }),
    ]);
  }, [applyPrimaryCuesState]);

  const applyParsedSecondaryCues = useCallback(
    async (hash: string, fileName: string, parsed: Cue[]) => {
      applySecondaryCuesState(parsed);
      await Promise.all([
        saveCuesForFile(hash, parsed),
        upsertSubtitleFile({ name: fileName, bytesHash: hash, totalCues: parsed.length }),
      ]);
    },
    [applySecondaryCuesState],
  );

  useEffect(() => {
    if (!dictionaryReady) {
      void initializeDictionary();
    }
  }, [dictionaryReady, initializeDictionary]);

  useEffect(() => {
    if (!prefsInitialized) {
      void initializePrefs();
    }
  }, [prefsInitialized, initializePrefs]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const container = playerContainerRef.current;
      setIsFullscreen(document.fullscreenElement === container);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const syncPlaybackState = () => setIsPlaying(!video.paused);
    const syncMutedState = () => setIsMuted(video.muted);
    const syncVolumeState = () => setVolume(video.volume);
    const syncDuration = () => {
      const nextDurationMs = Number.isFinite(video.duration) ? video.duration * 1000 : null;
      setDurationMs(nextDurationMs);
      if (nextDurationMs) {
        setVideoDurationMs(nextDurationMs);
      }
    };

    syncPlaybackState();
    syncMutedState();
    syncVolumeState();
    syncDuration();

    video.addEventListener("play", syncPlaybackState);
    video.addEventListener("pause", syncPlaybackState);
    video.addEventListener("volumechange", syncMutedState);
    video.addEventListener("volumechange", syncVolumeState);
    video.addEventListener("loadedmetadata", syncDuration);
    video.addEventListener("durationchange", syncDuration);
    return () => {
      video.removeEventListener("play", syncPlaybackState);
      video.removeEventListener("pause", syncPlaybackState);
      video.removeEventListener("volumechange", syncMutedState);
      video.removeEventListener("volumechange", syncVolumeState);
      video.removeEventListener("loadedmetadata", syncDuration);
      video.removeEventListener("durationchange", syncDuration);
    };
  }, []);


  const enterFullscreen = useCallback(async () => {
    const container = playerContainerRef.current;
    if (!container) return;
    if (document.fullscreenElement === container) return;
    try {
      await container.requestFullscreen();
    } catch (error) {
      console.error("Failed to enter fullscreen", error);
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) return;
    try {
      await document.exitFullscreen();
    } catch (error) {
      console.error("Failed to exit fullscreen", error);
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (isFullscreen) {
      void exitFullscreen();
      return;
    }
    void enterFullscreen();
  }, [enterFullscreen, exitFullscreen, isFullscreen]);

  useEffect(() => {
    const worker = new Worker(new URL("../../workers/srtWorker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) return;

    const handleMessage = async (event: MessageEvent<WorkerResponse>) => {
      const pending = pendingParseRef.current.get(event.data.id);
      if (!pending) return;
      if (latestParseRef.current[pending.target] !== event.data.id) {
        pendingParseRef.current.delete(event.data.id);
        return;
      }
      pendingParseRef.current.delete(event.data.id);

      if (event.data.error) {
        if (pending.target === "secondary") {
          setSecondarySubtitleError(event.data.error);
          setSecondarySubtitleLoading(false);
        } else {
          setSubtitleError(event.data.error);
          setSubtitleLoading(false);
        }
        return;
      }

      try {
        if (pending.target === "secondary") {
          setSecondarySubtitleError(null);
          await applyParsedSecondaryCues(pending.hash, pending.fileName, event.data.cues);
        } else {
          setSubtitleError(null);
          await applyParsedCues(pending.hash, pending.fileName, event.data.cues);
        }
      } catch (error) {
        console.error(error);
        if (pending.target === "secondary") {
          setSecondarySubtitleError("Failed to store parsed secondary subtitles.");
        } else {
          setSubtitleError("Failed to store parsed subtitles.");
        }
      } finally {
        if (pending.target === "secondary") {
          setSecondarySubtitleLoading(false);
        } else {
          setSubtitleLoading(false);
        }
      }
    };

    worker.addEventListener("message", handleMessage);
    return () => {
      worker.removeEventListener("message", handleMessage);
    };
  }, [applyParsedCues, applyParsedSecondaryCues, applyPrimaryCuesState, applySecondaryCuesState]);

  const ensureLibraryAccess = useCallback(async () => {
    if (!mediaLibrary?.handle) {
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
        return null;
      }
      const next = await requestPermission.call(mediaLibrary.handle, { mode: "read" });
      if (next === "granted") return mediaLibrary.handle;
      return null;
    } catch {
      return null;
    }
  }, [mediaLibrary]);

  const findVideoHandleByName = useCallback(
    async (fileName: string): Promise<FileSystemFileHandle | null> => {
      const handle = await ensureLibraryAccess();
      if (!handle) return null;
      const target = fileName.toLowerCase();
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
            if (entry.name.toLowerCase() === target) {
              return entry as FileSystemFileHandle;
            }
          } else if (entry.kind === "directory") {
            queue.push(entry as FileSystemDirectoryHandle);
          }
        }
      }

      return null;
    },
    [ensureLibraryAccess],
  );

  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      const session = await getLastSession();
      if (cancelled || !session) {
        return;
      }

      if (session.videoName && !videoUrl) {
        try {
          const handle = await findVideoHandleByName(session.videoName);
          if (cancelled) {
            return;
          }
          if (handle) {
            const file = await handle.getFile();
            if (!cancelled) {
              setVideoFromFile(file);
            }
          }
        } catch {
          // Ignore media library restore failures.
        }
      }

      if (session.subtitleName) {
        setSubtitleName(session.subtitleName);
      }
      if (typeof session.subtitleOffsetMs === "number") {
        setSubtitleOffsetMs(session.subtitleOffsetMs);
      }
      if (typeof session.videoTimeSeconds === "number") {
        setSavedVideoTime(session.videoTimeSeconds);
      }
      if (session.secondarySubtitleName) {
        setSecondarySubtitleName(session.secondarySubtitleName);
      }
      if (typeof session.secondarySubtitleEnabled === "boolean") {
        setSecondarySubtitleEnabled(session.secondarySubtitleEnabled);
      } else if (session.secondarySubtitleHash) {
        setSecondarySubtitleEnabled(true);
      }
      if (typeof session.secondarySubtitleOffsetMs === "number") {
        setSecondarySubtitleOffsetMs(session.secondarySubtitleOffsetMs);
      }
      if (!session.subtitleHash) {
        if (!session.secondarySubtitleHash) {
          return;
        }
      }

      if (session.secondarySubtitleHash) {
        setSecondarySubtitleLoading(true);
        setSecondarySubtitleError(null);
        const cachedSecondary = await getCuesForFile(session.secondarySubtitleHash);
        if (cancelled) {
          return;
        }

        if (cachedSecondary) {
          applySecondaryCuesState(cachedSecondary);
          setSecondarySubtitleLoading(false);
          await upsertSubtitleFile({
            name: session.secondarySubtitleName ?? session.secondarySubtitleHash,
            bytesHash: session.secondarySubtitleHash,
            totalCues: cachedSecondary.length,
          });
        } else if (session.secondarySubtitleText) {
          const worker = workerRef.current;
          if (worker) {
            const requestId = crypto.randomUUID();
            pendingParseRef.current.set(requestId, {
              hash: session.secondarySubtitleHash,
              fileName: session.secondarySubtitleName ?? session.secondarySubtitleHash,
              target: "secondary",
            });
            latestParseRef.current.secondary = requestId;
            worker.postMessage({ id: requestId, text: session.secondarySubtitleText });
          } else {
            try {
              const parsed = parseSrt(session.secondarySubtitleText).map((cue) => ({
                ...cue,
                tokens: cue.tokens ?? tokenize(cue.rawText),
              }));
              await applyParsedSecondaryCues(
                session.secondarySubtitleHash,
                session.secondarySubtitleName ?? session.secondarySubtitleHash,
                parsed,
              );
            } catch (error) {
              if (!cancelled) {
                setSecondarySubtitleError(
                  error instanceof Error ? error.message : "Failed to parse secondary subtitles",
                );
                applySecondaryCuesState([]);
              }
            } finally {
              if (!cancelled) {
                setSecondarySubtitleLoading(false);
              }
            }
          }
        } else {
          setSecondarySubtitleLoading(false);
        }
      }

      if (session.subtitleHash) {
        setSubtitleLoading(true);
        setSubtitleError(null);
        const cached = await getCuesForFile(session.subtitleHash);
        if (cancelled) {
          return;
        }

        if (cached) {
          applyPrimaryCuesState(cached);
          setSubtitleLoading(false);
          await upsertSubtitleFile({
            name: session.subtitleName ?? session.subtitleHash,
            bytesHash: session.subtitleHash,
            totalCues: cached.length,
          });
          return;
        }

        if (!session.subtitleText) {
          setSubtitleLoading(false);
          return;
        }

        const worker = workerRef.current;
        if (worker) {
          const requestId = crypto.randomUUID();
          pendingParseRef.current.set(requestId, {
            hash: session.subtitleHash,
            fileName: session.subtitleName ?? session.subtitleHash,
            target: "primary",
          });
          latestParseRef.current.primary = requestId;
          worker.postMessage({ id: requestId, text: session.subtitleText });
          return;
        }

        try {
          const parsed = parseSrt(session.subtitleText).map((cue) => ({
            ...cue,
            tokens: cue.tokens ?? tokenize(cue.rawText),
          }));
          await applyParsedCues(
            session.subtitleHash,
            session.subtitleName ?? session.subtitleHash,
            parsed,
          );
        } catch (error) {
          if (!cancelled) {
            setSubtitleError(error instanceof Error ? error.message : "Failed to parse subtitles");
            applyPrimaryCuesState([]);
          }
        } finally {
          if (!cancelled) {
            setSubtitleLoading(false);
          }
        }
      }
    };

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, [applyParsedCues, applyParsedSecondaryCues, findVideoHandleByName, setVideoFromFile, videoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    if (videoUrl) {
      if (video.src !== videoUrl) {
        video.src = videoUrl;
      }
      // Force metadata reload so duration updates after route switches.
      video.load();
      return;
    }
    video.removeAttribute("src");
    video.load();
  }, [videoUrl]);

  useEffect(() => {
    if (durationMs !== null || !videoDurationMs) return;
    setDurationMs(videoDurationMs);
  }, [durationMs, videoDurationMs]);

  useEffect(() => {
    if (!videoBlob || !videoUrl || !videoName) return;
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      if (cancelled) return;
      const video = videoRef.current;
      if (video && video.readyState === 0) {
        setVideoFromBlob(videoName, videoBlob);
      }
    }, 800);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [setVideoFromBlob, videoBlob, videoName, videoUrl]);

  useEffect(() => {
    if (!videoUrl) return;
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    let attempts = 0;
    const pollDuration = () => {
      if (cancelled) return;
      const duration = video.duration;
      if (Number.isFinite(duration) && duration > 0) {
        setDurationMs(duration * 1000);
        return;
      }
      attempts += 1;
      if (attempts < 20) {
        window.setTimeout(pollDuration, 250);
      }
    };
    pollDuration();
    return () => {
      cancelled = true;
    };
  }, [videoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || savedVideoTime === null) return;
    const handleLoaded = () => {
      video.currentTime = savedVideoTime;
    };
    if (video.readyState >= 1) {
      handleLoaded();
      return;
    }
    video.addEventListener("loadedmetadata", handleLoaded);
    return () => {
      video.removeEventListener("loadedmetadata", handleLoaded);
    };
  }, [savedVideoTime, videoUrl]);

  useEffect(() => {
    if (!prefsInitialized) return;
    const hasData = videoName || subtitleName;
    void setLastOpened(
      hasData
        ? {
            videoName: videoName || undefined,
            srtName: subtitleName || undefined,
          }
        : undefined,
    );
  }, [prefsInitialized, setLastOpened, subtitleName, videoName]);

  const resetPlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = 0;
  }, []);

  const togglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch((error) => {
        console.error("Failed to play video", error);
      });
    } else {
      video.pause();
    }
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  }, []);

  const seekBy = useCallback((deltaSeconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    if (video.readyState === 0) return;
    const nextTime = Math.min(
      Math.max(video.currentTime + deltaSeconds, 0),
      Number.isFinite(video.duration) ? video.duration : Number.POSITIVE_INFINITY,
    );
    video.currentTime = nextTime;
  }, []);

  const handleTimelineChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    if (video.readyState === 0) return;
    const nextTimeSeconds = Number(event.target.value);
    if (!Number.isFinite(nextTimeSeconds)) return;
    video.currentTime = nextTimeSeconds;
    setCurrentTimeMs(nextTimeSeconds * 1000);
  }, []);

  const handleVolumeChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const nextVolume = Number(event.target.value);
    if (!Number.isFinite(nextVolume)) return;
    video.volume = nextVolume;
    if (nextVolume > 0) {
      video.muted = false;
    }
    setVolume(nextVolume);
  }, []);

  const stepVolume = useCallback((direction: "up" | "down") => {
    const video = videoRef.current;
    if (!video) return;
    const currentPercent = Math.round(video.volume * 100);
    const clampedPercent = Math.min(Math.max(currentPercent, 0), 100);
    let nextPercent = VOLUME_STEPS[0];

    if (direction === "up") {
      nextPercent = VOLUME_STEPS[VOLUME_STEPS.length - 1];
      for (const step of VOLUME_STEPS) {
        if (step > clampedPercent) {
          nextPercent = step;
          break;
        }
      }
    } else {
      nextPercent = VOLUME_STEPS[0];
      for (let index = VOLUME_STEPS.length - 1; index >= 0; index -= 1) {
        const step = VOLUME_STEPS[index];
        if (step < clampedPercent) {
          nextPercent = step;
          break;
        }
      }
    }

    const nextVolume = nextPercent / 100;
    video.volume = nextVolume;
    if (nextVolume > 0) {
      video.muted = false;
    }
    setVolume(nextVolume);
    showVolumeOverlay(nextPercent);
  }, [showVolumeOverlay]);

  const processSubtitleFile = useCallback(
    async (file: File) => {
      resetPlayback();
      setSubtitleError(null);
      setSubtitleLoading(true);
      setCurrentTimeMs(0);
      const text = await readSubtitleText(file);
      const hash = await hashBlob(file);

      setSubtitleName(file.name);
      applyPrimaryCuesState([]);

      void saveLastSession({
        subtitleName: file.name,
        subtitleText: text,
        subtitleHash: hash,
      });

      const cached = await getCuesForFile(hash);
      if (cached) {
        applyPrimaryCuesState(cached);
        setSubtitleLoading(false);
        await upsertSubtitleFile({ name: file.name, bytesHash: hash, totalCues: cached.length });
        return;
      }

      const worker = workerRef.current;
      if (worker) {
        const requestId = crypto.randomUUID();
        pendingParseRef.current.set(requestId, { hash, fileName: file.name, target: "primary" });
        latestParseRef.current.primary = requestId;
        worker.postMessage({ id: requestId, text });
        return;
      }

      try {
        const parsed = parseSrt(text).map((cue) => ({
          ...cue,
          tokens: cue.tokens ?? tokenize(cue.rawText),
        }));
        await applyParsedCues(hash, file.name, parsed);
      } catch (error) {
        setSubtitleError(error instanceof Error ? error.message : "Failed to parse subtitles");
        applyPrimaryCuesState([]);
      } finally {
        setSubtitleLoading(false);
      }
    },
    [applyParsedCues, applyPrimaryCuesState, resetPlayback],
  );

  const processSecondarySubtitleFile = useCallback(
    async (file: File) => {
      setSecondarySubtitleError(null);
      setSecondarySubtitleLoading(true);
      const text = await readSubtitleText(file);
      const hash = await hashBlob(file);

      setSecondarySubtitleName(file.name);
      applySecondaryCuesState([]);

      void saveLastSession({
        secondarySubtitleName: file.name,
        secondarySubtitleText: text,
        secondarySubtitleHash: hash,
        secondarySubtitleEnabled: true,
      });

      const cached = await getCuesForFile(hash);
      if (cached) {
        applySecondaryCuesState(cached);
        setSecondarySubtitleLoading(false);
        setSecondarySubtitleEnabled(true);
        await upsertSubtitleFile({ name: file.name, bytesHash: hash, totalCues: cached.length });
        return;
      }

      const worker = workerRef.current;
      if (worker) {
        const requestId = crypto.randomUUID();
        pendingParseRef.current.set(requestId, {
          hash,
          fileName: file.name,
          target: "secondary",
        });
        latestParseRef.current.secondary = requestId;
        worker.postMessage({ id: requestId, text });
        return;
      }

      try {
        const parsed = parseSrt(text).map((cue) => ({
          ...cue,
          tokens: cue.tokens ?? tokenize(cue.rawText),
        }));
        await applyParsedSecondaryCues(hash, file.name, parsed);
        setSecondarySubtitleEnabled(true);
      } catch (error) {
        setSecondarySubtitleError(
          error instanceof Error ? error.message : "Failed to parse secondary subtitles",
        );
        applySecondaryCuesState([]);
      } finally {
        setSecondarySubtitleLoading(false);
      }
    },
    [applyParsedSecondaryCues, applySecondaryCuesState],
  );

  const handleVideoUpload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) return;

      const fileArray = Array.from(files);
      const videoFile = fileArray.find(
        (candidate) =>
          candidate.type.startsWith("video/") || candidate.name.toLowerCase().endsWith(".mkv"),
      );
      if (!videoFile) {
        event.target.value = "";
        return;
      }

      resetPlayback();
      setSavedVideoTime(0);
      lastVideoTimeSavedRef.current = 0;
      setCurrentTimeMs(0);
      setVideoFromFile(videoFile);

      void saveLastSession({ videoName: videoFile.name, videoTimeSeconds: 0 });

      const baseName = videoFile.name.replace(/\.[^.]+$/, "").toLowerCase();
      const matchingSubtitle = fileArray.find(
        (candidate) => candidate.name.toLowerCase() === `${baseName}.srt` && candidate !== videoFile,
      );

      if (matchingSubtitle) {
        await processSubtitleFile(matchingSubtitle);
      }

      event.target.value = "";
    },
    [processSubtitleFile, resetPlayback],
  );

  const handleSubtitleUpload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      await processSubtitleFile(file);

      event.target.value = "";
    },
    [processSubtitleFile],
  );

  const handleSecondarySubtitleUpload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      await processSecondarySubtitleFile(file);

      event.target.value = "";
    },
    [processSecondarySubtitleFile],
  );

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    const nextTimeMs = video.currentTime * 1000;
    if (skipSubtitleGaps && !video.paused) {
      const jumpTarget = findGapJumpTargetMs(nextTimeMs);
      if (jumpTarget !== null) {
        video.currentTime = jumpTarget / 1000;
        setCurrentTimeMs(jumpTarget);
        return;
      }
    }
    setCurrentTimeMs(nextTimeMs);
    if (video.currentTime - lastVideoTimeSavedRef.current >= 2) {
      lastVideoTimeSavedRef.current = video.currentTime;
      void saveLastSession({ videoTimeSeconds: video.currentTime });
    }
  };

  const activeCues = useMemo(
    () =>
      cues.filter((cue) => {
        const adjustedStart = cue.startMs + subtitleOffsetMs;
        const adjustedEnd = cue.endMs + subtitleOffsetMs;
        return adjustedStart <= currentTimeMs && adjustedEnd >= currentTimeMs;
      }),
    [cues, currentTimeMs, subtitleOffsetMs],
  );

  const activeSecondaryCues = useMemo(
    () =>
      secondaryCues.filter((cue) => {
        const adjustedStart = cue.startMs + secondarySubtitleOffsetMs;
        const adjustedEnd = cue.endMs + secondarySubtitleOffsetMs;
        return adjustedStart <= currentTimeMs && adjustedEnd >= currentTimeMs;
      }),
    [secondaryCues, currentTimeMs, secondarySubtitleOffsetMs],
  );

  const formattedCurrentTime = useMemo(() => formatTimeMs(currentTimeMs), [currentTimeMs]);
  const formattedDuration = useMemo(
    () => (durationMs ? formatTimeMs(durationMs) : "--:--"),
    [durationMs],
  );
  const progressPercent = useMemo(() => {
    if (!durationMs) return 0;
    return Math.min(100, Math.max(0, (currentTimeMs / durationMs) * 100));
  }, [currentTimeMs, durationMs]);

  const findNextCueStartMs = useCallback(
    (timeMs: number) => {
      for (const cue of cues) {
        const adjustedStart = cue.startMs + subtitleOffsetMs;
        if (adjustedStart > timeMs + 50) {
          return Math.max(0, adjustedStart);
        }
      }
      return null;
    },
    [cues, subtitleOffsetMs],
  );

  const findPreviousCueStartMs = useCallback(
    (timeMs: number) => {
      for (let index = cues.length - 1; index >= 0; index -= 1) {
        const cue = cues[index];
        const adjustedStart = cue.startMs + subtitleOffsetMs;
        if (adjustedStart < timeMs - 50) {
          return Math.max(0, adjustedStart);
        }
      }
      return null;
    },
    [cues, subtitleOffsetMs],
  );

  const findGapJumpTargetMs = useCallback(
    (timeMs: number) => {
      let previousEnd: number | null = null;
      for (const cue of cues) {
        const adjustedStart = cue.startMs + subtitleOffsetMs;
        const adjustedEnd = cue.endMs + subtitleOffsetMs;
        if (timeMs >= adjustedStart && timeMs <= adjustedEnd) {
          return null;
        }
        if (adjustedStart > timeMs) {
          if (previousEnd === null) {
            return adjustedStart - timeMs > 150 ? Math.max(0, adjustedStart) : null;
          }
          return timeMs - previousEnd > 150 ? Math.max(0, adjustedStart) : null;
        }
        previousEnd = adjustedEnd;
      }
      return null;
    },
    [cues, subtitleOffsetMs],
  );

  const jumpToMs = useCallback((targetMs: number, options: { focus?: boolean } = {}) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = targetMs / 1000;
    setCurrentTimeMs(targetMs);
    if (options.focus !== false) {
      playerContainerRef.current?.focus();
    }
  }, []);

  const adjustSubtitleOffset = useCallback(
    (deltaMs: number) => {
      setSubtitleOffsetMs((previous) => {
        const next = previous + deltaMs;
        void saveLastSession({ subtitleOffsetMs: next });
        return next;
      });
    },
    [],
  );

  const adjustSecondarySubtitleOffset = useCallback((deltaMs: number) => {
    setSecondarySubtitleOffsetMs((previous) => {
      const next = previous + deltaMs;
      void saveLastSession({ secondarySubtitleOffsetMs: next });
      return next;
    });
  }, []);

  const toggleSecondarySubtitle = useCallback(() => {
    if (secondaryCues.length === 0) return;
    setSecondarySubtitleEnabled((previous) => {
      const next = !previous;
      void saveLastSession({ secondarySubtitleEnabled: next });
      return next;
    });
  }, [secondaryCues.length]);

  const jumpToNextSentence = useCallback(() => {
    const nextStart = findNextCueStartMs(currentTimeMs);
    if (nextStart === null) return;
    jumpToMs(nextStart);
  }, [currentTimeMs, findNextCueStartMs, jumpToMs]);

  const jumpToPreviousSentence = useCallback(() => {
    const prevStart = findPreviousCueStartMs(currentTimeMs);
    if (prevStart === null) return;
    jumpToMs(prevStart);
  }, [currentTimeMs, findPreviousCueStartMs, jumpToMs]);

  const nextSentenceStart = useMemo(
    () => findNextCueStartMs(currentTimeMs),
    [currentTimeMs, findNextCueStartMs],
  );
  const prevSentenceStart = useMemo(
    () => findPreviousCueStartMs(currentTimeMs),
    [currentTimeMs, findPreviousCueStartMs],
  );

  const focusPlayerContainer = useCallback(() => {
    playerContainerRef.current?.focus();
  }, []);

  const clearHideControlsTimeout = useCallback(() => {
    if (hideControlsTimeoutRef.current !== null) {
      window.clearTimeout(hideControlsTimeoutRef.current);
      hideControlsTimeoutRef.current = null;
    }
  }, []);

  const clearHideCursorTimeout = useCallback(() => {
    if (hideCursorTimeoutRef.current !== null) {
      window.clearTimeout(hideCursorTimeoutRef.current);
      hideCursorTimeoutRef.current = null;
    }
  }, []);

  const scheduleHideControls = useCallback(() => {
    clearHideControlsTimeout();
    if (!isPlaying) return;
    hideControlsTimeoutRef.current = window.setTimeout(() => {
      setShowControls(false);
    }, 2500);
  }, [clearHideControlsTimeout, isPlaying]);

  const showControlsNow = useCallback(() => {
    setShowControls(true);
    scheduleHideControls();
  }, [scheduleHideControls]);

  const scheduleHideCursor = useCallback(() => {
    clearHideCursorTimeout();
    if (!isFullscreen) return;
    hideCursorTimeoutRef.current = window.setTimeout(() => {
      setShowCursor(false);
    }, 1000);
  }, [clearHideCursorTimeout, isFullscreen]);

  const showCursorNow = useCallback(() => {
    setShowCursor(true);
    scheduleHideCursor();
  }, [scheduleHideCursor]);

  const handleMouseMove = useCallback(() => {
    showControlsNow();
    showCursorNow();
  }, [showControlsNow, showCursorNow]);

  const shortcutBindings = useMemo(() => playerShortcuts ?? {}, [playerShortcuts]);

  const handleShortcutEditToggle = useCallback((action: ShortcutAction) => {
    setListeningShortcut((previous) => (previous === action ? null : action));
  }, []);

  const getShortcutLabel = useCallback(
    (action: ShortcutAction) =>
      listeningShortcut === action ? "Press a key…" : shortcutBindings[action]?.label ?? "None",
    [listeningShortcut, shortcutBindings],
  );

  useEffect(() => {
    if (!listeningShortcut) return;
    const handleShortcutCapture = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      stopShortcutEvent(event);
      if (event.key === "Escape") {
        setListeningShortcut(null);
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        const updates: Partial<NonNullable<UserPrefs["playerShortcuts"]>> = {
          [listeningShortcut]: undefined,
        };
        void updatePlayerShortcuts(updates);
        setListeningShortcut(null);
        return;
      }
      if (event.key === "Shift" || event.key === "Alt" || event.key === "Control" || event.key === "Meta") {
        return;
      }
      const updates: Partial<NonNullable<UserPrefs["playerShortcuts"]>> = {
        [listeningShortcut]: { code: event.code, label: formatShortcutLabel(event) },
      };
      void updatePlayerShortcuts(updates);
      setListeningShortcut(null);
    };
    document.addEventListener("keydown", handleShortcutCapture, true);
    return () => {
      document.removeEventListener("keydown", handleShortcutCapture, true);
    };
  }, [listeningShortcut, updatePlayerShortcuts]);

  const handleCustomShortcutKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (listeningShortcut) return false;
      if (isInteractiveTarget(event.target)) return false;
      if (event.altKey || event.ctrlKey || event.metaKey) return false;
      const handlers: Partial<Record<ShortcutAction, () => void>> = {
        mainSubtitleOffsetBack: () => {
          adjustSubtitleOffset(-500);
        },
        mainSubtitleOffsetForward: () => {
          adjustSubtitleOffset(500);
        },
        secondarySubtitleOffsetBack: () => {
          adjustSecondarySubtitleOffset(-500);
        },
        secondarySubtitleOffsetForward: () => {
          adjustSecondarySubtitleOffset(500);
        },
        toggleSecondarySubtitle: () => {
          toggleSecondarySubtitle();
        },
        jumpNextSentence: () => {
          jumpToNextSentence();
        },
        jumpPrevSentence: () => {
          jumpToPreviousSentence();
        },
        toggleMainSubtitleRtl: () => {
          setIsSubtitleRtl((previous) => !previous);
        },
        toggleSecondarySubtitleRtl: () => {
          setIsSecondarySubtitleRtl((previous) => !previous);
        },
        toggleSkipSubtitleGaps: () => {
          setSkipSubtitleGaps((previous) => !previous);
        },
      };
      for (const [action, handler] of Object.entries(handlers) as [
        ShortcutAction,
        () => void,
      ][]) {
        const binding = shortcutBindings[action];
        if (binding && binding.code === event.code) {
          stopShortcutEvent(event);
          handler();
          focusPlayerContainer();
          return true;
        }
      }
      return false;
    },
    [
      adjustSecondarySubtitleOffset,
      adjustSubtitleOffset,
      focusPlayerContainer,
      jumpToNextSentence,
      jumpToPreviousSentence,
      listeningShortcut,
      shortcutBindings,
      toggleSecondarySubtitle,
    ],
  );

  const handleShortcutKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const customHandled = handleCustomShortcutKeyDown(event);
      if (customHandled) return true;
      return handlePlayerKeyDown(event, {
        video: videoRef.current,
        seekBy,
        toggleFullscreen,
        toggleMute,
        togglePlayback,
        toggleSecondarySubtitle,
        stepVolume,
        ignoreSecondarySubtitleShortcut: Boolean(shortcutBindings.toggleSecondarySubtitle),
      });
    },
    [
      handleCustomShortcutKeyDown,
      seekBy,
      shortcutBindings,
      stepVolume,
      toggleFullscreen,
      toggleMute,
      togglePlayback,
      toggleSecondarySubtitle,
    ],
  );

  const handleShortcutKeyDownCapture = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      const handled = handleShortcutKeyDown(event.nativeEvent);
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    [handleShortcutKeyDown],
  );

  useEffect(() => {
    if (!isActive) return;
    document.addEventListener("keydown", handleShortcutKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleShortcutKeyDown, true);
    };
  }, [handleShortcutKeyDown, isActive]);

  useEffect(() => {
    if (isActive) return;
    const video = videoRef.current;
    if (video && !video.paused) {
      video.pause();
    }
  }, [isActive]);

  useEffect(() => {
    if (!isPlaying) {
      clearHideControlsTimeout();
      setShowControls(true);
      return;
    }
    scheduleHideControls();
  }, [clearHideControlsTimeout, isPlaying, scheduleHideControls]);

  useEffect(() => {
    if (!isFullscreen) {
      clearHideCursorTimeout();
      setShowCursor(true);
      return;
    }
    scheduleHideCursor();
  }, [clearHideCursorTimeout, isFullscreen, scheduleHideCursor]);

  useEffect(() => {
    return () => {
      clearHideControlsTimeout();
      clearHideCursorTimeout();
    };
  }, [clearHideControlsTimeout, clearHideCursorTimeout]);

  useEffect(() => {
    return () => {
      if (volumeOverlayTimeoutRef.current !== null) {
        window.clearTimeout(volumeOverlayTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="space-y-6" onKeyDown={handleShortcutKeyDownCapture}>
      <section className="space-y-4">
        <div
          ref={playerContainerRef}
          className={`relative aspect-video overflow-hidden rounded-lg bg-black shadow-xl focus:outline-none focus-visible:none ${
            isFullscreen && !showCursor ? "cursor-none" : ""
          }`}
          onDoubleClick={toggleFullscreen}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => {
            if (isPlaying) {
              setShowControls(false);
            }
          }}
          onFocusCapture={showControlsNow}
          tabIndex={-1}
        >
          <video
            ref={videoRef}
            className="h-full w-full focus:outline-none focus-visible:outline-none"
            onClick={() => {
              togglePlayback();
              focusPlayerContainer();
            }}
            onTimeUpdate={handleTimeUpdate}
            src={videoUrl ?? undefined}
            preload="metadata"
            tabIndex={-1}
          >
            <track kind="subtitles" srcLang="en" label={subtitleName || "Subtitles"} />
          </video>
          <div
            className={`pointer-events-none absolute inset-0 z-40 flex items-center justify-center transition-opacity duration-300 ${
              volumeOverlayPercent === null ? "opacity-0" : "opacity-100"
            }`}
            aria-hidden
          >
            <div className="rounded-full bg-black/50 px-4 py-2 text-lg font-semibold text-white/90 shadow-lg backdrop-blur-sm">
              {(volumeOverlayPercent ?? Math.round(volume * 100))}%
            </div>
          </div>
          <div
            className={`absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pb-4 pt-6 text-white transition-opacity duration-300 ${
              showControls ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-col gap-2">
              <input
                type="range"
                min={0}
                max={durationMs ? Math.max(durationMs / 1000, 0) : 0}
                step={0.1}
                value={durationMs ? Math.min(currentTimeMs / 1000, durationMs / 1000) : 0}
                onChange={handleTimelineChange}
                onKeyDown={handleShortcutKeyDownCapture}
                onFocus={(event) => {
                  event.currentTarget.blur();
                  focusPlayerContainer();
                }}
                className="player-timeline w-full cursor-pointer"
                aria-label="Seek position"
                disabled={!durationMs}
                tabIndex={-1}
                style={{
                  ["--timeline-gradient" as string]: `linear-gradient(90deg, rgba(56, 189, 248, 0.6) 0%, rgba(56, 189, 248, 0.6) ${progressPercent}%, rgba(148, 163, 184, 0.35) ${progressPercent}%, rgba(148, 163, 184, 0.35) 100%)`,
                }}
              />
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className={`group play-variant variant-24 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-200 ${isPlaying ? "is-paused" : ""}`}
                    onClick={() => {
                      togglePlayback();
                      focusPlayerContainer();
                    }}
                    aria-label={isPlaying ? "Pause video" : "Play video"}
                  >
                    <span className="play-variant-icon" aria-hidden />
                    <span className="player-tooltip">Space</span>
                  </button>
                  <div className="group relative flex items-center gap-2">
                    <button
                      type="button"
                      className="player-icon-button text-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
                      onClick={() => {
                        toggleMute();
                        focusPlayerContainer();
                      }}
                      aria-label={isMuted ? "Unmute video" : "Mute video"}
                    >
                      <span aria-hidden>{isMuted ? "🔇" : "🔊"}</span>
                      <span className="player-tooltip">M</span>
                    </button>
                    <div className="max-w-0 overflow-hidden transition-all duration-300 group-hover:max-w-[120px]">
                      <input
                        id="player-volume"
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={isMuted ? 0 : volume}
                        onChange={handleVolumeChange}
                        onKeyDown={handleShortcutKeyDownCapture}
                        className="player-volume w-24 cursor-pointer"
                        aria-label="Volume"
                      />
                    </div>
                  </div>
                </div>
                <div
                  className="flex items-center gap-3 text-xs text-white/70"
                  style={{ fontFamily: '"Comic Sans MS", "Comic Sans", cursive' }}
                >
                  {formattedCurrentTime} / {formattedDuration}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex flex-row-reverse items-center gap-2">
                    <button
                      type="button"
                      className="group player-icon-button text-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
                      onClick={() => {
                        toggleFullscreen();
                        focusPlayerContainer();
                      }}
                      aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                    >
                      <span aria-hidden>⛶</span>
                      <span className="player-tooltip">F</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {secondarySubtitleEnabled && activeSecondaryCues.length > 0 && (
            <>
              <div className="pointer-events-none absolute inset-0 z-30 flex flex-col justify-start p-6">
                <div className="pointer-events-none flex flex-col items-center gap-3">
                  {activeSecondaryCues.map((cue) => (
                    <div
                      key={`${cue.startMs}-${cue.endMs}-bg`}
                      className="subtitle-overlay subtitle-overlay-secondary subtitle-overlay-bg max-w-3xl text-center"
                    >
                      <SubtitleCueBackground
                        cue={cue}
                        isRtl={isSecondarySubtitleRtl}
                        className="justify-center text-center"
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="pointer-events-none absolute inset-0 z-40 flex flex-col justify-start p-6">
                <div className="pointer-events-none flex flex-col items-center gap-3">
                  {activeSecondaryCues.map((cue) => (
                    <div
                      key={`${cue.startMs}-${cue.endMs}`}
                      className="subtitle-overlay subtitle-overlay-secondary max-w-3xl text-center"
                    >
                      <SubtitleCue
                        cue={cue}
                        classForToken={classForToken}
                        onTokenClick={handleTokenClick}
                        onTokenContextMenu={handleTokenContextMenu}
                        isRtl={isSecondarySubtitleRtl}
                        className="justify-center text-center"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
          {activeCues.length > 0 && (
            <>
              <div className="pointer-events-none absolute inset-0 z-30 flex flex-col justify-end p-6">
                <div className="pointer-events-none flex flex-col items-center gap-3">
                  {activeCues.map((cue) => (
                    <div
                      key={`${cue.startMs}-${cue.endMs}-bg`}
                      className="subtitle-overlay subtitle-overlay-bg max-w-3xl text-center"
                    >
                      <SubtitleCueBackground
                        cue={cue}
                        isRtl={isSubtitleRtl}
                        className="justify-center text-center"
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="pointer-events-none absolute inset-0 z-40 flex flex-col justify-end p-6">
                <div className="pointer-events-none flex flex-col items-center gap-3">
                  {activeCues.map((cue) => (
                    <div
                      key={`${cue.startMs}-${cue.endMs}`}
                      className="subtitle-overlay max-w-3xl text-center"
                    >
                      <SubtitleCue
                        cue={cue}
                        classForToken={classForToken}
                        onTokenClick={handleTokenClick}
                        onTokenContextMenu={handleTokenContextMenu}
                        isRtl={isSubtitleRtl}
                        className="justify-center text-center"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
        <div className="space-y-4 rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/80">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="flex w-full cursor-pointer flex-col gap-2 rounded-lg border border-dashed border-white/20 bg-white/5 p-4 text-sm hover:border-white/40">
              <span className="font-medium">Load video</span>
              <input
                type="file"
                accept="video/*,video/x-matroska,.mkv,.MKV"
                multiple
                className="hidden"
                onChange={handleVideoUpload}
              />
              <span className="text-xs text-white/60">
                Automatically pairs a matching .srt when selected together.
              </span>
              <span className="text-xs text-white/60">Current: {videoName || "None"}</span>
            </label>
            <label className="flex w-full cursor-pointer flex-col gap-2 rounded-lg border border-dashed border-white/20 bg-white/5 p-4 text-sm hover:border-white/40">
              <span className="font-medium">Load subtitles (SRT)</span>
              <input type="file" accept=".srt" className="hidden" onChange={handleSubtitleUpload} />
              <span className="text-xs text-white/60">Current: {subtitleName || "None"}</span>
              {subtitleLoading && (
                <span className="text-xs text-amber-300">Processing subtitles…</span>
              )}
              {subtitleError && <span className="text-xs text-red-400">{subtitleError}</span>}
            </label>
            <label className="flex w-full cursor-pointer flex-col gap-2 rounded-lg border border-dashed border-white/20 bg-white/5 p-4 text-sm hover:border-white/40">
              <span className="font-medium">Load second subtitles (SRT, optional)</span>
              <input
                type="file"
                accept=".srt"
                className="hidden"
                onChange={handleSecondarySubtitleUpload}
              />
              <span className="text-xs text-white/60">
                Current: {secondarySubtitleName || "None"}
              </span>
              {secondarySubtitleLoading && (
                <span className="text-xs text-amber-300">Processing second subtitles…</span>
              )}
              {secondarySubtitleError && (
                <span className="text-xs text-red-400">{secondarySubtitleError}</span>
              )}
            </label>
          </div>
          <details className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm">
            <summary className="cursor-pointer list-none font-medium text-white/90">
              More controls & keyboard shortcuts
            </summary>
            <div className="mt-4 space-y-3 text-xs text-white/70">
              <p className="text-xs text-white/60">
                Click a shortcut badge, then press a key. Press Backspace/Delete to clear.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-white/80">
                  <thead className="text-[11px] uppercase tracking-wide text-white/50">
                    <tr>
                      <th className="py-2 pr-4">Function</th>
                      <th className="py-2 text-right sm:text-left">Shortcut (click to change)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    <tr>
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-white">Main subtitles timing</span>
                          <button
                            type="button"
                            className="rounded bg-white/10 px-2 py-1 transition hover:bg-white/20 focus:outline-none focus-visible:outline-none"
                            onClick={() => {
                              adjustSubtitleOffset(-500);
                            }}
                          >
                            –0.5s
                          </button>
                          <button
                            type="button"
                            className="rounded bg-white/10 px-2 py-1 transition hover:bg-white/20 focus:outline-none focus-visible:outline-none"
                            onClick={() => {
                              adjustSubtitleOffset(500);
                            }}
                          >
                            +0.5s
                          </button>
                          <span className="text-xs text-white/60">
                            Offset: {subtitleOffsetMs >= 0 ? "+" : ""}
                            {(subtitleOffsetMs / 1000).toFixed(1)}s
                          </span>
                        </div>
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap items-center justify-end gap-2 sm:justify-start">
                          <button
                            type="button"
                            className={`rounded border border-white/10 px-2 py-1 transition ${
                              listeningShortcut === "mainSubtitleOffsetBack"
                                ? "bg-sky-500/20 text-white"
                                : "bg-white/10 text-white/80 hover:bg-white/20"
                            }`}
                            onClick={() => handleShortcutEditToggle("mainSubtitleOffsetBack")}
                            aria-pressed={listeningShortcut === "mainSubtitleOffsetBack"}
                          >
                            {getShortcutLabel("mainSubtitleOffsetBack")}
                          </button>
                          <button
                            type="button"
                            className={`rounded border border-white/10 px-2 py-1 transition ${
                              listeningShortcut === "mainSubtitleOffsetForward"
                                ? "bg-sky-500/20 text-white"
                                : "bg-white/10 text-white/80 hover:bg-white/20"
                            }`}
                            onClick={() => handleShortcutEditToggle("mainSubtitleOffsetForward")}
                            aria-pressed={listeningShortcut === "mainSubtitleOffsetForward"}
                          >
                            {getShortcutLabel("mainSubtitleOffsetForward")}
                          </button>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-white">Second subtitles timing</span>
                          <button
                            type="button"
                            className="rounded bg-white/10 px-2 py-1 transition hover:bg-white/20 focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => {
                              adjustSecondarySubtitleOffset(-500);
                            }}
                            disabled={secondaryCues.length === 0}
                          >
                            –0.5s
                          </button>
                          <button
                            type="button"
                            className="rounded bg-white/10 px-2 py-1 transition hover:bg-white/20 focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => {
                              adjustSecondarySubtitleOffset(500);
                            }}
                            disabled={secondaryCues.length === 0}
                          >
                            +0.5s
                          </button>
                          <span className="text-xs text-white/60">
                            Offset: {secondarySubtitleOffsetMs >= 0 ? "+" : ""}
                            {(secondarySubtitleOffsetMs / 1000).toFixed(1)}s
                          </span>
                        </div>
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap items-center justify-end gap-2 sm:justify-start">
                          <button
                            type="button"
                            className={`rounded border border-white/10 px-2 py-1 transition ${
                              listeningShortcut === "secondarySubtitleOffsetBack"
                                ? "bg-sky-500/20 text-white"
                                : "bg-white/10 text-white/80 hover:bg-white/20"
                            }`}
                            onClick={() => handleShortcutEditToggle("secondarySubtitleOffsetBack")}
                            aria-pressed={listeningShortcut === "secondarySubtitleOffsetBack"}
                          >
                            {getShortcutLabel("secondarySubtitleOffsetBack")}
                          </button>
                          <button
                            type="button"
                            className={`rounded border border-white/10 px-2 py-1 transition ${
                              listeningShortcut === "secondarySubtitleOffsetForward"
                                ? "bg-sky-500/20 text-white"
                                : "bg-white/10 text-white/80 hover:bg-white/20"
                            }`}
                            onClick={() => handleShortcutEditToggle("secondarySubtitleOffsetForward")}
                            aria-pressed={listeningShortcut === "secondarySubtitleOffsetForward"}
                          >
                            {getShortcutLabel("secondarySubtitleOffsetForward")}
                          </button>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-white">Second subtitles visible</span>
                          <button
                            type="button"
                            className="rounded bg-white/10 px-2 py-1 text-xs font-medium text-white transition hover:bg-white/20 focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => {
                              toggleSecondarySubtitle();
                            }}
                            disabled={secondaryCues.length === 0}
                          >
                            {secondarySubtitleEnabled ? "On" : "Off"}
                          </button>
                        </div>
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap items-center justify-end gap-2 sm:justify-start">
                          <button
                            type="button"
                            className={`rounded border border-white/10 px-2 py-1 transition ${
                              listeningShortcut === "toggleSecondarySubtitle"
                                ? "bg-sky-500/20 text-white"
                                : "bg-white/10 text-white/80 hover:bg-white/20"
                            }`}
                            onClick={() => handleShortcutEditToggle("toggleSecondarySubtitle")}
                            aria-pressed={listeningShortcut === "toggleSecondarySubtitle"}
                          >
                            {getShortcutLabel("toggleSecondarySubtitle")}
                          </button>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">
                            Main subtitles right-to-left order
                          </span>
                          <input
                            type="checkbox"
                            checked={isSubtitleRtl}
                            onChange={(event) => setIsSubtitleRtl(event.target.checked)}
                            className="h-3 w-3 rounded border-white/30 bg-slate-900"
                          />
                        </div>
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap items-center justify-end gap-2 sm:justify-start">
                          <button
                            type="button"
                            className={`rounded border border-white/10 px-2 py-1 transition ${
                              listeningShortcut === "toggleMainSubtitleRtl"
                                ? "bg-sky-500/20 text-white"
                                : "bg-white/10 text-white/80 hover:bg-white/20"
                            }`}
                            onClick={() => handleShortcutEditToggle("toggleMainSubtitleRtl")}
                            aria-pressed={listeningShortcut === "toggleMainSubtitleRtl"}
                          >
                            {getShortcutLabel("toggleMainSubtitleRtl")}
                          </button>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">
                            Second subtitles right-to-left order
                          </span>
                          <input
                            type="checkbox"
                            checked={isSecondarySubtitleRtl}
                            onChange={(event) => setIsSecondarySubtitleRtl(event.target.checked)}
                            className="h-3 w-3 rounded border-white/30 bg-slate-900"
                          />
                        </div>
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap items-center justify-end gap-2 sm:justify-start">
                          <button
                            type="button"
                            className={`rounded border border-white/10 px-2 py-1 transition ${
                              listeningShortcut === "toggleSecondarySubtitleRtl"
                                ? "bg-sky-500/20 text-white"
                                : "bg-white/10 text-white/80 hover:bg-white/20"
                            }`}
                            onClick={() => handleShortcutEditToggle("toggleSecondarySubtitleRtl")}
                            aria-pressed={listeningShortcut === "toggleSecondarySubtitleRtl"}
                          >
                            {getShortcutLabel("toggleSecondarySubtitleRtl")}
                          </button>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-white">Jump to next sentence</span>
                          <button
                            type="button"
                            className="rounded bg-white/10 px-2 py-1 transition hover:bg-white/20 focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => {
                              const nextStart = findNextCueStartMs(currentTimeMs);
                              if (nextStart === null) return;
                              jumpToMs(nextStart, { focus: false });
                            }}
                            disabled={nextSentenceStart === null}
                          >
                            Next
                          </button>
                        </div>
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap items-center justify-end gap-2 sm:justify-start">
                          <button
                            type="button"
                            className={`rounded border border-white/10 px-2 py-1 transition ${
                              listeningShortcut === "jumpNextSentence"
                                ? "bg-sky-500/20 text-white"
                                : "bg-white/10 text-white/80 hover:bg-white/20"
                            }`}
                            onClick={() => handleShortcutEditToggle("jumpNextSentence")}
                            aria-pressed={listeningShortcut === "jumpNextSentence"}
                          >
                            {getShortcutLabel("jumpNextSentence")}
                          </button>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-white">Jump to previous sentence</span>
                          <button
                            type="button"
                            className="rounded bg-white/10 px-2 py-1 transition hover:bg-white/20 focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => {
                              const prevStart = findPreviousCueStartMs(currentTimeMs);
                              if (prevStart === null) return;
                              jumpToMs(prevStart, { focus: false });
                            }}
                            disabled={prevSentenceStart === null}
                          >
                            Back
                          </button>
                        </div>
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap items-center justify-end gap-2 sm:justify-start">
                          <button
                            type="button"
                            className={`rounded border border-white/10 px-2 py-1 transition ${
                              listeningShortcut === "jumpPrevSentence"
                                ? "bg-sky-500/20 text-white"
                                : "bg-white/10 text-white/80 hover:bg-white/20"
                            }`}
                            onClick={() => handleShortcutEditToggle("jumpPrevSentence")}
                            aria-pressed={listeningShortcut === "jumpPrevSentence"}
                          >
                            {getShortcutLabel("jumpPrevSentence")}
                          </button>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">
                            Skip all gaps between sentences
                          </span>
                          <input
                            type="checkbox"
                            checked={skipSubtitleGaps}
                            onChange={(event) => setSkipSubtitleGaps(event.target.checked)}
                            className="h-3 w-3 rounded border-white/30 bg-slate-900"
                          />
                        </div>
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap items-center justify-end gap-2 sm:justify-start">
                          <button
                            type="button"
                            className={`rounded border border-white/10 px-2 py-1 transition ${
                              listeningShortcut === "toggleSkipSubtitleGaps"
                                ? "bg-sky-500/20 text-white"
                                : "bg-white/10 text-white/80 hover:bg-white/20"
                            }`}
                            onClick={() => handleShortcutEditToggle("toggleSkipSubtitleGaps")}
                            aria-pressed={listeningShortcut === "toggleSkipSubtitleGaps"}
                          >
                            {getShortcutLabel("toggleSkipSubtitleGaps")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </details>
        </div>
      </section>
    </div>
  );
}

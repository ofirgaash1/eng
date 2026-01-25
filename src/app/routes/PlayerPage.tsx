import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useDictionaryStore } from "../../state/dictionaryStore";
import { usePrefsStore } from "../../state/prefsStore";
import type { Cue, Token } from "../../core/types";
import { tokenize } from "../../core/nlp/tokenize";
import { hashBlob } from "../../utils/file";
import { upsertSubtitleFile } from "../../data/filesRepo";
import { getCuesForFile, saveCuesForFile } from "../../data/cuesRepo";
import { getLastSession, saveLastSession } from "../../data/sessionRepo";
import { parseSrt } from "../../core/parsing/srtParser";

function formatTime(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

const RTL_TEXT_RE = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/;

function detectRtlFromCues(cues: Cue[]): boolean {
  return cues.some((cue) => RTL_TEXT_RE.test(cue.rawText));
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

function SubtitleCue({
  cue,
  onTokenClick,
  onTokenContextMenu,
  classForToken,
  isRtl = false,
  className,
}: SubtitleCueProps) {
  const tokens = useMemo(() => cue.tokens ?? tokenize(cue.rawText), [cue]);
  const orderedTokens = useMemo(
    () => (isRtl ? [...tokens].reverse() : tokens),
    [isRtl, tokens],
  );
  return (
    <div className={`flex flex-wrap gap-1 ${className ?? ""}`} dir={isRtl ? "rtl" : "ltr"}>
      {orderedTokens.map((token, index) => (
        <button
          key={`${token.text}-${index}`}
          type="button"
          className={`rounded px-0.5 text-left ${
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
          <span className={`rounded px-1 py-0.5 transition-colors ${classForToken(token)}`}>
            {token.text}
          </span>
        </button>
      ))}
    </div>
  );
}

export default function PlayerPage() {
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const pendingParseRef = useRef<
    Map<string, { hash: string; fileName: string; target: "primary" | "secondary" }>
  >(new Map());
  const latestParseRef = useRef<{ primary?: string; secondary?: string }>({});
  const [videoName, setVideoName] = useState<string>("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
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
  const lastVideoTimeSavedRef = useRef<number>(0);
  const addWord = useDictionaryStore((state) => state.addUnknownWordFromToken);
  const classForToken = useDictionaryStore((state) => state.classForToken);
  const initializeDictionary = useDictionaryStore((state) => state.initialize);
  const dictionaryReady = useDictionaryStore((state) => state.initialized);
  const initializePrefs = usePrefsStore((state) => state.initialize);
  const prefsInitialized = usePrefsStore((state) => state.initialized);
  const setLastOpened = usePrefsStore((state) => state.setLastOpened);

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

  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      const session = await getLastSession();
      if (cancelled || !session) {
        return;
      }

      if (session.videoBlob) {
        const blob = session.videoBlob;
        setVideoUrl((previous) => {
          if (previous) {
            URL.revokeObjectURL(previous);
          }
          return URL.createObjectURL(blob);
        });
        setVideoName(session.videoName ?? "");
      } else if (session.videoName) {
        setVideoName(session.videoName);
      }

      if (session.subtitleName) {
        setSubtitleName(session.subtitleName);
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
  }, [applyParsedCues, applyParsedSecondaryCues]);
  useEffect(() => {
    if (!videoUrl) return;
    return () => {
      URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
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

  const seekBy = useCallback((deltaSeconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const nextTime = Math.min(
      Math.max(video.currentTime + deltaSeconds, 0),
      Number.isFinite(video.duration) ? video.duration : Number.MAX_SAFE_INTEGER,
    );
    video.currentTime = nextTime;
  }, []);

  const processSubtitleFile = useCallback(
    async (file: File) => {
      resetPlayback();
      setSubtitleError(null);
      setSubtitleLoading(true);
      setCurrentTimeMs(0);
      const text = await file.text();
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
      const text = await file.text();
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
      setVideoName(videoFile.name);
      setCurrentTimeMs(0);
      setVideoUrl((previous) => {
        if (previous) {
          URL.revokeObjectURL(previous);
        }
        return URL.createObjectURL(videoFile);
      });

      void saveLastSession({ videoName: videoFile.name, videoBlob: videoFile, videoTimeSeconds: 0 });

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
    setCurrentTimeMs(video.currentTime * 1000);
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

  const adjustSubtitleOffset = useCallback((deltaMs: number) => {
    setSubtitleOffsetMs((previous) => previous + deltaMs);
  }, []);

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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;

      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      if (tagName && ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(tagName)) {
        return;
      }
      if (target?.isContentEditable) {
        return;
      }

      const activeElement = document.activeElement as HTMLElement | null;
      if (activeElement) {
        if (activeElement === video) {
          video.blur();
        } else if (activeElement instanceof HTMLElement) {
          if (activeElement.tagName === "BUTTON") {
            activeElement.blur();
          } else if (video.contains(activeElement)) {
            video.blur();
          }
        }
      }

      switch (event.key) {
        case " ":
        case "Spacebar": {
          event.preventDefault();
          togglePlayback();
          break;
        }
        case "ArrowLeft": {
          event.preventDefault();
          seekBy(-5);
          break;
        }
        case "ArrowRight": {
          event.preventDefault();
          seekBy(5);
          break;
        }
        case "f":
        case "F": {
          event.preventDefault();
          toggleFullscreen();
          break;
        }
        case "h":
        case "H":
        case "י": {
          event.preventDefault();
          toggleSecondarySubtitle();
          break;
        }
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [seekBy, toggleFullscreen, togglePlayback, toggleSecondarySubtitle]);

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
      <section className="space-y-4">
        <div
          ref={playerContainerRef}
          className="relative aspect-video overflow-hidden rounded-lg bg-black shadow-xl"
          onDoubleClick={toggleFullscreen}
        >
          <button
            type="button"
            className="absolute right-3 top-3 z-10 rounded bg-black/70 px-3 py-1 text-xs font-medium text-white transition hover:bg-black/80 focus:outline-none focus-visible:outline-none"
            onClick={(event) => {
              event.stopPropagation();
              toggleFullscreen();
              if (event.currentTarget instanceof HTMLElement) {
                event.currentTarget.blur();
              }
            }}
          >
            {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          </button>
          <video
            ref={videoRef}
            className="h-full w-full focus:outline-none focus-visible:outline-none"
            controls
            controlsList="nofullscreen"
            onTimeUpdate={handleTimeUpdate}
            src={videoUrl ?? undefined}
            tabIndex={-1}
          >
            <track kind="subtitles" srcLang="en" label={subtitleName || "Subtitles"} />
          </video>
          {secondarySubtitleEnabled && activeSecondaryCues.length > 0 && (
            <div className="pointer-events-none absolute inset-0 flex flex-col justify-start p-6">
              <div className="pointer-events-auto flex flex-col items-center gap-3">
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
          )}
          {activeCues.length > 0 && (
            <div className="pointer-events-none absolute inset-0 flex flex-col justify-end p-6">
              <div className="pointer-events-auto flex flex-col items-center gap-3">
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
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-white/5 p-3 text-sm text-white/80">
          <span className="font-medium text-white">Subtitle timing</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded bg-white/10 px-2 py-1 transition hover:bg-white/20 focus:outline-none focus-visible:outline-none"
              onClick={(event) => {
                adjustSubtitleOffset(-500);
                if (event.currentTarget instanceof HTMLElement) {
                  event.currentTarget.blur();
                }
              }}
            >
              –0.5s
            </button>
            <button
              type="button"
              className="rounded bg-white/10 px-2 py-1 transition hover:bg-white/20 focus:outline-none focus-visible:outline-none"
              onClick={(event) => {
                adjustSubtitleOffset(500);
                if (event.currentTarget instanceof HTMLElement) {
                  event.currentTarget.blur();
                }
              }}
            >
              +0.5s
            </button>
          </div>
          <span className="text-xs text-white/60">
            Offset: {subtitleOffsetMs >= 0 ? "+" : ""}
            {(subtitleOffsetMs / 1000).toFixed(1)}s
          </span>
        </div>
        <label className="flex w-full cursor-pointer flex-col gap-2 rounded-lg border border-dashed border-white/20 bg-white/5 p-4 text-sm hover:border-white/40">
          <span className="font-medium">Load video</span>
          <input
            type="file"
            accept="video/*,video/x-matroska,.mkv,.MKV"
            multiple
            className="hidden"
            onChange={handleVideoUpload}
          />
          <span className="text-xs text-white/60">Automatically pairs a matching .srt when selected together.</span>
          <span className="text-xs text-white/60">Current: {videoName || "None"}</span>
        </label>
        <label className="flex w-full cursor-pointer flex-col gap-2 rounded-lg border border-dashed border-white/20 bg-white/5 p-4 text-sm hover:border-white/40">
          <span className="font-medium">Load subtitles (SRT)</span>
          <input type="file" accept=".srt" className="hidden" onChange={handleSubtitleUpload} />
          <span className="text-xs text-white/60">Current: {subtitleName || "None"}</span>
          {subtitleLoading && (
            <span className="text-xs text-amber-300">Processing subtitles…</span>
          )}
          {subtitleError && (
            <span className="text-xs text-red-400">{subtitleError}</span>
          )}
        </label>
        <label className="flex items-center gap-2 text-xs text-white/70">
          <input
            type="checkbox"
            checked={isSubtitleRtl}
            onChange={(event) => setIsSubtitleRtl(event.target.checked)}
            className="h-3 w-3 rounded border-white/30 bg-slate-900"
          />
          Right-to-left order
        </label>
        <details className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm">
          <summary className="cursor-pointer list-none font-medium text-white/90">
            Second subtitles (optional)
          </summary>
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded bg-white/10 px-2 py-1 text-xs font-medium text-white transition hover:bg-white/20 focus:outline-none focus-visible:outline-none"
                onClick={(event) => {
                  toggleSecondarySubtitle();
                  if (event.currentTarget instanceof HTMLElement) {
                    event.currentTarget.blur();
                  }
                }}
                disabled={secondaryCues.length === 0}
              >
                {secondarySubtitleEnabled ? "On" : "Off"}
              </button>
              <span className="text-xs text-white/60">
                Shows a second line at the top. Shortcut: H/י
              </span>
            </div>
            <label className="flex w-full cursor-pointer flex-col gap-2 rounded-lg border border-dashed border-white/20 bg-white/5 p-3 text-xs hover:border-white/40">
              <span className="font-medium text-sm">Load second subtitles (SRT)</span>
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
            <label className="flex items-center gap-2 text-xs text-white/70">
              <input
                type="checkbox"
                checked={isSecondarySubtitleRtl}
                onChange={(event) => setIsSecondarySubtitleRtl(event.target.checked)}
                className="h-3 w-3 rounded border-white/30 bg-slate-900"
              />
              Right-to-left order
            </label>
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-white/5 p-2 text-xs text-white/80">
              <span className="font-medium text-white">Second subtitle timing</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded bg-white/10 px-2 py-1 transition hover:bg-white/20 focus:outline-none focus-visible:outline-none"
                  onClick={(event) => {
                    adjustSecondarySubtitleOffset(-500);
                    if (event.currentTarget instanceof HTMLElement) {
                      event.currentTarget.blur();
                    }
                  }}
                >
                  –0.5s
                </button>
                <button
                  type="button"
                  className="rounded bg-white/10 px-2 py-1 transition hover:bg-white/20 focus:outline-none focus-visible:outline-none"
                  onClick={(event) => {
                    adjustSecondarySubtitleOffset(500);
                    if (event.currentTarget instanceof HTMLElement) {
                      event.currentTarget.blur();
                    }
                  }}
                >
                  +0.5s
                </button>
              </div>
              <span className="text-xs text-white/60">
                Offset: {secondarySubtitleOffsetMs >= 0 ? "+" : ""}
                {(secondarySubtitleOffsetMs / 1000).toFixed(1)}s
              </span>
            </div>
          </div>
        </details>
      </section>
      <aside className="space-y-4">
        <div className="rounded-lg bg-black/40 p-4">
          <h2 className="text-lg font-semibold">Active Cue</h2>
          {subtitleLoading ? (
            <p className="mt-3 text-sm text-white/60">Processing subtitles…</p>
          ) : activeCues.length > 0 ? (
            <div className="mt-3 space-y-2 text-sm">
              {activeCues.map((cue) => (
                <div key={`${cue.startMs}-${cue.endMs}`} className="space-y-2">
                  <div className="text-white/60">
                    {formatTime(Math.max(0, cue.startMs + subtitleOffsetMs))} – {formatTime(
                      Math.max(0, cue.endMs + subtitleOffsetMs),
                    )}
                  </div>
                  <SubtitleCue
                    cue={cue}
                    classForToken={classForToken}
                    onTokenClick={handleTokenClick}
                    onTokenContextMenu={handleTokenContextMenu}
                    isRtl={isSubtitleRtl}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-white/50">Load a subtitle file to see cues.</p>
          )}
        </div>
      </aside>
    </div>
  );
}

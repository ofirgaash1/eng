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

interface SubtitleCueProps {
  cue: Cue;
  onTokenClick: (token: Token) => void;
  classForToken: (token: Token) => string;
  className?: string;
}

type WorkerResponse = {
  id: string;
  cues: Cue[];
  error?: string;
};

function SubtitleCue({ cue, onTokenClick, classForToken, className }: SubtitleCueProps) {
  const tokens = useMemo(() => cue.tokens ?? tokenize(cue.rawText), [cue]);
  return (
    <div className={`flex flex-wrap gap-1 ${className ?? ""}`}>
      {tokens.map((token, index) => (
        <button
          key={`${token.text}-${index}`}
          type="button"
          className={`rounded px-0.5 text-left ${
            token.isWord ? "focus:outline-none focus-visible:outline-none" : "cursor-default"
          }`}
          onClick={(event) => {
            if (!token.isWord) return;
            onTokenClick(token);
            if (event.currentTarget instanceof HTMLElement) {
              event.currentTarget.blur();
            }
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
  const pendingParseRef = useRef<{ id: string; hash: string; fileName: string } | null>(null);
  const [videoName, setVideoName] = useState<string>("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [subtitleName, setSubtitleName] = useState<string>("");
  const [cues, setCues] = useState<Cue[]>([]);
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(0);
  const [subtitleLoading, setSubtitleLoading] = useState<boolean>(false);
  const [subtitleOffsetMs, setSubtitleOffsetMs] = useState<number>(0);
  const [subtitleError, setSubtitleError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const addWord = useDictionaryStore((state) => state.addUnknownWordFromToken);
  const classForToken = useDictionaryStore((state) => state.classForToken);
  const initializeDictionary = useDictionaryStore((state) => state.initialize);
  const dictionaryReady = useDictionaryStore((state) => state.initialized);
  const initializePrefs = usePrefsStore((state) => state.initialize);
  const prefsInitialized = usePrefsStore((state) => state.initialized);
  const setLastOpened = usePrefsStore((state) => state.setLastOpened);

  const applyParsedCues = useCallback(async (hash: string, fileName: string, parsed: Cue[]) => {
    setCues(parsed);
    await Promise.all([
      saveCuesForFile(hash, parsed),
      upsertSubtitleFile({ name: fileName, bytesHash: hash, totalCues: parsed.length }),
    ]);
  }, []);

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
      const pending = pendingParseRef.current;
      if (!pending || event.data.id !== pending.id) return;
      pendingParseRef.current = null;

      if (event.data.error) {
        setSubtitleError(event.data.error);
        setSubtitleLoading(false);
        return;
      }

      try {
        setSubtitleError(null);
        await applyParsedCues(pending.hash, pending.fileName, event.data.cues);
      } catch (error) {
        console.error(error);
        setSubtitleError("Failed to store parsed subtitles.");
      } finally {
        setSubtitleLoading(false);
      }
    };

    worker.addEventListener("message", handleMessage);
    return () => {
      worker.removeEventListener("message", handleMessage);
    };
  }, [applyParsedCues]);

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
      if (!session.subtitleHash) {
        return;
      }

      setSubtitleLoading(true);
      setSubtitleError(null);
      const cached = await getCuesForFile(session.subtitleHash);
      if (cancelled) {
        return;
      }

      if (cached) {
        setCues(cached);
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
        pendingParseRef.current = {
          id: requestId,
          hash: session.subtitleHash,
          fileName: session.subtitleName ?? session.subtitleHash,
        };
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
          setCues([]);
        }
      } finally {
        if (!cancelled) {
          setSubtitleLoading(false);
        }
      }
    };

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, [applyParsedCues]);
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

  const handleVideoUpload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      resetPlayback();
      setVideoName(file.name);
      setCurrentTimeMs(0);
      setVideoUrl((previous) => {
        if (previous) {
          URL.revokeObjectURL(previous);
        }
        return URL.createObjectURL(file);
      });

      void saveLastSession({ videoName: file.name, videoBlob: file });
      event.target.value = "";
    },
    [resetPlayback],
  );

  const handleSubtitleUpload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      resetPlayback();
      setSubtitleError(null);
      setSubtitleLoading(true);
      setCurrentTimeMs(0);
      const text = await file.text();
      const hash = await hashBlob(file);

      pendingParseRef.current = null;
      setSubtitleName(file.name);
      setCues([]);

      void saveLastSession({
        subtitleName: file.name,
        subtitleText: text,
        subtitleHash: hash,
      });

      const cached = await getCuesForFile(hash);
      if (cached) {
        setCues(cached);
        setSubtitleLoading(false);
        await upsertSubtitleFile({ name: file.name, bytesHash: hash, totalCues: cached.length });
        event.target.value = "";
        return;
      }

      const worker = workerRef.current;
      if (worker) {
        const requestId = crypto.randomUUID();
        pendingParseRef.current = { id: requestId, hash, fileName: file.name };
        worker.postMessage({ id: requestId, text });
        event.target.value = "";
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
        setCues([]);
      } finally {
        setSubtitleLoading(false);
      }

      event.target.value = "";
    },
    [applyParsedCues, resetPlayback],
  );

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || cues.length === 0) return;
    setCurrentTimeMs(video.currentTime * 1000);
  };

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
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [seekBy, toggleFullscreen, togglePlayback]);

  const activeCues = useMemo(
    () =>
      cues.filter((cue) => {
        const adjustedStart = cue.startMs + subtitleOffsetMs;
        const adjustedEnd = cue.endMs + subtitleOffsetMs;
        return adjustedStart <= currentTimeMs && adjustedEnd >= currentTimeMs;
      }),
    [cues, currentTimeMs, subtitleOffsetMs],
  );

  const adjustSubtitleOffset = useCallback((deltaMs: number) => {
    setSubtitleOffsetMs((previous) => previous + deltaMs);
  }, []);

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
                      onTokenClick={(token) => {
                        void addWord(token);
                      }}
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
          <input type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
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
                    onTokenClick={(token) => {
                      void addWord(token);
                    }}
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

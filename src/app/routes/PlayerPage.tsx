import { useEffect, useMemo, useRef, useState } from "react";
import { useDictionaryStore } from "../../state/dictionaryStore";
import { Cue, Token } from "../../core/types";
import { tokenize } from "../../core/nlp/tokenize";
import { parseSrt } from "../../core/parsing/srtParser";
import { hashBlob } from "../../utils/file";
import { upsertSubtitleFile } from "../../data/filesRepo";

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

function SubtitleCue({ cue, onTokenClick, classForToken, className }: SubtitleCueProps) {
  const tokens = useMemo(() => cue.tokens ?? tokenize(cue.rawText), [cue]);
  return (
    <div className={`flex flex-wrap gap-1 ${className ?? ""}`}>
      {tokens.map((token, index) => (
        <button
          key={`${token.text}-${index}`}
          type="button"
          className={`rounded px-0.5 text-left ${
            token.isWord
              ? "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              : "cursor-default"
          }`}
          onClick={() => token.isWord && onTokenClick(token)}
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
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoName, setVideoName] = useState<string>("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [subtitleName, setSubtitleName] = useState<string>("");
  const [cues, setCues] = useState<Cue[]>([]);
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(0);
  const addWord = useDictionaryStore((state) => state.addUnknownWordFromToken);
  const classForToken = useDictionaryStore((state) => state.classForToken);
  const initializeDictionary = useDictionaryStore((state) => state.initialize);
  const dictionaryReady = useDictionaryStore((state) => state.initialized);

  useEffect(() => {
    if (!dictionaryReady) {
      void initializeDictionary();
    }
  }, [dictionaryReady, initializeDictionary]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
  }, [videoUrl]);

  useEffect(() => {
    if (!videoUrl) return undefined;
    return () => {
      URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  const handleVideoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setVideoName(file.name);
    setCurrentTimeMs(0);

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }

    setVideoUrl((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous);
      }
      return URL.createObjectURL(file);
    });
  };

  const handleSubtitleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const parsedCues = parseSrt(text);
    const hash = await hashBlob(file);

    setSubtitleName(file.name);
    setCues(parsedCues);
    setCurrentTimeMs(0);

    if (videoRef.current) {
      videoRef.current.currentTime = 0;
    }

    await upsertSubtitleFile({
      name: file.name,
      bytesHash: hash,
      totalCues: parsedCues.length,
    });
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || cues.length === 0) return;
    setCurrentTimeMs(video.currentTime * 1000);
  };

  const activeCues = useMemo(
    () => cues.filter((cue) => cue.startMs <= currentTimeMs && cue.endMs >= currentTimeMs),
    [cues, currentTimeMs],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
      <section className="space-y-4">
        <div className="relative aspect-video overflow-hidden rounded-lg bg-black shadow-xl">
          <video
            ref={videoRef}
            className="h-full w-full"
            controls
            onTimeUpdate={handleTimeUpdate}
            src={videoUrl ?? undefined}
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
        <label className="flex w-full cursor-pointer flex-col gap-2 rounded-lg border border-dashed border-white/20 bg-white/5 p-4 text-sm hover:border-white/40">
          <span className="font-medium">Load video</span>
          <input type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
          <span className="text-xs text-white/60">Current: {videoName || "None"}</span>
        </label>
        <label className="flex w-full cursor-pointer flex-col gap-2 rounded-lg border border-dashed border-white/20 bg-white/5 p-4 text-sm hover:border-white/40">
          <span className="font-medium">Load subtitles (SRT)</span>
          <input type="file" accept=".srt" className="hidden" onChange={handleSubtitleUpload} />
          <span className="text-xs text-white/60">Current: {subtitleName || "None"}</span>
        </label>
      </section>
      <aside className="space-y-4">
        <div className="rounded-lg bg-black/40 p-4">
          <h2 className="text-lg font-semibold">Active Cue</h2>
          {activeCues.length > 0 ? (
            <div className="mt-3 space-y-2 text-sm">
              {activeCues.map((cue) => (
                <div key={`${cue.startMs}-${cue.endMs}`} className="space-y-2">
                  <div className="text-white/60">{formatTime(cue.startMs)} – {formatTime(cue.endMs)}</div>
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

import { useMemo, useRef, useState } from "react";
import { useDictionaryStore } from "../../state/dictionaryStore";
import { Cue, Token } from "../../core/types";
import { tokenize } from "../../core/nlp/tokenize";
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
}

function SubtitleCue({ cue, onTokenClick, classForToken }: SubtitleCueProps) {
  const tokens = useMemo(() => cue.tokens ?? tokenize(cue.rawText), [cue]);
  return (
    <div className="flex flex-wrap gap-1">
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
  const [subtitleName, setSubtitleName] = useState<string>("");
  const [cues, setCues] = useState<Cue[]>([]);
  const [activeCueIndex, setActiveCueIndex] = useState<number>(0);
  const addWord = useDictionaryStore((state) => state.addUnknownWordFromToken);
  const classForToken = useDictionaryStore((state) => state.classForToken);

  const handleSubtitleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSubtitleName(file.name);
    const text = await file.text();
    const parsedCues = parseSrt(text);

    setCues(parsedCues);
    setActiveCueIndex(0);
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || cues.length === 0) return;
    const currentTimeMs = video.currentTime * 1000;
    const index = cues.findIndex((cue) => cue.startMs <= currentTimeMs && cue.endMs >= currentTimeMs);
    if (index !== -1 && index !== activeCueIndex) {
      setActiveCueIndex(index);
    }
  };

  const activeCue = cues[activeCueIndex];

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
      <section className="space-y-4">
        <div className="relative aspect-video overflow-hidden rounded-lg bg-black shadow-xl">
          <video
            ref={videoRef}
            className="h-full w-full"
            controls
            onTimeUpdate={handleTimeUpdate}
          >
            <track kind="subtitles" srcLang="en" label={subtitleName || "Subtitles"} />
          </video>
        </div>
        <label className="flex w-full cursor-pointer flex-col gap-2 rounded-lg border border-dashed border-white/20 bg-white/5 p-4 text-sm hover:border-white/40">
          <span className="font-medium">Load subtitles (SRT)</span>
          <input type="file" accept=".srt" className="hidden" onChange={handleSubtitleUpload} />
          <span className="text-xs text-white/60">Current: {subtitleName || "None"}</span>
        </label>
      </section>
      <aside className="space-y-4">
        <div className="rounded-lg bg-black/40 p-4">
          <h2 className="text-lg font-semibold">Active Cue</h2>
          {activeCue ? (
            <div className="mt-3 space-y-2 text-sm">
              <div className="text-white/60">{formatTime(activeCue.startMs)} – {formatTime(activeCue.endMs)}</div>
              <SubtitleCue
                cue={activeCue}
                classForToken={classForToken}
                onTokenClick={(token) => {
                  addWord(token);
                }}
              />
            </div>
          ) : (
            <p className="text-sm text-white/50">Load a subtitle file to see cues.</p>
          )}
        </div>
      </aside>
    </div>
  );
}

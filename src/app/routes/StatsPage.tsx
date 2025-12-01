import { useEffect, useMemo, useState } from "react";
import type { SubtitleFile, UnknownWord } from "../../core/types";
import { estimateCefrLevel } from "../../core/cefr/estimateLevel";
import type { CefrBucket } from "../../core/cefr/lexicon";
import { useDictionaryStore } from "../../state/dictionaryStore";
import { listSubtitleFiles } from "../../data/filesRepo";
import { getCuesForFile } from "../../data/cuesRepo";
import { tokenize } from "../../core/nlp/tokenize";

function percentage(part: number, total: number) {
  if (total === 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

const EMPTY_LEVEL_COUNTS: Record<CefrBucket, number> = {
  A1: 0,
  A2: 0,
  B1: 0,
  B2: 0,
  C1: 0,
  C2: 0,
  Unknown: 0,
};

export default function StatsPage() {
  const words = useDictionaryStore((state) => state.words);
  const initializeDictionary = useDictionaryStore((state) => state.initialize);
  const initialized = useDictionaryStore((state) => state.initialized);

  const [subtitleFiles, setSubtitleFiles] = useState<SubtitleFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [analyzingLibrary, setAnalyzingLibrary] = useState(false);
  const [tokenStats, setTokenStats] = useState<{
    totalTokens: number;
    unknownTokens: number;
    unknownByLevel: Record<CefrBucket, number>;
  }>({
    totalTokens: 0,
    unknownTokens: 0,
    unknownByLevel: { ...EMPTY_LEVEL_COUNTS },
  });
  const [activeLevel, setActiveLevel] = useState<CefrBucket | null>(null);

  useEffect(() => {
    if (!initialized) {
      void initializeDictionary();
    }
  }, [initializeDictionary, initialized]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingFiles(true);
      const files = await listSubtitleFiles();
      if (!cancelled) {
        setSubtitleFiles(files);
        setLoadingFiles(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const cefrSummary = useMemo(() => {
    const buckets: Record<CefrBucket, UnknownWord[]> = {
      A1: [],
      A2: [],
      B1: [],
      B2: [],
      C1: [],
      C2: [],
      Unknown: [],
    };
    for (const word of words) {
      const level = estimateCefrLevel(word);
      buckets[level].push(word);
    }
    const counts = (Object.keys(buckets) as CefrBucket[]).reduce((acc, level) => {
      acc[level] = buckets[level].length;
      return acc;
    }, { ...EMPTY_LEVEL_COUNTS });
    const percents = (Object.keys(counts) as CefrBucket[]).reduce((acc, level) => {
      acc[level] = percentage(counts[level], words.length);
      return acc;
    }, { ...EMPTY_LEVEL_COUNTS });

    const sortedBuckets = (Object.keys(buckets) as CefrBucket[]).reduce((acc, level) => {
      acc[level] = [...buckets[level]].sort((a, b) => a.original.localeCompare(b.original));
      return acc;
    }, buckets);

    return { buckets: sortedBuckets, counts, percents, total: words.length };
  }, [words]);

  useEffect(() => {
    let cancelled = false;
    if (subtitleFiles.length === 0) {
      setTokenStats({
        totalTokens: 0,
        unknownTokens: 0,
        unknownByLevel: { ...EMPTY_LEVEL_COUNTS },
      });
      setAnalyzingLibrary(false);
      return;
    }

    const analyzeLibrary = async () => {
      setAnalyzingLibrary(true);
      const normalizedMap = new Map<string, UnknownWord>();
      const stemMap = new Map<string, UnknownWord>();
      const levelById = new Map<string, CefrBucket>();

      for (const word of words) {
        normalizedMap.set(word.normalized.toLowerCase(), word);
        stemMap.set(word.stem, word);
        levelById.set(word.id, estimateCefrLevel(word));
      }

      let totalTokens = 0;
      let unknownTokens = 0;
      const unknownByLevel: Record<CefrBucket, number> = { ...EMPTY_LEVEL_COUNTS };

      for (const file of subtitleFiles) {
        const cues = await getCuesForFile(file.bytesHash);
        if (!cues) continue;
        for (const cue of cues) {
          const tokens = cue.tokens ?? tokenize(cue.rawText);
          for (const token of tokens) {
            if (!token.isWord) continue;
            totalTokens += 1;
            const match = normalizedMap.get(token.normalized) ?? stemMap.get(token.stem);
            if (match) {
              unknownTokens += 1;
              const level = levelById.get(match.id);
              if (level) {
                unknownByLevel[level] += 1;
              }
            }
          }
        }
      }

      if (!cancelled) {
        setTokenStats({ totalTokens, unknownTokens, unknownByLevel });
        setAnalyzingLibrary(false);
      }
    };

    void analyzeLibrary();
    return () => {
      cancelled = true;
    };
  }, [subtitleFiles, words]);

  const unknownEncounterInterval = useMemo(() => {
    if (tokenStats.unknownTokens === 0) return null;
    return Math.max(1, Math.round(tokenStats.totalTokens / tokenStats.unknownTokens));
  }, [tokenStats.totalTokens, tokenStats.unknownTokens]);

  const activeWords = activeLevel ? cefrSummary.buckets[activeLevel] ?? [] : [];

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <h3 className="text-sm font-medium text-white/70">Unknown words saved</h3>
          <p className="mt-2 text-2xl font-semibold text-white">{words.length}</p>
          <p className="text-xs text-white/60">
            {words.length === 0
              ? "Add words from the player to start tracking."
              : `Covers ${tokenStats.totalTokens.toLocaleString()} word tokens in your library.`}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <h3 className="text-sm font-medium text-white/70">Encounter rate</h3>
          <p className="mt-2 text-2xl font-semibold text-white">
            {unknownEncounterInterval ? `1 in ${unknownEncounterInterval}` : "—"}
          </p>
          <p className="text-xs text-white/60">
            {tokenStats.totalTokens === 0
              ? "Add subtitles to measure coverage."
              : `${percentage(tokenStats.unknownTokens, tokenStats.totalTokens)}% of words you see are on your unknown list.`}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <h3 className="text-sm font-medium text-white/70">Library coverage</h3>
          <p className="mt-2 text-2xl font-semibold text-white">{subtitleFiles.length}</p>
          <p className="text-xs text-white/60">
            Subtitle files stored · {loadingFiles ? "Loading…" : `${tokenStats.totalTokens.toLocaleString()} word tokens scanned`}
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-lg font-semibold">CEFR guess (unknown words)</h3>
              <p className="text-sm text-white/60">Tap a level to see the words grouped there.</p>
            </div>
            {analyzingLibrary && (
              <span className="text-xs text-white/60">Analyzing…</span>
            )}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
            {(Object.keys(cefrSummary.counts) as CefrBucket[]).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setActiveLevel(level)}
                className="rounded-md bg-black/40 p-3 text-center transition hover:bg-black/60 focus:outline-none focus-visible:outline-none"
              >
                <div className="text-lg font-semibold text-white">{level}</div>
                <div className="text-sm text-white/70">{cefrSummary.counts[level]} words</div>
                <div className="text-xs text-white/50">{cefrSummary.percents[level]}% of list</div>
                <div className="text-[11px] text-white/40">
                  {tokenStats.unknownByLevel[level] > 0
                    ? `${tokenStats.unknownByLevel[level].toLocaleString()} encounters in subtitles`
                    : "No matches in subtitles yet"}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <h3 className="text-lg font-semibold">Library snapshot</h3>
          {loadingFiles ? (
            <p className="mt-2 text-sm text-white/60">Loading files…</p>
          ) : subtitleFiles.length === 0 ? (
            <p className="mt-2 text-sm text-white/60">No subtitle files stored yet.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm text-white/80">
              {subtitleFiles.slice(0, 6).map((file) => (
                <li key={file.id} className="flex items-center justify-between rounded bg-black/40 px-3 py-2">
                  <div className="truncate">
                    <div className="truncate font-medium text-white">{file.name}</div>
                    <div className="text-xs text-white/60">{file.totalCues.toLocaleString()} cues</div>
                  </div>
                  <span className="text-xs text-white/50">{new Date(file.addedAt).toLocaleDateString()}</span>
                </li>
              ))}
              {subtitleFiles.length > 6 && (
                <li className="text-xs text-white/60">
                  +{subtitleFiles.length - 6} more subtitle file{subtitleFiles.length - 6 === 1 ? "" : "s"}
                </li>
              )}
            </ul>
          )}
        </div>
      </section>

      {activeLevel && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-xl rounded-lg bg-slate-900 p-5 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4 className="text-lg font-semibold text-white">
                  CEFR {activeLevel} · {activeWords.length} word{activeWords.length === 1 ? "" : "s"}
                </h4>
                <p className="text-xs text-white/60">Words from your unknown list bucketed by the quick CEFR heuristic.</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveLevel(null)}
                className="rounded border border-white/20 bg-white/10 px-3 py-1 text-sm text-white transition hover:border-white/40 hover:bg-white/20 focus:outline-none focus-visible:outline-none"
              >
                Close
              </button>
            </div>
            <div className="mt-3 max-h-[60vh] space-y-1 overflow-y-auto rounded border border-white/10 bg-black/40 p-3 text-sm text-white/80">
              {activeWords.length === 0 ? (
                <p className="text-xs text-white/60">No words assigned to this level yet.</p>
              ) : (
                activeWords.map((word: UnknownWord) => (
                  <div key={word.id} className="flex items-center justify-between gap-3">
                    <span className="font-medium text-white">{word.original}</span>
                    <span className="text-xs text-white/50">{word.normalized}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

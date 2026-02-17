import { useEffect, useMemo, useState } from "react";
import type { SubtitleFile, UnknownWord, WordDecisionRecord } from "../../core/types";
import { useDictionaryStore } from "../../state/dictionaryStore";
import { listSubtitleFiles } from "../../data/filesRepo";
import { getCuesForFile } from "../../data/cuesRepo";
import { tokenize } from "../../core/nlp/tokenize";
import { getWordDecisions } from "../../data/candidateWordsRepo";

function percentage(part: number, total: number) {
  if (total === 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function weekBucket(timestamp: number) {
  const date = new Date(timestamp);
  const day = date.getDay();
  const diffToMonday = (day + 6) % 7;
  date.setDate(date.getDate() - diffToMonday);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const width = max <= 0 ? 0 : Math.max(3, Math.round((value / max) * 100));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-white/60">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded bg-white/10">
        <div className="h-full rounded bg-emerald-400" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export default function StatsPage() {
  const words = useDictionaryStore((state) => state.words);
  const initializeDictionary = useDictionaryStore((state) => state.initialize);
  const initialized = useDictionaryStore((state) => state.initialized);

  const [subtitleFiles, setSubtitleFiles] = useState<SubtitleFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [decisions, setDecisions] = useState<WordDecisionRecord[]>([]);
  const [tokenStats, setTokenStats] = useState<{
    totalTokens: number;
    unknownTokens: number;
    perShow: Array<{ name: string; totalTokens: number; unknownTokens: number; difficulty: number }>;
    topStems: Array<{ stem: string; count: number }>;
  }>({
    totalTokens: 0,
    unknownTokens: 0,
    perShow: [],
    topStems: [],
  });

  useEffect(() => {
    if (!initialized) {
      void initializeDictionary();
    }
  }, [initializeDictionary, initialized]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingFiles(true);
      const [files, loadedDecisions] = await Promise.all([listSubtitleFiles(), getWordDecisions()]);
      if (!cancelled) {
        setSubtitleFiles(files);
        setDecisions(loadedDecisions);
        setLoadingFiles(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (subtitleFiles.length === 0) {
      setTokenStats({
        totalTokens: 0,
        unknownTokens: 0,
        perShow: [],
        topStems: [],
      });
      return;
    }

    const analyzeLibrary = async () => {
      const normalizedMap = new Map<string, UnknownWord>();
      const stemMap = new Map<string, UnknownWord>();

      for (const word of words) {
        normalizedMap.set(word.normalized.toLowerCase(), word);
        stemMap.set(word.stem, word);
      }

      let totalTokens = 0;
      let unknownTokens = 0;
      const perShow: Array<{ name: string; totalTokens: number; unknownTokens: number; difficulty: number }> = [];
      const stemCounts = new Map<string, number>();

      for (const file of subtitleFiles) {
        const cues = await getCuesForFile(file.bytesHash);
        if (!cues) continue;
        let fileTotalTokens = 0;
        let fileUnknownTokens = 0;

        for (const cue of cues) {
          const tokens = cue.tokens ?? tokenize(cue.rawText);
          for (const token of tokens) {
            if (!token.isWord) continue;
            totalTokens += 1;
            fileTotalTokens += 1;
            const match = normalizedMap.get(token.normalized) ?? stemMap.get(token.stem);
            if (match) {
              unknownTokens += 1;
              fileUnknownTokens += 1;
              stemCounts.set(match.stem, (stemCounts.get(match.stem) ?? 0) + 1);
            }
          }
        }

        perShow.push({
          name: file.name,
          totalTokens: fileTotalTokens,
          unknownTokens: fileUnknownTokens,
          difficulty: percentage(fileUnknownTokens, fileTotalTokens),
        });
      }

      const topStems = [...stemCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([stem, count]) => ({ stem, count }));

      if (!cancelled) {
        setTokenStats({
          totalTokens,
          unknownTokens,
          perShow: perShow.sort((a, b) => b.difficulty - a.difficulty).slice(0, 8),
          topStems,
        });
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

  const weeklyTrend = useMemo(() => {
    const now = Date.now();
    const byWeek = new Map<number, { added: number; cleared: number }>();

    for (let index = 0; index < 8; index += 1) {
      const week = weekBucket(now - index * 7 * 24 * 60 * 60 * 1000);
      byWeek.set(week, { added: 0, cleared: 0 });
    }

    for (const word of words) {
      const key = weekBucket(word.createdAt);
      const row = byWeek.get(key);
      if (row) row.added += 1;
    }

    for (const decision of decisions) {
      if (decision.decision !== "known" && decision.decision !== "ignored") continue;
      const key = weekBucket(decision.updatedAt);
      const row = byWeek.get(key);
      if (row) row.cleared += 1;
    }

    return [...byWeek.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([weekStart, values]) => ({
        weekStart,
        label: new Date(weekStart).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        ...values,
      }));
  }, [decisions, words]);

  const weeklyMax = useMemo(
    () => Math.max(1, ...weeklyTrend.map((point) => Math.max(point.added, point.cleared))),
    [weeklyTrend],
  );

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

      <section className="rounded-lg border border-white/10 bg-white/5 p-4">
        <h3 className="text-lg font-semibold">Weekly unknown activity</h3>
        <p className="text-xs text-white/60">Added uses word creation dates; cleared uses known/ignored decisions.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {weeklyTrend.map((point) => (
            <div key={point.weekStart} className="rounded border border-white/10 bg-black/20 p-3">
              <div className="mb-2 text-xs text-white/60">Week of {point.label}</div>
              <Bar value={point.added} max={weeklyMax} label="Added" />
              <div className="mt-2">
                <Bar value={point.cleared} max={weeklyMax} label="Cleared" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <h3 className="text-lg font-semibold">Per-show difficulty</h3>
          <p className="text-xs text-white/60">Higher percentages mean a higher unknown-word density.</p>
          <div className="mt-4 space-y-3">
            {tokenStats.perShow.length === 0 ? (
              <p className="text-sm text-white/60">No subtitle files analyzed yet.</p>
            ) : (
              tokenStats.perShow.map((show) => (
                <div key={show.name} className="rounded border border-white/10 bg-black/20 p-3">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-white">{show.name}</span>
                    <span className="font-medium text-amber-300">{show.difficulty}%</span>
                  </div>
                  <p className="mt-1 text-xs text-white/60">
                    {show.unknownTokens.toLocaleString()} unknown / {show.totalTokens.toLocaleString()} tokens
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <h3 className="text-lg font-semibold">Top recurring unknown stems</h3>
          <p className="text-xs text-white/60">Stems that appear most often across your subtitle library.</p>
          <div className="mt-4 space-y-3">
            {tokenStats.topStems.length === 0 ? (
              <p className="text-sm text-white/60">No stem data yet.</p>
            ) : (
              tokenStats.topStems.map((stem) => <Bar key={stem.stem} value={stem.count} max={tokenStats.topStems[0]?.count ?? 1} label={stem.stem} />)
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

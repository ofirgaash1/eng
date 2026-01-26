import { useEffect, useMemo, useState } from "react";
import type { SubtitleFile, UnknownWord } from "../../core/types";
import { useDictionaryStore } from "../../state/dictionaryStore";
import { listSubtitleFiles } from "../../data/filesRepo";
import { getCuesForFile } from "../../data/cuesRepo";
import { tokenize } from "../../core/nlp/tokenize";

function percentage(part: number, total: number) {
  if (total === 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

export default function StatsPage() {
  const words = useDictionaryStore((state) => state.words);
  const initializeDictionary = useDictionaryStore((state) => state.initialize);
  const initialized = useDictionaryStore((state) => state.initialized);

  const [subtitleFiles, setSubtitleFiles] = useState<SubtitleFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [tokenStats, setTokenStats] = useState<{
    totalTokens: number;
    unknownTokens: number;
  }>({
    totalTokens: 0,
    unknownTokens: 0,
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


  useEffect(() => {
    let cancelled = false;
    if (subtitleFiles.length === 0) {
      setTokenStats({
        totalTokens: 0,
        unknownTokens: 0,
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
            }
          }
        }
      }

      if (!cancelled) {
        setTokenStats({ totalTokens, unknownTokens });
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

    </div>
  );
}

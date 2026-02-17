import { useCallback, useEffect, useMemo, useState } from "react";
import type { CandidateWordStat, Cue, UnknownWord } from "../../core/types";
import { useDictionaryStore } from "../../state/dictionaryStore";
import { getFrequencyRankForWord, loadFrequencyRanks } from "../../utils/frequencyRanks";
import { listSubtitleFiles } from "../../data/filesRepo";
import { getCuesForFile } from "../../data/cuesRepo";
import { rebuildAllCandidateWords } from "../../data/candidateWordsRepo";
import { stem as stemWord } from "../../core/nlp/stem";

type SortField = "alphabetical" | "updatedAt" | "frequencyRank";
type SortDirection = "asc" | "desc";
type ViewColumn =
  | "word"
  | "originalSentence"
  | "normalized"
  | "stem"
  | "frequencyRank"
  | "updatedAt"
  | "actions";

type PageMode = "unknowns" | "inbox";

interface WordRowProps {
  word: UnknownWord;
  frequencyRank: number | null;
  onDelete: (id: string) => Promise<void>;
  visibleColumns: Record<ViewColumn, boolean>;
}

function WordRow({ word, frequencyRank, onDelete, visibleColumns }: WordRowProps) {
  return (
    <tr className="hover:bg-white/5">
      {visibleColumns.word && <td className="px-4 py-2 font-medium">{word.original}</td>}
      {visibleColumns.originalSentence && (
        <td className="px-4 py-2 text-white/70">
          {word.originalSentence ? <span className="block max-w-xl break-words">{word.originalSentence}</span> : "—"}
        </td>
      )}
      {visibleColumns.normalized && <td className="px-4 py-2 text-white/70">{word.normalized}</td>}
      {visibleColumns.stem && <td className="px-4 py-2 text-white/70">{word.stem}</td>}
      {visibleColumns.frequencyRank && (
        <td className="px-4 py-2 text-right text-white/70">
          {typeof frequencyRank === "number" ? `#${frequencyRank.toLocaleString()}` : "-"}
        </td>
      )}
      {visibleColumns.updatedAt && <td className="px-4 py-2 text-right text-white/60">{new Date(word.updatedAt).toLocaleString()}</td>}
      {visibleColumns.actions && (
        <td className="px-4 py-2 text-right">
          <button
            type="button"
            className="rounded border border-red-500/40 px-2 py-1 text-xs font-medium text-red-300 hover:bg-red-500/10"
            onClick={() => {
              void onDelete(word.id);
            }}
          >
            Delete
          </button>
        </td>
      )}
    </tr>
  );
}

function candidateRank(candidate: CandidateWordStat, ranks: Map<string, number> | null) {
  if (!ranks) return null;
  const fakeWord = {
    id: candidate.normalized,
    original: candidate.normalized,
    normalized: candidate.normalized,
    stem: candidate.stem,
    createdAt: candidate.updatedAt,
    updatedAt: candidate.updatedAt,
  };
  return getFrequencyRankForWord(fakeWord, ranks);
}

export default function WordsPage() {
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [isLoadingRanks, setIsLoadingRanks] = useState(false);
  const [rankError, setRankError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("updatedAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [isRebuildingInbox, setIsRebuildingInbox] = useState(false);
  const [mode, setMode] = useState<PageMode>("unknowns");
  const [excludeCommonThreshold, setExcludeCommonThreshold] = useState(20000);
  const [visibleColumns] = useState<Record<ViewColumn, boolean>>({
    word: true,
    originalSentence: true,
    normalized: true,
    stem: true,
    frequencyRank: true,
    updatedAt: true,
    actions: true,
  });
  const [frequencyRanks, setFrequencyRanks] = useState<Map<string, number> | null>(null);
  const words = useDictionaryStore((state) => state.words);
  const candidateWords = useDictionaryStore((state) => state.candidateWords);
  const decisions = useDictionaryStore((state) => state.decisions);
  const initialized = useDictionaryStore((state) => state.initialized);
  const initialize = useDictionaryStore((state) => state.initialize);
  const removeWord = useDictionaryStore((state) => state.removeWord);
  const reanalyzeStems = useDictionaryStore((state) => state.reanalyzeStems);
  const addUnknownWordFromToken = useDictionaryStore((state) => state.addUnknownWordFromToken);
  const setWordDecision = useDictionaryStore((state) => state.setWordDecision);
  const refreshCandidateWords = useDictionaryStore((state) => state.refreshCandidateWords);

  useEffect(() => {
    if (!initialized) {
      void initialize();
    }
  }, [initialized, initialize]);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingRanks(true);
    setRankError(null);

    loadFrequencyRanks()
      .then((ranks) => {
        if (!cancelled) {
          setFrequencyRanks(ranks);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setRankError(error instanceof Error ? error.message : "Unable to load frequency list.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingRanks(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const ranksById = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const word of words) {
      map.set(word.id, getFrequencyRankForWord(word, frequencyRanks));
    }
    return map;
  }, [frequencyRanks, words]);

  const unknownsSorted = useMemo(() => {
    const order = [...words];
    const direction = sortDirection === "asc" ? 1 : -1;

    order.sort((a, b) => {
      if (sortField === "alphabetical") {
        return a.normalized.localeCompare(b.normalized, undefined, { sensitivity: "base" }) * direction;
      }

      if (sortField === "frequencyRank") {
        const aRank = ranksById.get(a.id);
        const bRank = ranksById.get(b.id);

        const aValue = typeof aRank === "number" ? aRank : Number.POSITIVE_INFINITY;
        const bValue = typeof bRank === "number" ? bRank : Number.POSITIVE_INFINITY;

        if (aValue !== bValue) {
          return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
        }
        return a.normalized.localeCompare(b.normalized, undefined, { sensitivity: "base" });
      }

      return (a.updatedAt - b.updatedAt) * direction;
    });

    return order;
  }, [ranksById, sortDirection, sortField, words]);

  const unknownNormalized = useMemo(() => new Set(words.map((word) => word.normalized)), [words]);

  const inboxRows = useMemo(() => {
    return candidateWords
      .filter((candidate) => !/[֐-׿]/u.test(candidate.normalized))
      .filter((candidate) => {
        const rank = candidateRank(candidate, frequencyRanks);
        if (!rank) return true;
        return rank > excludeCommonThreshold;
      })
      .filter((candidate) => !unknownNormalized.has(candidate.normalized))
      .filter((candidate) => !decisions[candidate.normalized])
      .map((candidate) => ({ candidate, rank: candidateRank(candidate, frequencyRanks), decision: decisions[candidate.normalized] ?? null }))
      .sort((a, b) => {
        const aRank = typeof a.rank === "number" ? a.rank : Number.NEGATIVE_INFINITY;
        const bRank = typeof b.rank === "number" ? b.rank : Number.NEGATIVE_INFINITY;
        if (aRank !== bRank) return bRank - aRank;
        if (a.candidate.subtitleCount !== b.candidate.subtitleCount) {
          return b.candidate.subtitleCount - a.candidate.subtitleCount;
        }
        return a.candidate.normalized.localeCompare(b.candidate.normalized);
      });
  }, [candidateWords, decisions, excludeCommonThreshold, frequencyRanks, unknownNormalized]);

  const handleSortFieldChange = useCallback((next: SortField) => {
    setSortField(next);
    if (next === "updatedAt") {
      setSortDirection("desc");
    } else {
      setSortDirection("asc");
    }
  }, []);

  const handleReanalyzeStems = useCallback(async () => {
    setIsReanalyzing(true);
    setImportError(null);
    setImportSuccess(null);
    try {
      await reanalyzeStems();
      setImportSuccess("Re-analyzed stems.");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Failed to re-analyze stems.");
    } finally {
      setIsReanalyzing(false);
    }
  }, [reanalyzeStems]);

  const handleRebuildInbox = useCallback(async () => {
    setIsRebuildingInbox(true);
    setImportError(null);
    setImportSuccess(null);
    try {
      const files = await listSubtitleFiles();
      const records: Array<{ fileHash: string; cues: Cue[] }> = [];
      for (const file of files) {
        const cues = await getCuesForFile(file.bytesHash);
        if (cues && cues.length > 0) {
          records.push({ fileHash: file.bytesHash, cues });
        }
      }
      await rebuildAllCandidateWords(records);
      await refreshCandidateWords();
      setImportSuccess(`Rebuilt inbox from ${records.length} subtitle file${records.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Failed to rebuild inbox.");
    } finally {
      setIsRebuildingInbox(false);
    }
  }, [refreshCandidateWords]);

  const triage = useCallback(
    async (candidate: CandidateWordStat, decision: "unknown" | "known" | "ignored") => {
      if (decision === "unknown") {
        await addUnknownWordFromToken(candidate.normalized, candidate.example);
      }
      await setWordDecision(candidate.normalized, decision);
      await refreshCandidateWords();
    },
    [addUnknownWordFromToken, refreshCandidateWords, setWordDecision],
  );

  if (!initialized) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Unknown Words</h2>
        <p className="text-sm text-white/60">Loading your vocabulary...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Unknown Words</h2>
          <p className="text-xs text-white/50">Use Unknowns for your list, Inbox to mine subtitles you already imported.</p>
        </div>
        <div className="flex items-center gap-2 rounded border border-white/10 bg-black/20 p-1 text-xs">
          <button type="button" className={`rounded px-3 py-1 ${mode === "unknowns" ? "bg-white/20 text-white" : "text-white/70"}`} onClick={() => setMode("unknowns")}>Unknowns</button>
          <button type="button" className={`rounded px-3 py-1 ${mode === "inbox" ? "bg-white/20 text-white" : "text-white/70"}`} onClick={() => setMode("inbox")}>Inbox candidates</button>
        </div>
      </div>

      {mode === "unknowns" ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-white/60">
            <div className="flex flex-wrap items-center gap-2">
              <span>{unknownsSorted.length} items</span>
              <label className="flex items-center gap-1">
                <span>Sort</span>
                <select
                  value={sortField}
                  onChange={(event) => {
                    handleSortFieldChange(event.target.value as SortField);
                  }}
                  className="rounded border border-white/10 bg-slate-900/80 px-2 py-1 text-white"
                >
                  <option value="updatedAt">Updated</option>
                  <option value="alphabetical">A-Z</option>
                  <option value="frequencyRank">Frequency Rank</option>
                </select>
              </label>
              <button type="button" className="rounded border border-white/10 bg-white/5 px-2 py-1 text-white" onClick={() => setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))}>
                {sortDirection === "asc" ? "Ascending" : "Descending"}
              </button>
              <button type="button" onClick={() => void handleReanalyzeStems()} className="rounded bg-white/10 px-2 py-1 text-white" disabled={isReanalyzing}>
                {isReanalyzing ? "Re-analyzing…" : "Re-analyze"}
              </button>
            </div>
          </div>

          {unknownsSorted.length === 0 ? (
            <p className="text-sm text-white/60">No unknown words yet. Use Inbox candidates to add words from subtitle history.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-white/10">
              <table className="min-w-full divide-y divide-white/10">
                <thead className="bg-white/5 text-left text-xs uppercase tracking-wide text-white/60">
                  <tr>
                    {visibleColumns.word && <th className="px-4 py-2">Word</th>}
                    {visibleColumns.originalSentence && <th className="px-4 py-2">Original sentence</th>}
                    {visibleColumns.normalized && <th className="px-4 py-2">Normalized</th>}
                    {visibleColumns.stem && <th className="px-4 py-2">Stem</th>}
                    {visibleColumns.frequencyRank && <th className="px-4 py-2 text-right">Frequency Rank</th>}
                    {visibleColumns.updatedAt && <th className="px-4 py-2 text-right">Updated</th>}
                    {visibleColumns.actions && <th className="px-4 py-2 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 text-sm">
                  {unknownsSorted.map((word) => (
                    <WordRow key={word.id} word={word} frequencyRank={ranksById.get(word.id) ?? null} onDelete={removeWord} visibleColumns={visibleColumns} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
            <button type="button" onClick={() => void handleRebuildInbox()} className="rounded bg-white/10 px-3 py-1 text-white hover:bg-white/20" disabled={isRebuildingInbox}>
              {isRebuildingInbox ? "Rebuilding…" : "Rebuild Inbox"}
            </button>
            <label className="flex items-center gap-1">
              Exclude top rank ≤
              <input type="number" className="w-20 rounded border border-white/10 bg-slate-900/80 px-2 py-1" value={excludeCommonThreshold} min={0} onChange={(e) => setExcludeCommonThreshold(Number(e.target.value) || 0)} />
            </label>
            <span>{inboxRows.length} candidates</span>
          </div>
          <div className="overflow-hidden rounded-lg border border-white/10">
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-white/5 text-left text-xs uppercase tracking-wide text-white/60">
                <tr>
                  <th className="px-4 py-2">Word</th>
                  <th className="px-4 py-2">Stem</th>
                  <th className="px-4 py-2 text-right">Frequency rank</th>
                  <th className="px-4 py-2 text-right">Subtitle freq</th>
                  <th className="px-4 py-2 text-right">Source count</th>
                  <th className="px-4 py-2">Example</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-sm">
                {inboxRows.map(({ candidate, rank, decision }) => (
                  <tr key={candidate.normalized} className="hover:bg-white/5">
                    <td className="px-4 py-2 font-medium">{candidate.normalized}</td>
                    <td className="px-4 py-2 text-white/70">{candidate.stem || stemWord(candidate.normalized)}</td>
                    <td className="px-4 py-2 text-right text-white/70">{typeof rank === "number" ? `#${rank.toLocaleString()}` : "-"}</td>
                    <td className="px-4 py-2 text-right text-white/70">{candidate.subtitleCount.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-white/70">{candidate.sourceCount.toLocaleString()}</td>
                    <td className="px-4 py-2 text-white/60"><span className="line-clamp-2">{candidate.example || "—"}</span></td>
                    <td className="px-4 py-2">
                      <div className="flex justify-end gap-2">
                        <button type="button" className="rounded border border-emerald-400/40 px-2 py-1 text-xs text-emerald-200" onClick={() => void triage(candidate, "unknown")}>Add</button>
                        <button type="button" className="rounded border border-sky-400/40 px-2 py-1 text-xs text-sky-200" onClick={() => void triage(candidate, "known")}>Known</button>
                        <button type="button" className="rounded border border-white/20 px-2 py-1 text-xs text-white/80" onClick={() => void triage(candidate, "ignored")}>Ignore</button>
                      </div>
                      {decision && <div className="mt-1 text-right text-[10px] text-white/40">Resolved: {decision}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs text-white/60">
        {isLoadingRanks && <span>Loading frequency ranks...</span>}
        {rankError && <span className="text-amber-300">{rankError}</span>}
        {importError ? <span className="text-red-400">{importError}</span> : null}
        {importSuccess ? <span className="text-emerald-400">{importSuccess}</span> : null}
      </div>
    </div>
  );
}

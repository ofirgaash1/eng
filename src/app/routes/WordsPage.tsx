import { useCallback, useEffect, useMemo, useState } from "react";
import type { UnknownWord } from "../../core/types";
import { useDictionaryStore } from "../../state/dictionaryStore";
import { getFrequencyRankForWord, loadFrequencyRanks } from "../../utils/frequencyRanks";

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
          {word.originalSentence ? (
            <span className="block max-w-xl break-words">{word.originalSentence}</span>
          ) : (
            "—"
          )}
        </td>
      )}
      {visibleColumns.normalized && <td className="px-4 py-2 text-white/70">{word.normalized}</td>}
      {visibleColumns.stem && <td className="px-4 py-2 text-white/70">{word.stem}</td>}
      {visibleColumns.frequencyRank && (
        <td className="px-4 py-2 text-right text-white/70">
          {typeof frequencyRank === "number" ? `#${frequencyRank.toLocaleString()}` : "-"}
        </td>
      )}
      {visibleColumns.updatedAt && (
        <td className="px-4 py-2 text-right text-white/60">
          {new Date(word.updatedAt).toLocaleString()}
        </td>
      )}
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

export default function WordsPage() {
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [isLoadingRanks, setIsLoadingRanks] = useState(false);
  const [rankError, setRankError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("updatedAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<ViewColumn, boolean>>({
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
  const initialized = useDictionaryStore((state) => state.initialized);
  const initialize = useDictionaryStore((state) => state.initialize);
  const removeWord = useDictionaryStore((state) => state.removeWord);
  const reanalyzeStems = useDictionaryStore((state) => state.reanalyzeStems);

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

  const sorted = useMemo(() => {
    const order = [...words];
    const direction = sortDirection === "asc" ? 1 : -1;

    order.sort((a, b) => {
      if (sortField === "alphabetical") {
        return (
          a.normalized.localeCompare(b.normalized, undefined, { sensitivity: "base" }) * direction
        );
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

  const handleCopyWords = useCallback(async () => {
    const text = sorted.map((word) => word.original).join("\n");
    if (text.trim() === "") {
      setImportError(null);
      setImportSuccess("No words available to copy.");
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setImportError(null);
      setImportSuccess(
        `Copied ${sorted.length} word${sorted.length === 1 ? "" : "s"} to the clipboard.`,
      );
    } catch (error) {
      setImportSuccess(null);
      setImportError(error instanceof Error ? error.message : "Failed to copy words.");
    }
  }, [sorted]);

  const handleCopyWordsAndSentences = useCallback(async () => {
    const text = sorted
      .map((word) => {
        const sentence = (word.originalSentence ?? "").trim();
        return `${word.original}, as in "${sentence}"`;
      })
      .join("\n");
    if (text.trim() === "") {
      setImportError(null);
      setImportSuccess("No words available to copy.");
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setImportError(null);
      setImportSuccess(
        `Copied ${sorted.length} word${sorted.length === 1 ? "" : "s"} with sentences.`,
      );
    } catch (error) {
      setImportSuccess(null);
      setImportError(error instanceof Error ? error.message : "Failed to copy words.");
    }
  }, [sorted]);

  const handleSortFieldChange = useCallback((next: SortField) => {
    setSortField(next);
    if (next === "updatedAt") {
      setSortDirection("desc");
    } else {
      setSortDirection("asc");
    }
  }, []);

  const handleSortHeaderClick = useCallback(
    (field: SortField) => {
      setSortDirection((prev) => {
        if (sortField === field) {
          return prev === "asc" ? "desc" : "asc";
        }
        return field === "updatedAt" ? "desc" : "asc";
      });
      setSortField(field);
    },
    [sortField],
  );

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

  if (!initialized) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Unknown Words</h2>
        <p className="text-sm text-white/60">Loading your saved vocabulary...</p>
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Unknown Words</h2>
        <p className="text-sm text-white/60">
          Click a word in the player to add it to your learning list.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void handleCopyWords();
            }}
            className="rounded bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-white/20"
          >
            Copy Words
          </button>
          <button
            type="button"
            onClick={() => {
              void handleCopyWordsAndSentences();
            }}
            className="rounded bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-white/20"
          >
            Copy Words + Sentences
          </button>
          <a
            href="https://chatgpt.com/share/69794951-2cc4-8013-964a-5f098056b478"
            target="_blank"
            rel="noreferrer"
            className="rounded bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-200 hover:bg-emerald-500/30"
          >
            Play with ChatGPT
          </a>
          <button
            type="button"
            onClick={() => {
              void handleReanalyzeStems();
            }}
            className="rounded bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-white/20 disabled:opacity-50"
            disabled={isReanalyzing}
          >
            {isReanalyzing ? "Re-analyzing…" : "Re-analyze"}
          </button>
        </div>
        {importError && <p className="text-xs text-red-400">{importError}</p>}
        {importSuccess && <p className="text-xs text-emerald-400">{importSuccess}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Unknown Words</h2>
          <p className="text-xs text-white/50">Review your list or prune items you no longer need.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void handleCopyWords();
            }}
            className="rounded bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-white/20"
          >
            Copy Words
          </button>
          <button
            type="button"
            onClick={() => {
              void handleCopyWordsAndSentences();
            }}
            className="rounded bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-white/20"
          >
            Copy Words + Sentences
          </button>
          <a
            href="https://chatgpt.com/share/69112ad9-3858-8013-a13d-061dd7661a56"
            target="_blank"
            rel="noreferrer"
            className="rounded bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-200 hover:bg-emerald-500/30"
          >
            Play with ChatGPT
          </a>
          <button
            type="button"
            onClick={() => {
              void handleReanalyzeStems();
            }}
            className="rounded bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-white/20 disabled:opacity-50"
            disabled={isReanalyzing}
          >
            {isReanalyzing ? "Re-analyzing..." : "Re-analyze"}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-white/60">
        <div className="flex flex-wrap items-center gap-2">
          <span>{sorted.length} items</span>
          <label className="flex items-center gap-1">
            <span>Sort</span>
            <select
              value={sortField}
              onChange={(event) => {
                handleSortFieldChange(event.target.value as SortField);
              }}
              className="rounded border border-white/10 bg-slate-900/80 px-2 py-1 text-white hover:bg-slate-800 focus:outline-none focus-visible:outline-none"
            >
              <option value="updatedAt" className="bg-slate-900 text-white">
                Updated
              </option>
              <option value="alphabetical" className="bg-slate-900 text-white">
                A-Z
              </option>
              <option value="frequencyRank" className="bg-slate-900 text-white">
                Frequency Rank
              </option>
            </select>
          </label>
          <button
            type="button"
            className="rounded border border-white/10 bg-white/5 px-2 py-1 text-white"
            onClick={() => setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))}
          >
            {sortDirection === "asc" ? "Ascending" : "Descending"}
          </button>
          <details className="relative">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded border border-white/10 bg-slate-900/80 px-2 py-1 text-white hover:bg-slate-800 focus:outline-none focus-visible:outline-none">
              View
              <span className="text-[10px] text-white/70">▾</span>
            </summary>
            <div className="absolute left-0 z-10 mt-2 w-56 rounded border border-white/10 bg-slate-900/95 p-3 text-xs text-white shadow-lg">
              {(
                [
                  ["word", "Word"],
                  ["originalSentence", "Original sentence"],
                  ["normalized", "Normalized"],
                  ["stem", "Stem"],
                  ["frequencyRank", "Frequency Rank"],
                  ["updatedAt", "Updated"],
                  ["actions", "Actions"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 py-1">
                  <input
                    type="checkbox"
                    className="h-3 w-3 rounded border-white/30 bg-slate-900"
                    checked={visibleColumns[key]}
                    onChange={() =>
                      setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }))
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </details>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isLoadingRanks && <span>Loading frequency ranks...</span>}
          {rankError && <span className="text-amber-300">{rankError}</span>}
          {importError ? (
            <span className="text-red-400">{importError}</span>
          ) : importSuccess ? (
            <span className="text-emerald-400">{importSuccess}</span>
          ) : null}
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-white/10">
        <table className="min-w-full divide-y divide-white/10">
          <thead className="bg-white/5 text-left text-xs uppercase tracking-wide text-white/60">
            <tr>
              {visibleColumns.word && (
                <th className="px-4 py-2">
                  <button
                    type="button"
                    onClick={() => handleSortHeaderClick("alphabetical")}
                    className="inline-flex items-center gap-1 hover:text-white"
                  >
                    Word
                    {sortField === "alphabetical" && (
                      <span className="text-[10px] text-white/70">
                        {sortDirection === "asc" ? "▲" : "▼"}
                      </span>
                    )}
                  </button>
                </th>
              )}
              {visibleColumns.originalSentence && <th className="px-4 py-2">Original sentence</th>}
              {visibleColumns.normalized && <th className="px-4 py-2">Normalized</th>}
              {visibleColumns.stem && <th className="px-4 py-2">Stem</th>}
              {visibleColumns.frequencyRank && (
                <th className="px-4 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => handleSortHeaderClick("frequencyRank")}
                    className="flex w-full items-center justify-end gap-1 hover:text-white"
                  >
                    Frequency Rank
                    {sortField === "frequencyRank" && (
                      <span className="text-[10px] text-white/70">
                        {sortDirection === "asc" ? "▲" : "▼"}
                      </span>
                    )}
                  </button>
                </th>
              )}
              {visibleColumns.updatedAt && (
                <th className="px-4 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => handleSortHeaderClick("updatedAt")}
                    className="flex w-full items-center justify-end gap-1 hover:text-white"
                  >
                    Updated
                    {sortField === "updatedAt" && (
                      <span className="text-[10px] text-white/70">
                        {sortDirection === "asc" ? "▲" : "▼"}
                      </span>
                    )}
                  </button>
                </th>
              )}
              {visibleColumns.actions && <th className="px-4 py-2 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10 text-sm">
            {sorted.map((word) => (
              <WordRow
                key={word.id}
                word={word}
                frequencyRank={ranksById.get(word.id) ?? null}
                onDelete={removeWord}
                visibleColumns={visibleColumns}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

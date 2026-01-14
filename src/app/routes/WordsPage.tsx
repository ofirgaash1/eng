import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import type { UnknownWord } from "../../core/types";
import {
  useDictionaryStore,
  type ImportedUnknownWord,
} from "../../state/dictionaryStore";
import {
  getFrequencyRankForWord,
  loadFrequencyRanks,
} from "../../utils/frequencyRanks";

type SortField = "alphabetical" | "updatedAt" | "frequencyRank";
type SortDirection = "asc" | "desc";

function toImportedWord(value: unknown): ImportedUnknownWord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const normalized = typeof record.normalized === "string" ? record.normalized.trim() : "";
  const stem = typeof record.stem === "string" ? record.stem.trim() : "";
  if (!normalized || !stem) return null;

  let createdAt: number | undefined;
  if (typeof record.createdAt === "number") {
    createdAt = record.createdAt;
  } else if (typeof record.createdAt === "string" && record.createdAt.trim() !== "") {
    const parsed = Number(record.createdAt);
    if (Number.isFinite(parsed)) {
      createdAt = parsed;
    }
  }

  let updatedAt: number | undefined;
  if (typeof record.updatedAt === "number") {
    updatedAt = record.updatedAt;
  } else if (typeof record.updatedAt === "string" && record.updatedAt.trim() !== "") {
    const parsed = Number(record.updatedAt);
    if (Number.isFinite(parsed)) {
      updatedAt = parsed;
    }
  }

  return {
    id: typeof record.id === "string" && record.id.trim() ? record.id.trim() : undefined,
    original:
      typeof record.original === "string" && record.original.trim()
        ? record.original.trim()
        : undefined,
    normalized,
    stem,
    createdAt,
    updatedAt,
  };
}

function parseJsonWordList(text: string): ImportedUnknownWord[] {
  const data = JSON.parse(text);
  if (!Array.isArray(data)) {
    throw new Error("JSON file must contain an array of words.");
  }
  const words = data
    .map((value) => toImportedWord(value))
    .filter((word): word is ImportedUnknownWord => word !== null);
  if (words.length === 0) {
    throw new Error("No valid words found in the JSON file.");
  }
  return words;
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function parseCsvWordList(text: string): ImportedUnknownWord[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length <= 1) {
    throw new Error("CSV file must include a header row and at least one word.");
  }
  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  const records: ImportedUnknownWord[] = [];

  for (let index = 1; index < lines.length; index += 1) {
    const rawLine = lines[index];
    if (!rawLine) continue;
    const values = splitCsvLine(rawLine);
    const entry: Record<string, string> = {};
    headers.forEach((header, headerIndex) => {
      entry[header] = (values[headerIndex] ?? "").trim();
    });
    const word = toImportedWord(entry);
    if (word) {
      records.push(word);
    }
  }

  if (records.length === 0) {
    throw new Error("No valid rows found in the CSV file.");
  }

  return records;
}

interface WordRowProps {
  word: UnknownWord;
  frequencyRank: number | null;
  onDelete: (id: string) => Promise<void>;
}

function WordRow({ word, frequencyRank, onDelete }: WordRowProps) {
  return (
    <tr className="hover:bg-white/5">
      <td className="px-4 py-2 font-medium">{word.original}</td>
      <td className="px-4 py-2 text-white/70">{word.normalized}</td>
      <td className="px-4 py-2 text-white/70">{word.stem}</td>
      <td className="px-4 py-2 text-right text-white/70">
        {typeof frequencyRank === "number" ? `#${frequencyRank.toLocaleString()}` : "—"}
      </td>
      <td className="px-4 py-2 text-right text-white/60">{new Date(word.updatedAt).toLocaleString()}</td>
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
    </tr>
  );
}

export default function WordsPage() {
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isLoadingRanks, setIsLoadingRanks] = useState(false);
  const [rankError, setRankError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("updatedAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [frequencyRanks, setFrequencyRanks] = useState<Map<string, number> | null>(null);
  const words = useDictionaryStore((state) => state.words);
  const initialized = useDictionaryStore((state) => state.initialized);
  const initialize = useDictionaryStore((state) => state.initialize);
  const removeWord = useDictionaryStore((state) => state.removeWord);
  const importWords = useDictionaryStore((state) => state.importWords);

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

  const handleExportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(sorted, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `unknown-words-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [sorted]);

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

  const handleImport = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setIsImporting(true);
      setImportError(null);
      setImportSuccess(null);

      try {
        const text = await file.text();
        const incoming = file.name.endsWith(".csv")
          ? parseCsvWordList(text)
          : parseJsonWordList(text);
        await importWords(incoming);
        setImportSuccess(`Imported ${incoming.length} word${incoming.length === 1 ? "" : "s"}.`);
      } catch (error) {
        setImportError(error instanceof Error ? error.message : "Failed to import words.");
      } finally {
        setIsImporting(false);
        event.target.value = "";
      }
    },
    [importWords],
  );

  if (!initialized) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Unknown Words</h2>
        <p className="text-sm text-white/60">Loading your saved vocabulary…</p>
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
            onClick={handleExportJson}
            className="rounded bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-white/20"
          >
            Export JSON
          </button>
          <button
            type="button"
            onClick={() => {
              void handleCopyWords();
            }}
            className="rounded bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-white/20"
          >
            Copy Words
          </button>
          <a
            href="https://chatgpt.com/share/69110ae1-0894-8013-ab12-c4e78af73786"
            target="_blank"
            rel="noreferrer"
            className="rounded bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-200 hover:bg-emerald-500/30"
          >
            Play with ChatGPT
          </a>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-white/20"
            disabled={isImporting}
          >
            Import List
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.csv"
            className="hidden"
            onChange={handleImport}
          />
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
          <p className="text-xs text-white/50">Export your list or prune items you no longer need.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportJson}
            className="rounded bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-white/20"
          >
            Export JSON
          </button>
          <button
            type="button"
            onClick={() => {
              void handleCopyWords();
            }}
            className="rounded bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-white/20"
          >
            Copy Words
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
            onClick={() => fileInputRef.current?.click()}
            className="rounded bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-white/20 disabled:opacity-50"
            disabled={isImporting}
          >
            {isImporting ? "Importing…" : "Import"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.csv"
            className="hidden"
            onChange={handleImport}
          />
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
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isLoadingRanks && <span>Loading frequency ranks…</span>}
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
              <th className="px-4 py-2">Normalized</th>
              <th className="px-4 py-2">Stem</th>
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
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10 text-sm">
            {sorted.map((word) => (
              <WordRow
                key={word.id}
                word={word}
                frequencyRank={ranksById.get(word.id) ?? null}
                onDelete={removeWord}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

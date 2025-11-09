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

function toImportedWord(value: unknown): ImportedUnknownWord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const normalized = typeof record.normalized === "string" ? record.normalized.trim() : "";
  const stem = typeof record.stem === "string" ? record.stem.trim() : "";
  if (!normalized || !stem) return null;

  const translation =
    typeof record.translation === "string"
      ? record.translation
      : record.translation === null
        ? null
        : undefined;
  const notes =
    typeof record.notes === "string"
      ? record.notes
      : record.notes === null
        ? null
        : undefined;

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

  const status = record.status === "known" || record.status === "learning"
    ? (record.status as UnknownWord["status"])
    : undefined;

  return {
    id: typeof record.id === "string" && record.id.trim() ? record.id.trim() : undefined,
    original:
      typeof record.original === "string" && record.original.trim()
        ? record.original.trim()
        : undefined,
    normalized,
    stem,
    translation,
    notes,
    createdAt,
    updatedAt,
    status,
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

function escapeCsv(value: string | number | undefined): string {
  if (value === undefined) return "";
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

interface WordRowProps {
  word: UnknownWord;
  onUpdate: (
    id: string,
    updates: Partial<Omit<UnknownWord, "id" | "createdAt">>,
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function WordRow({ word, onUpdate, onDelete }: WordRowProps) {
  const [translation, setTranslation] = useState<string>(word.translation ?? "");
  const [notes, setNotes] = useState<string>(word.notes ?? "");
  const [status, setStatus] = useState<UnknownWord["status"]>(word.status);

  useEffect(() => {
    setTranslation(word.translation ?? "");
  }, [word.translation, word.id]);

  useEffect(() => {
    setNotes(word.notes ?? "");
  }, [word.notes, word.id]);

  useEffect(() => {
    setStatus(word.status);
  }, [word.status, word.id]);

  const commitTranslation = useCallback(() => {
    const trimmed = translation.trim();
    const normalized = trimmed === "" ? undefined : trimmed;
    if ((normalized ?? "") === (word.translation ?? "")) return;
    void onUpdate(word.id, { translation: normalized });
  }, [onUpdate, translation, word.id, word.translation]);

  const commitNotes = useCallback(() => {
    const trimmed = notes.trim();
    const normalized = trimmed === "" ? undefined : trimmed;
    if ((normalized ?? "") === (word.notes ?? "")) return;
    void onUpdate(word.id, { notes: normalized });
  }, [notes, onUpdate, word.id, word.notes]);

  const handleStatusChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const nextStatus = event.target.value as UnknownWord["status"];
      setStatus(nextStatus);
      if (nextStatus !== word.status) {
        void onUpdate(word.id, { status: nextStatus });
      }
    },
    [onUpdate, word.id, word.status],
  );

  return (
    <tr className="hover:bg-white/5">
      <td className="px-4 py-2 font-medium">{word.original}</td>
      <td className="px-4 py-2 text-white/70">{word.normalized}</td>
      <td className="px-4 py-2 text-white/70">{word.stem}</td>
      <td className="px-4 py-2">
        <input
          value={translation}
          onChange={(event) => setTranslation(event.target.value)}
          onBlur={commitTranslation}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitTranslation();
              (event.currentTarget as HTMLInputElement).blur();
            }
          }}
          className="w-full rounded-md bg-white/10 px-2 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/60"
          placeholder="Add translation"
        />
      </td>
      <td className="px-4 py-2">
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          onBlur={commitNotes}
          rows={1}
          className="w-full resize-y rounded-md bg-white/10 px-2 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/60"
          placeholder="Add notes"
        />
      </td>
      <td className="px-4 py-2 text-right">
        <select
          value={status}
          onChange={handleStatusChange}
          className="rounded-md bg-white/10 px-2 py-1 text-xs uppercase tracking-wide text-white focus:outline-none focus:ring-2 focus:ring-white/60"
        >
          <option value="learning">Learning</option>
          <option value="known">Known</option>
        </select>
      </td>
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const words = useDictionaryStore((state) => state.words);
  const initialized = useDictionaryStore((state) => state.initialized);
  const initialize = useDictionaryStore((state) => state.initialize);
  const updateWord = useDictionaryStore((state) => state.updateWord);
  const removeWord = useDictionaryStore((state) => state.removeWord);
  const importWords = useDictionaryStore((state) => state.importWords);

  useEffect(() => {
    if (!initialized) {
      void initialize();
    }
  }, [initialized, initialize]);

  const sorted = useMemo(
    () => [...words].sort((a, b) => b.updatedAt - a.updatedAt),
    [words],
  );

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

  const handleExportCsv = useCallback(() => {
    const headers = [
      "original",
      "normalized",
      "stem",
      "translation",
      "notes",
      "status",
      "createdAt",
      "updatedAt",
      "id",
    ];
    const lines = sorted.map((word) =>
      [
        escapeCsv(word.original ?? ""),
        escapeCsv(word.normalized),
        escapeCsv(word.stem),
        escapeCsv(word.translation ?? undefined),
        escapeCsv(word.notes ?? undefined),
        escapeCsv(word.status),
        escapeCsv(word.createdAt),
        escapeCsv(word.updatedAt),
        escapeCsv(word.id),
      ].join(","),
    );
    const blob = new Blob([headers.join(",") + "\n" + lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `unknown-words-${new Date().toISOString().split("T")[0]}.csv`;
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
      console.error(error);
      setImportSuccess(null);
      setImportError("Failed to copy words to the clipboard.");
    }
  }, [setImportError, setImportSuccess, sorted]);

  const handleImport = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setIsImporting(true);
      setImportError(null);
      setImportSuccess(null);

      try {
        const text = await file.text();
        const lowerName = file.name.toLowerCase();
        const wordsToImport = lowerName.endsWith(".csv")
          ? parseCsvWordList(text)
          : parseJsonWordList(text);

        await importWords(wordsToImport);
        setImportSuccess(
          `Imported ${wordsToImport.length} word${wordsToImport.length === 1 ? "" : "s"}.`,
        );
      } catch (error) {
        setImportError(
          error instanceof Error ? error.message : "Failed to import the provided file.",
        );
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
            Copy All
          </button>
          <h1>Updated Build Test v4 — Deployed via PowerShell Script!</h1>
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
          <p className="text-xs text-white/50">Edit translations, add notes, and track review status.</p>
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
          <button
            type="button"
            onClick={handleExportCsv}
            className="rounded bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-white/20"
          >
            Export CSV
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
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/60">
        <span>{sorted.length} items</span>
        {importError ? (
          <span className="text-red-400">{importError}</span>
        ) : importSuccess ? (
          <span className="text-emerald-400">{importSuccess}</span>
        ) : null}
      </div>
      <div className="overflow-hidden rounded-lg border border-white/10">
        <table className="min-w-full divide-y divide-white/10">
          <thead className="bg-white/5 text-left text-xs uppercase tracking-wide text-white/60">
            <tr>
              <th className="px-4 py-2">Word</th>
              <th className="px-4 py-2">Normalized</th>
              <th className="px-4 py-2">Stem</th>
              <th className="px-4 py-2">Translation</th>
              <th className="px-4 py-2">Notes</th>
              <th className="px-4 py-2 text-right">Status</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10 text-sm">
            {sorted.map((word) => (
              <WordRow
                key={word.id}
                word={word}
                onUpdate={updateWord}
                onDelete={removeWord}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState, } from "react";
import { useDictionaryStore, } from "../../state/dictionaryStore";
function toImportedWord(value) {
    if (!value || typeof value !== "object")
        return null;
    const record = value;
    const normalized = typeof record.normalized === "string" ? record.normalized.trim() : "";
    const stem = typeof record.stem === "string" ? record.stem.trim() : "";
    if (!normalized || !stem)
        return null;
    const translation = typeof record.translation === "string"
        ? record.translation
        : record.translation === null
            ? null
            : undefined;
    const notes = typeof record.notes === "string"
        ? record.notes
        : record.notes === null
            ? null
            : undefined;
    let createdAt;
    if (typeof record.createdAt === "number") {
        createdAt = record.createdAt;
    }
    else if (typeof record.createdAt === "string" && record.createdAt.trim() !== "") {
        const parsed = Number(record.createdAt);
        if (Number.isFinite(parsed)) {
            createdAt = parsed;
        }
    }
    let updatedAt;
    if (typeof record.updatedAt === "number") {
        updatedAt = record.updatedAt;
    }
    else if (typeof record.updatedAt === "string" && record.updatedAt.trim() !== "") {
        const parsed = Number(record.updatedAt);
        if (Number.isFinite(parsed)) {
            updatedAt = parsed;
        }
    }
    const status = record.status === "known" || record.status === "learning"
        ? record.status
        : undefined;
    return {
        id: typeof record.id === "string" && record.id.trim() ? record.id.trim() : undefined,
        original: typeof record.original === "string" && record.original.trim()
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
function parseJsonWordList(text) {
    const data = JSON.parse(text);
    if (!Array.isArray(data)) {
        throw new Error("JSON file must contain an array of words.");
    }
    const words = data
        .map((value) => toImportedWord(value))
        .filter((word) => word !== null);
    if (words.length === 0) {
        throw new Error("No valid words found in the JSON file.");
    }
    return words;
}
function splitCsvLine(line) {
    const values = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (char === "\"") {
            if (inQuotes && line[i + 1] === "\"") {
                current += "\"";
                i += 1;
            }
            else {
                inQuotes = !inQuotes;
            }
        }
        else if (char === "," && !inQuotes) {
            values.push(current);
            current = "";
        }
        else {
            current += char;
        }
    }
    values.push(current);
    return values;
}
function parseCsvWordList(text) {
    const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    if (lines.length <= 1) {
        throw new Error("CSV file must include a header row and at least one word.");
    }
    const headers = splitCsvLine(lines[0]).map((header) => header.trim());
    const records = [];
    for (let index = 1; index < lines.length; index += 1) {
        const rawLine = lines[index];
        if (!rawLine)
            continue;
        const values = splitCsvLine(rawLine);
        const entry = {};
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
function escapeCsv(value) {
    if (value === undefined)
        return "";
    const text = String(value);
    if (/[",\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}
function WordRow({ word, onUpdate, onDelete }) {
    const [translation, setTranslation] = useState(word.translation ?? "");
    const [notes, setNotes] = useState(word.notes ?? "");
    const [status, setStatus] = useState(word.status);
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
        if ((normalized ?? "") === (word.translation ?? ""))
            return;
        void onUpdate(word.id, { translation: normalized });
    }, [onUpdate, translation, word.id, word.translation]);
    const commitNotes = useCallback(() => {
        const trimmed = notes.trim();
        const normalized = trimmed === "" ? undefined : trimmed;
        if ((normalized ?? "") === (word.notes ?? ""))
            return;
        void onUpdate(word.id, { notes: normalized });
    }, [notes, onUpdate, word.id, word.notes]);
    const handleStatusChange = useCallback((event) => {
        const nextStatus = event.target.value;
        setStatus(nextStatus);
        if (nextStatus !== word.status) {
            void onUpdate(word.id, { status: nextStatus });
        }
    }, [onUpdate, word.id, word.status]);
    return (_jsxs("tr", { className: "hover:bg-white/5", children: [_jsx("td", { className: "px-4 py-2 font-medium", children: word.original }), _jsx("td", { className: "px-4 py-2 text-white/70", children: word.normalized }), _jsx("td", { className: "px-4 py-2 text-white/70", children: word.stem }), _jsx("td", { className: "px-4 py-2", children: _jsx("input", { value: translation, onChange: (event) => setTranslation(event.target.value), onBlur: commitTranslation, onKeyDown: (event) => {
                        if (event.key === "Enter") {
                            event.preventDefault();
                            commitTranslation();
                            event.currentTarget.blur();
                        }
                    }, className: "w-full rounded-md bg-white/10 px-2 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/60", placeholder: "Add translation" }) }), _jsx("td", { className: "px-4 py-2", children: _jsx("textarea", { value: notes, onChange: (event) => setNotes(event.target.value), onBlur: commitNotes, rows: 1, className: "w-full resize-y rounded-md bg-white/10 px-2 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/60", placeholder: "Add notes" }) }), _jsx("td", { className: "px-4 py-2 text-right", children: _jsxs("select", { value: status, onChange: handleStatusChange, className: "rounded-md bg-white/10 px-2 py-1 text-xs uppercase tracking-wide text-white focus:outline-none focus:ring-2 focus:ring-white/60", children: [_jsx("option", { value: "learning", children: "Learning" }), _jsx("option", { value: "known", children: "Known" })] }) }), _jsx("td", { className: "px-4 py-2 text-right", children: _jsx("button", { type: "button", className: "rounded border border-red-500/40 px-2 py-1 text-xs font-medium text-red-300 hover:bg-red-500/10", onClick: () => {
                        void onDelete(word.id);
                    }, children: "Delete" }) })] }));
}
export default function WordsPage() {
    const [importError, setImportError] = useState(null);
    const [importSuccess, setImportSuccess] = useState(null);
    const [isImporting, setIsImporting] = useState(false);
    const fileInputRef = useRef(null);
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
    const sorted = useMemo(() => [...words].sort((a, b) => b.updatedAt - a.updatedAt), [words]);
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
        const lines = sorted.map((word) => [
            escapeCsv(word.original ?? ""),
            escapeCsv(word.normalized),
            escapeCsv(word.stem),
            escapeCsv(word.translation ?? undefined),
            escapeCsv(word.notes ?? undefined),
            escapeCsv(word.status),
            escapeCsv(word.createdAt),
            escapeCsv(word.updatedAt),
            escapeCsv(word.id),
        ].join(","));
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
            }
            else {
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
            setImportSuccess(`Copied ${sorted.length} word${sorted.length === 1 ? "" : "s"} to the clipboard.`);
        }
        catch (error) {
            console.error(error);
            setImportSuccess(null);
            setImportError("Failed to copy words to the clipboard.");
        }
    }, [setImportError, setImportSuccess, sorted]);
    const handleImport = useCallback(async (event) => {
        const file = event.target.files?.[0];
        if (!file)
            return;
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
            setImportSuccess(`Imported ${wordsToImport.length} word${wordsToImport.length === 1 ? "" : "s"}.`);
        }
        catch (error) {
            setImportError(error instanceof Error ? error.message : "Failed to import the provided file.");
        }
        finally {
            setIsImporting(false);
            event.target.value = "";
        }
    }, [importWords]);
    if (!initialized) {
        return (_jsxs("div", { className: "space-y-4", children: [_jsx("h2", { className: "text-xl font-semibold", children: "Unknown Words" }), _jsx("p", { className: "text-sm text-white/60", children: "Loading your saved vocabulary\u2026" })] }));
    }
    if (sorted.length === 0) {
        return (_jsxs("div", { className: "space-y-4", children: [_jsx("h2", { className: "text-xl font-semibold", children: "Unknown Words" }), _jsx("p", { className: "text-sm text-white/60", children: "Click a word in the player to add it to your learning list." }), _jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx("button", { type: "button", onClick: handleExportJson, className: "rounded bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-white/20", children: "Export JSON" }), _jsx("button", { type: "button", onClick: () => {
                                void handleCopyWords();
                            }, className: "rounded bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-white/20", children: "Copy Words" }), _jsx("a", { href: "https://chatgpt.com/share/6907d519-a7cc-8013-ad9b-86187c2608de", target: "_blank", rel: "noreferrer", className: "rounded bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-200 hover:bg-emerald-500/30", children: "Play with ChatGPT" }), _jsx("button", { type: "button", onClick: () => fileInputRef.current?.click(), className: "rounded bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-white/20", disabled: isImporting, children: "Import List" }), _jsx("input", { ref: fileInputRef, type: "file", accept: ".json,.csv", className: "hidden", onChange: handleImport })] }), importError && _jsx("p", { className: "text-xs text-red-400", children: importError }), importSuccess && _jsx("p", { className: "text-xs text-emerald-400", children: importSuccess })] }));
    }
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-4", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-xl font-semibold", children: "Unknown Words" }), _jsx("p", { className: "text-xs text-white/50", children: "Edit translations, add notes, and track review status." })] }), _jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx("button", { type: "button", onClick: handleExportJson, className: "rounded bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-white/20", children: "Export JSON" }), _jsx("button", { type: "button", onClick: () => {
                                    void handleCopyWords();
                                }, className: "rounded bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-white/20", children: "Copy Words" }), _jsx("button", { type: "button", onClick: handleExportCsv, className: "rounded bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-white/20", children: "Export CSV" }), _jsx("a", { href: "https://chatgpt.com/share/6907d519-a7cc-8013-ad9b-86187c2608de", target: "_blank", rel: "noreferrer", className: "rounded bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-200 hover:bg-emerald-500/30", children: "Play with ChatGPT" }), _jsx("button", { type: "button", onClick: () => fileInputRef.current?.click(), className: "rounded bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-white/20 disabled:opacity-50", disabled: isImporting, children: isImporting ? "Importing…" : "Import" }), _jsx("input", { ref: fileInputRef, type: "file", accept: ".json,.csv", className: "hidden", onChange: handleImport })] })] }), _jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2 text-xs text-white/60", children: [_jsxs("span", { children: [sorted.length, " items"] }), importError ? (_jsx("span", { className: "text-red-400", children: importError })) : importSuccess ? (_jsx("span", { className: "text-emerald-400", children: importSuccess })) : null] }), _jsx("div", { className: "overflow-hidden rounded-lg border border-white/10", children: _jsxs("table", { className: "min-w-full divide-y divide-white/10", children: [_jsx("thead", { className: "bg-white/5 text-left text-xs uppercase tracking-wide text-white/60", children: _jsxs("tr", { children: [_jsx("th", { className: "px-4 py-2", children: "Word" }), _jsx("th", { className: "px-4 py-2", children: "Normalized" }), _jsx("th", { className: "px-4 py-2", children: "Stem" }), _jsx("th", { className: "px-4 py-2", children: "Translation" }), _jsx("th", { className: "px-4 py-2", children: "Notes" }), _jsx("th", { className: "px-4 py-2 text-right", children: "Status" }), _jsx("th", { className: "px-4 py-2 text-right", children: "Actions" })] }) }), _jsx("tbody", { className: "divide-y divide-white/10 text-sm", children: sorted.map((word) => (_jsx(WordRow, { word: word, onUpdate: updateWord, onDelete: removeWord }, word.id))) })] }) })] }));
}
//# sourceMappingURL=WordsPage.js.map
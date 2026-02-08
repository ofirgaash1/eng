import { ChangeEvent, useEffect, useRef, useState } from "react";
import { exportAllData, importAllData, summarizeBackup } from "../../data/backupRepo";
import { useDictionaryStore } from "../../state/dictionaryStore";
import { usePrefsStore } from "../../state/prefsStore";

type ImportProgressState = {
  percent: number;
  stage: string;
  fileName?: string;
  fileIndex?: number;
  totalFiles?: number;
};

export default function SettingsPage() {
  const subtitleStyle = usePrefsStore((state) => state.prefs.subtitleStyle);
  const highlightColors = usePrefsStore((state) => state.prefs.highlightColors);
  const mediaLibrary = usePrefsStore((state) => state.prefs.mediaLibrary);
  const updateStyle = usePrefsStore((state) => state.updateSubtitleStyle);
  const updateHighlights = usePrefsStore((state) => state.updateHighlightColors);
  const setMediaLibrary = usePrefsStore((state) => state.setMediaLibrary);
  const initialized = usePrefsStore((state) => state.initialized);
  const initialize = usePrefsStore((state) => state.initialize);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferSuccess, setTransferSuccess] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgressState | null>(null);
  const [importElapsed, setImportElapsed] = useState(0);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!initialized) {
      void initialize();
    }
  }, [initialized, initialize]);

  useEffect(() => {
    if (!isImporting) {
      setImportElapsed(0);
      return;
    }
    const start = Date.now();
    setImportElapsed(0);
    const interval = window.setInterval(() => {
      setImportElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => {
      window.clearInterval(interval);
    };
  }, [isImporting]);

  const handleNumberChange = (
    event: ChangeEvent<HTMLInputElement>,
    key: "fontSizePx" | "secondaryFontSizePx" | "fontWeight" | "lineHeight"
  ) => {
    const value = Number(event.target.value);
    if (Number.isFinite(value)) {
      void updateStyle({ [key]: key === "lineHeight" ? Number(value.toFixed(2)) : value });
    }
  };

  const directoryPickerSupported = typeof window !== "undefined" && "showDirectoryPicker" in window;

  const handleChooseLibrary = async () => {
    setLibraryError(null);
    if (!directoryPickerSupported) {
      setLibraryError("Your browser does not support choosing a folder");
      return;
    }
    try {
      const handle = await (window as typeof window & {
        showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
      }).showDirectoryPicker?.();
      if (!handle) return;
      const requestPermission = (handle as FileSystemDirectoryHandle & {
        requestPermission?: (options: unknown) => Promise<PermissionState>;
      }).requestPermission;
      if (requestPermission) {
        const permission = await requestPermission.call(handle, { mode: "read" });
        if (permission === "denied") {
          setLibraryError("Folder access was denied. Please allow access to play quotes.");
          return;
        }
      }
      await setMediaLibrary({ handle, label: handle.name, lastPromptedAt: Date.now() });
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : "Unable to pick folder.");
    }
  };

  const handleClearLibrary = async () => {
    setLibraryError(null);
    await setMediaLibrary(undefined);
  };

  const handleExportEverything = async () => {
    setTransferError(null);
    setTransferSuccess(null);
    setIsExporting(true);
    try {
      const { payload, counts } = await exportAllData();
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `subtitle-word-tracker-backup-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setTransferSuccess(
        `Exported ${counts.words} word${counts.words === 1 ? "" : "s"} and ${counts.subtitleFiles} subtitle file${counts.subtitleFiles === 1 ? "" : "s"}.`
      );
    } catch (error) {
      setTransferSuccess(null);
      setTransferError(error instanceof Error ? error.message : "Unable to export data.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportEverything = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    setTransferError(null);
    setTransferSuccess(null);
    setIsImporting(true);
    try {
      const totalFiles = files.length;
      const totalProgressShare = 100 / totalFiles;
      let counts: Awaited<ReturnType<typeof importAllData>> | null = null;

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const fileLabel = `${index + 1}/${totalFiles}`;
        const base = index * totalProgressShare;
        const toOverallPercent = (filePercent: number) =>
          Math.min(100, Math.max(0, base + (filePercent / 100) * totalProgressShare));

        setImportProgress({
          percent: toOverallPercent(5),
          stage: "Reading file",
          fileName: file.name,
          fileIndex: index + 1,
          totalFiles,
        });
        try {
          const text = await file.text();
          setImportProgress({
            percent: toOverallPercent(15),
            stage: "Parsing backup",
            fileName: file.name,
            fileIndex: index + 1,
            totalFiles,
          });
          const payload = JSON.parse(text);
          const summary = summarizeBackup(payload);
          setImportProgress({
            percent: toOverallPercent(15),
            stage: `Parsed backup (${summary.words} words, ${summary.subtitleFiles} files)`,
            fileName: file.name,
            fileIndex: index + 1,
            totalFiles,
          });
          counts = await importAllData(payload, {
            onProgress: (progress) => {
              setImportProgress({
                percent: toOverallPercent(progress.percent),
                stage: progress.stage,
                fileName: file.name,
                fileIndex: index + 1,
                totalFiles,
              });
            },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unable to import data.";
          throw new Error(`File ${fileLabel} (${file.name}) failed: ${message}`);
        }
        setImportProgress({
          percent: toOverallPercent(100),
          stage: totalFiles > 1 ? `Finished file ${fileLabel}` : "Finished",
          fileName: file.name,
          fileIndex: index + 1,
          totalFiles,
        });
      }

      usePrefsStore.setState({ initialized: false });
      void usePrefsStore.getState().initialize();
      useDictionaryStore.setState({ initialized: false });
      void useDictionaryStore.getState().initialize();
      if (!counts) {
        throw new Error("Import finished with no result.");
      }
      setTransferSuccess(
        `Imported ${files.length} backup file${files.length === 1 ? "" : "s"} and merged everything. You can now delete old backup files and export a single fresh JSON. Current totals: ${counts.words} word${counts.words === 1 ? "" : "s"} and ${counts.subtitleFiles} subtitle file${counts.subtitleFiles === 1 ? "" : "s"}.`
      );
    } catch (error) {
      setTransferSuccess(null);
      setTransferError(error instanceof Error ? error.message : "Unable to import data.");
    } finally {
      setIsImporting(false);
      setImportProgress(null);
      event.target.value = "";
    }
  };

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Subtitle Appearance</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-white/70">Font family</span>
            <input
              type="text"
              value={subtitleStyle.fontFamily}
              onChange={(event) => void updateStyle({ fontFamily: event.target.value })}
              className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-white focus:border-white/40 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-white/70">Font size (px)</span>
            <input
              type="number"
              min={16}
              max={96}
              value={subtitleStyle.fontSizePx}
              onChange={(event) => handleNumberChange(event, "fontSizePx")}
              className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-white focus:border-white/40 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-white/70">Second subtitle font size (px)</span>
            <input
              type="number"
              min={16}
              max={96}
              value={
                subtitleStyle.useMainForSecondaryFontSize
                  ? subtitleStyle.fontSizePx
                  : subtitleStyle.secondaryFontSizePx
              }
              onChange={(event) => handleNumberChange(event, "secondaryFontSizePx")}
              disabled={subtitleStyle.useMainForSecondaryFontSize}
              className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-white focus:border-white/40 focus:outline-none disabled:text-white/40"
            />
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={subtitleStyle.useMainForSecondaryFontSize}
              onChange={(event) =>
                void updateStyle({ useMainForSecondaryFontSize: event.target.checked })
              }
              className="h-4 w-4 rounded border-white/20 bg-black/60"
            />
            <span className="text-white/70">Same as main</span>
          </label>
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-white/70">Font weight</span>
            <input
              type="number"
              min={300}
              max={900}
              step={100}
              value={subtitleStyle.fontWeight}
              onChange={(event) => handleNumberChange(event, "fontWeight")}
              className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-white focus:border-white/40 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-white/70">Line height</span>
            <input
              type="number"
              min={1}
              max={2}
              step={0.05}
              value={subtitleStyle.lineHeight}
              onChange={(event) => handleNumberChange(event, "lineHeight")}
              className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-white focus:border-white/40 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-white/70">Text color</span>
            <input
              type="color"
              value={subtitleStyle.color}
              onChange={(event) => void updateStyle({ color: event.target.value })}
              className="h-10 w-full cursor-pointer rounded-md border border-white/10 bg-black/40"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-white/70">Background</span>
            <input
              type="text"
              value={subtitleStyle.bgColor}
              onChange={(event) => void updateStyle({ bgColor: event.target.value })}
              className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-white focus:border-white/40 focus:outline-none"
              placeholder="rgba(0,0,0,0.35)"
            />
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={subtitleStyle.outline}
              onChange={(event) => void updateStyle({ outline: event.target.checked })}
              className="h-4 w-4 rounded border-white/20 bg-black/60"
            />
            <span className="text-white/70">Outline text</span>
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={subtitleStyle.shadow}
              onChange={(event) => void updateStyle({ shadow: event.target.checked })}
              className="h-4 w-4 rounded border-white/20 bg-black/60"
            />
            <span className="text-white/70">Drop shadow</span>
          </label>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Highlight Colors</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-white/70">Exact match</span>
            <input
              type="color"
              value={highlightColors.exact}
              onChange={(event) => void updateHighlights({ exact: event.target.value })}
              className="h-10 w-full cursor-pointer rounded-md border border-white/10 bg-black/40"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-white/70">Variant match</span>
            <input
              type="color"
              value={highlightColors.variant}
              onChange={(event) => void updateHighlights({ variant: event.target.value })}
              className="h-10 w-full cursor-pointer rounded-md border border-white/10 bg-black/40"
            />
          </label>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Media Library</h2>
        <p className="text-sm text-white/70">
          Pick the root folder that contains your shows/movies. This enables future quote-level playback by
          searching for matching video files alongside your subtitles.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleChooseLibrary}
            className="rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm font-medium text-white transition hover:border-white/30 hover:bg-white/20 focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/40"
          >
            Choose folder
          </button>
          <button
            type="button"
            onClick={handleClearLibrary}
            disabled={!mediaLibrary}
            className="rounded-md border border-white/10 px-3 py-2 text-sm text-white/70 transition hover:border-white/30 hover:bg-white/10 focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:border-white/5 disabled:text-white/40"
          >
            Clear selection
          </button>
          {!directoryPickerSupported && (
            <span className="text-xs text-amber-300">Folder selection requires a Chromium-based browser.</span>
          )}
        </div>
        {mediaLibrary ? (
          <p className="text-sm text-white/70">
            Selected: <span className="font-semibold text-white">{mediaLibrary.label ?? "Folder"}</span>
          </p>
        ) : (
          <p className="text-sm text-white/60">No folder selected yet.</p>
        )}
        {libraryError && <p className="text-sm text-red-400">{libraryError}</p>}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Data Transfer</h2>
        <p className="text-sm text-white/70">
          Export a full backup of your words, subtitles database, preferences, and last session.
          Import accepts one or many JSON backups and merges each one in order. Newer timestamps win
          for words and subtitle files, and prefs from backups override local settings. Media library
          folder access cannot be exported; reselect it after import.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExportEverything}
            disabled={isExporting}
            className="rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm font-medium text-white transition hover:border-white/30 hover:bg-white/20 focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/40"
          >
            {isExporting ? "Exporting..." : "Export everything"}
          </button>
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            disabled={isImporting}
            className="rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm font-medium text-white transition hover:border-white/30 hover:bg-white/20 focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/40"
          >
            {isImporting ? "Importing..." : "Import everything"}
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json"
            multiple
            className="hidden"
            onChange={handleImportEverything}
          />
        </div>
        {isImporting && importProgress ? (
          <div className="mt-2 w-full">
            <div className="h-1.5 w-full overflow-hidden rounded bg-white/10">
              <div
                className="h-full bg-emerald-400 transition-all duration-300"
                style={{ width: `${importProgress.percent}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-white/60">
              Importing{importProgress.fileIndex && importProgress.totalFiles
                ? ` ${importProgress.fileIndex}/${importProgress.totalFiles}`
                : ""}
              : {importProgress.stage}
              {importProgress.fileName ? ` (${importProgress.fileName})` : ""} (
              {Math.round(importProgress.percent)}%, {importElapsed}s)
            </p>
          </div>
        ) : null}
        {transferError && <p className="text-sm text-red-400">{transferError}</p>}
        {transferSuccess && <p className="text-sm text-emerald-400">{transferSuccess}</p>}
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Preview</h2>
        <div
          className="rounded-lg border border-white/10 bg-black/60 p-4 text-center text-lg"
          style={{
            fontFamily: subtitleStyle.fontFamily,
            fontSize: subtitleStyle.fontSizePx,
            fontWeight: subtitleStyle.fontWeight,
            lineHeight: subtitleStyle.lineHeight,
            color: subtitleStyle.color,
            textShadow: subtitleStyle.shadow ? "0 2px 8px rgba(0,0,0,0.8)" : "none",
            WebkitTextStroke: subtitleStyle.outline ? "1px rgba(0,0,0,0.9)" : "0",
            background: subtitleStyle.bgColor,
          }}
        >
          Subtitle preview with <span style={{ background: highlightColors.exact }}>exact</span> and
          <span style={{ background: highlightColors.variant, marginLeft: 8 }}>variant</span> highlights.
        </div>
      </section>
    </div>
  );
}

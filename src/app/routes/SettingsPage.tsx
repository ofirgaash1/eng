import { ChangeEvent, useEffect, useState } from "react";
import { usePrefsStore } from "../../state/prefsStore";

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

  useEffect(() => {
    if (!initialized) {
      void initialize();
    }
  }, [initialized, initialize]);

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
              value={subtitleStyle.secondaryFontSizePx}
              onChange={(event) => handleNumberChange(event, "secondaryFontSizePx")}
              className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-white focus:border-white/40 focus:outline-none"
            />
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

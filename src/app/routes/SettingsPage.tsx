import { ChangeEvent } from "react";
import { usePrefsStore } from "../../state/prefsStore";

export default function SettingsPage() {
  const subtitleStyle = usePrefsStore((state) => state.prefs.subtitleStyle);
  const highlightColors = usePrefsStore((state) => state.prefs.highlightColors);
  const updateStyle = usePrefsStore((state) => state.updateSubtitleStyle);
  const updateHighlights = usePrefsStore((state) => state.updateHighlightColors);

  const handleNumberChange = (
    event: ChangeEvent<HTMLInputElement>,
    key: "fontSizePx" | "fontWeight" | "lineHeight"
  ) => {
    const value = Number(event.target.value);
    if (Number.isFinite(value)) {
      updateStyle({ [key]: key === "lineHeight" ? Number(value.toFixed(2)) : value });
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
              onChange={(event) => updateStyle({ fontFamily: event.target.value })}
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
              onChange={(event) => updateStyle({ color: event.target.value })}
              className="h-10 w-full cursor-pointer rounded-md border border-white/10 bg-black/40"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-white/70">Background</span>
            <input
              type="text"
              value={subtitleStyle.bgColor}
              onChange={(event) => updateStyle({ bgColor: event.target.value })}
              className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-white focus:border-white/40 focus:outline-none"
              placeholder="rgba(0,0,0,0.35)"
            />
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={subtitleStyle.outline}
              onChange={(event) => updateStyle({ outline: event.target.checked })}
              className="h-4 w-4 rounded border-white/20 bg-black/60"
            />
            <span className="text-white/70">Outline text</span>
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={subtitleStyle.shadow}
              onChange={(event) => updateStyle({ shadow: event.target.checked })}
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
              onChange={(event) => updateHighlights({ exact: event.target.value })}
              className="h-10 w-full cursor-pointer rounded-md border border-white/10 bg-black/40"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-white/70">Variant match</span>
            <input
              type="color"
              value={highlightColors.variant}
              onChange={(event) => updateHighlights({ variant: event.target.value })}
              className="h-10 w-full cursor-pointer rounded-md border border-white/10 bg-black/40"
            />
          </label>
        </div>
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

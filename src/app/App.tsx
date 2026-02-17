import { useEffect, useState } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import PlayerPage from "./routes/PlayerPage";
import WordsPage from "./routes/WordsPage";
import QuotesPage from "./routes/QuotesPage";
import SettingsPage from "./routes/SettingsPage";
import StatsPage from "./routes/StatsPage";
import VlsubPage from "./routes/VlsubPage";
import HelpPage from "./routes/HelpPage";
import { usePrefsStore } from "../state/prefsStore";
import { dismissDbError, subscribeDbErrors, type DbErrorEvent } from "../data/dbErrorReporter";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
    isActive
      ? "bg-white/10 text-white"
      : "text-white/70 hover:text-white hover:bg-white/5"
  }`;



function DbErrorToasts() {
  const [errors, setErrors] = useState<DbErrorEvent[]>([]);

  useEffect(() => subscribeDbErrors(setErrors), []);

  if (errors.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[1000] flex w-[min(28rem,calc(100vw-2rem))] flex-col gap-2">
      {errors.map((error) => {
        const payload = [
          `Context: ${error.context}`,
          `Message: ${error.message}`,
          `Time: ${new Date(error.timestamp).toISOString()}`,
          error.stack ? `Stack:
${error.stack}` : undefined,
        ]
          .filter(Boolean)
          .join("\n\n");
        return (
          <div key={error.id} className="rounded-lg border border-red-400/40 bg-slate-950/95 p-3 text-xs text-white shadow-xl">
            <div className="font-semibold text-red-200">IndexedDB error</div>
            <div className="mt-1 text-white/80">{error.context}: {error.message}</div>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                className="rounded border border-white/20 px-2 py-1 text-[11px] text-white/90 hover:bg-white/10"
                onClick={() => {
                  void navigator.clipboard?.writeText(payload);
                }}
              >
                Copy
              </button>
              <button
                type="button"
                className="rounded border border-white/10 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10"
                onClick={() => dismissDbError(error.id)}
              >
                Dismiss
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
export default function App() {
  const location = useLocation();
  const isPlayerRoute = location.pathname === "/" || location.pathname === "";
  const subtitleStyle = usePrefsStore((state) => state.prefs.subtitleStyle);
  const highlightColors = usePrefsStore((state) => state.prefs.highlightColors);
  const initializePrefs = usePrefsStore((state) => state.initialize);
  const prefsReady = usePrefsStore((state) => state.initialized);

  useEffect(() => {
    if (!prefsReady) {
      void initializePrefs();
    }
  }, [prefsReady, initializePrefs]);

  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty("--subtitle-font-family", subtitleStyle.fontFamily);
    root.setProperty("--subtitle-font-size", `${subtitleStyle.fontSizePx}px`);
    const secondarySize = subtitleStyle.useMainForSecondaryFontSize
      ? subtitleStyle.fontSizePx
      : subtitleStyle.secondaryFontSizePx;
    root.setProperty("--subtitle-secondary-font-size", `${secondarySize}px`);
    root.setProperty("--subtitle-font-weight", `${subtitleStyle.fontWeight}`);
    root.setProperty("--subtitle-color", subtitleStyle.color);
    root.setProperty("--subtitle-bg", subtitleStyle.bgColor);
    root.setProperty("--subtitle-line-height", `${subtitleStyle.lineHeight}`);
    root.setProperty("--subtitle-outline", subtitleStyle.outline ? "1" : "0");
    root.setProperty("--subtitle-shadow", subtitleStyle.shadow ? "1" : "0");
    root.setProperty("--highlight-exact", highlightColors.exact);
    root.setProperty("--highlight-variant", highlightColors.variant);
  }, [subtitleStyle, highlightColors]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-semibold">Subtitle Word Tracker</h1>
          <nav className="flex gap-2">
            <NavLink to="/" className={navLinkClass} end>
              Player
            </NavLink>
            <NavLink to="/words" className={navLinkClass}>
              Words
            </NavLink>
            <NavLink to="/quotes" className={navLinkClass}>
              Quotes
            </NavLink>
            <NavLink to="/stats" className={navLinkClass}>
              Stats
            </NavLink>
            <NavLink to="/settings" className={navLinkClass}>
              Settings
            </NavLink>
            <NavLink to="/vlsub" className={navLinkClass}>
              Find Subs
            </NavLink>
            <NavLink to="/help" className={navLinkClass}>
              ?
            </NavLink>
          </nav>
        </header>
        <main className="flex-1 rounded-lg border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur">
          <div className={isPlayerRoute ? "" : "hidden"} aria-hidden={!isPlayerRoute}>
            <PlayerPage isActive={isPlayerRoute} />
          </div>
          <Routes>
            <Route path="/" element={<div />} />
            <Route path="/words" element={<WordsPage />} />
            <Route path="/quotes" element={<QuotesPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/vlsub" element={<VlsubPage />} />
            <Route path="/help" element={<HelpPage />} />
            <Route path="*" element={<PlayerPage />} />
          </Routes>
        </main>
        <footer className="text-xs text-white/40">
          Local-first learning tool for movie subtitles.
        </footer>
      </div>
      <DbErrorToasts />
    </div>
  );
}

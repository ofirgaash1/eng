import { useEffect } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import PlayerPage from "./routes/PlayerPage";
import WordsPage from "./routes/WordsPage";
import QuotesPage from "./routes/QuotesPage";
import SettingsPage from "./routes/SettingsPage";
import StatsPage from "./routes/StatsPage";
import VlsubPage from "./routes/VlsubPage";
import { usePrefsStore } from "../state/prefsStore";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
    isActive
      ? "bg-white/10 text-white"
      : "text-white/70 hover:text-white hover:bg-white/5"
  }`;

export default function App() {
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
    root.setProperty("--subtitle-secondary-font-size", `${subtitleStyle.secondaryFontSizePx}px`);
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
          </nav>
        </header>
        <main className="flex-1 rounded-lg border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur">
          <Routes>
            <Route path="/" element={<PlayerPage />} />
            <Route path="/words" element={<WordsPage />} />
            <Route path="/quotes" element={<QuotesPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/vlsub" element={<VlsubPage />} />
            <Route path="*" element={<PlayerPage />} />
          </Routes>
        </main>
        <footer className="text-xs text-white/40">
          Local-first learning tool for movie subtitles.
        </footer>
      </div>
    </div>
  );
}

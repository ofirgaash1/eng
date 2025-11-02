import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import PlayerPage from "./routes/PlayerPage";
import WordsPage from "./routes/WordsPage";
import QuotesPage from "./routes/QuotesPage";
import SettingsPage from "./routes/SettingsPage";
import { usePrefsStore } from "../state/prefsStore";
const navLinkClass = ({ isActive }) => `px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive
    ? "bg-white/10 text-white"
    : "text-white/70 hover:text-white hover:bg-white/5"}`;
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
        root.setProperty("--subtitle-font-weight", `${subtitleStyle.fontWeight}`);
        root.setProperty("--subtitle-color", subtitleStyle.color);
        root.setProperty("--subtitle-bg", subtitleStyle.bgColor);
        root.setProperty("--subtitle-line-height", `${subtitleStyle.lineHeight}`);
        root.setProperty("--subtitle-outline", subtitleStyle.outline ? "1" : "0");
        root.setProperty("--subtitle-shadow", subtitleStyle.shadow ? "1" : "0");
        root.setProperty("--highlight-exact", highlightColors.exact);
        root.setProperty("--highlight-variant", highlightColors.variant);
    }, [subtitleStyle, highlightColors]);
    return (_jsx("div", { className: "min-h-screen bg-background text-foreground", children: _jsxs("div", { className: "mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6", children: [_jsxs("header", { className: "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between", children: [_jsx("h1", { className: "text-2xl font-semibold", children: "Subtitle Word Tracker" }), _jsxs("nav", { className: "flex gap-2", children: [_jsx(NavLink, { to: "/", className: navLinkClass, end: true, children: "Player" }), _jsx(NavLink, { to: "/words", className: navLinkClass, children: "Words" }), _jsx(NavLink, { to: "/quotes", className: navLinkClass, children: "Quotes" }), _jsx(NavLink, { to: "/settings", className: navLinkClass, children: "Settings" })] })] }), _jsx("main", { className: "flex-1 rounded-lg border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur", children: _jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(PlayerPage, {}) }), _jsx(Route, { path: "/words", element: _jsx(WordsPage, {}) }), _jsx(Route, { path: "/quotes", element: _jsx(QuotesPage, {}) }), _jsx(Route, { path: "/settings", element: _jsx(SettingsPage, {}) }), _jsx(Route, { path: "*", element: _jsx(PlayerPage, {}) })] }) }), _jsx("footer", { className: "text-xs text-white/40", children: "Local-first learning tool for movie subtitles." })] }) }));
}
//# sourceMappingURL=App.js.map
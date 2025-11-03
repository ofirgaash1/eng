import { create } from "zustand";
import { getPrefs, savePrefs } from "../data/prefsRepo";
const defaultPrefs = {
    subtitleStyle: {
        fontFamily: "Inter",
        fontSizePx: 42,
        fontWeight: 600,
        color: "#ffffff",
        outline: true,
        shadow: true,
        bgColor: "rgba(0, 0, 0, 0.35)",
        lineHeight: 1.35,
    },
    highlightColors: {
        exact: "#10b981",
        variant: "#f97316",
    },
};
export const usePrefsStore = create((set, get) => ({
    prefs: defaultPrefs,
    initialized: false,
    initialize: async () => {
        if (get().initialized)
            return;
        const stored = await getPrefs();
        set({ prefs: stored ?? defaultPrefs, initialized: true });
    },
    updateSubtitleStyle: async (updates) => {
        const next = {
            ...get().prefs,
            subtitleStyle: { ...get().prefs.subtitleStyle, ...updates },
        };
        set({ prefs: next });
        await savePrefs(next);
    },
    updateHighlightColors: async (updates) => {
        const next = {
            ...get().prefs,
            highlightColors: { ...get().prefs.highlightColors, ...updates },
        };
        set({ prefs: next });
        await savePrefs(next);
    },
    setLastOpened: async (input) => {
        const next = {
            ...get().prefs,
            lastOpened: input,
        };
        set({ prefs: next });
        await savePrefs(next);
    },
}));
//# sourceMappingURL=prefsStore.js.map
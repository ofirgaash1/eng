import { create } from "zustand";
import type { UserPrefs } from "../core/types";
import { getPrefs, savePrefs } from "../data/prefsRepo";

interface PrefsState {
  prefs: UserPrefs;
  initialized: boolean;
  initialize: () => Promise<void>;
  updateSubtitleStyle: (updates: Partial<UserPrefs["subtitleStyle"]>) => Promise<void>;
  updateHighlightColors: (updates: Partial<UserPrefs["highlightColors"]>) => Promise<void>;
}

const defaultPrefs: UserPrefs = {
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

export const usePrefsStore = create<PrefsState>((set, get) => ({
  prefs: defaultPrefs,
  initialized: false,
  initialize: async () => {
    if (get().initialized) return;
    const stored = await getPrefs();
    set({ prefs: stored ?? defaultPrefs, initialized: true });
  },
  updateSubtitleStyle: async (updates) => {
    const next: UserPrefs = {
      ...get().prefs,
      subtitleStyle: { ...get().prefs.subtitleStyle, ...updates },
    };
    set({ prefs: next });
    await savePrefs(next);
  },
  updateHighlightColors: async (updates) => {
    const next: UserPrefs = {
      ...get().prefs,
      highlightColors: { ...get().prefs.highlightColors, ...updates },
    };
    set({ prefs: next });
    await savePrefs(next);
  },
}));

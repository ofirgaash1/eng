import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserPrefs } from "../core/types";

interface PrefsState {
  prefs: UserPrefs;
  updateSubtitleStyle: (updates: Partial<UserPrefs["subtitleStyle"]>) => void;
  updateHighlightColors: (updates: Partial<UserPrefs["highlightColors"]>) => void;
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

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      prefs: defaultPrefs,
      updateSubtitleStyle: (updates) =>
        set((state) => ({
          prefs: {
            ...state.prefs,
            subtitleStyle: { ...state.prefs.subtitleStyle, ...updates },
          },
        })),
      updateHighlightColors: (updates) =>
        set((state) => ({
          prefs: {
            ...state.prefs,
            highlightColors: { ...state.prefs.highlightColors, ...updates },
          },
        })),
    }),
    {
      name: "prefs-store",
      version: 1,
    }
  )
);

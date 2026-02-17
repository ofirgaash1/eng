import { useCallback, useEffect, useMemo, useState } from "react";
import type { UserPrefs } from "../../../core/types";
import { handlePlayerKeyDown } from "../playerShortcuts";

type ShortcutAction = keyof NonNullable<UserPrefs["playerShortcuts"]>;

const INTERACTIVE_TAGS = ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "SUMMARY"];

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined") return false;
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return INTERACTIVE_TAGS.includes(target.tagName);
}

function formatShortcutLabel(event: KeyboardEvent): string {
  if (event.key === " ") return "Space";
  if (event.key === "Escape") return "Esc";
  if (event.key.startsWith("Arrow")) return event.key.replace("Arrow", "Arrow ");
  if (event.key.length === 1) return event.key.toUpperCase();
  return event.key;
}

function stopShortcutEvent(event: KeyboardEvent) {
  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === "function") {
    event.stopImmediatePropagation();
  }
}

interface UsePlayerShortcutsArgs {
  isActive: boolean;
  playerShortcuts: UserPrefs["playerShortcuts"] | undefined;
  updatePlayerShortcuts: (updates: Partial<NonNullable<UserPrefs["playerShortcuts"]>>) => Promise<void>;
  callbacks: {
    adjustSubtitleOffset: (deltaMs: number) => void;
    adjustSecondarySubtitleOffset: (deltaMs: number) => void;
    toggleSecondarySubtitle: () => void;
    jumpToNextSentence: () => void;
    jumpToPreviousSentence: () => void;
    toggleMainSubtitleRtl: () => void;
    toggleSecondarySubtitleRtl: () => void;
    toggleSkipSubtitleGaps: () => void;
    focusPlayerContainer: () => void;
    seekBy: (delta: number) => void;
    toggleFullscreen: () => void;
    toggleMute: () => void;
    togglePlayback: () => void;
    stepVolume: (direction: "up" | "down") => void;
    video: HTMLVideoElement | null;
  };
}

export function usePlayerShortcuts({ isActive, playerShortcuts, updatePlayerShortcuts, callbacks }: UsePlayerShortcutsArgs) {
  const [listeningShortcut, setListeningShortcut] = useState<ShortcutAction | null>(null);
  const shortcutBindings = useMemo(() => playerShortcuts ?? {}, [playerShortcuts]);

  const handleShortcutEditToggle = useCallback((action: ShortcutAction) => {
    setListeningShortcut((previous) => (previous === action ? null : action));
  }, []);

  const getShortcutLabel = useCallback(
    (action: ShortcutAction) =>
      listeningShortcut === action ? "Press a key…" : shortcutBindings[action]?.label ?? "None",
    [listeningShortcut, shortcutBindings],
  );

  useEffect(() => {
    if (!listeningShortcut) return;
    const handleShortcutCapture = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      stopShortcutEvent(event);
      if (event.key === "Escape") {
        setListeningShortcut(null);
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        const updates: Partial<NonNullable<UserPrefs["playerShortcuts"]>> = {
          [listeningShortcut]: undefined,
        };
        void updatePlayerShortcuts(updates);
        setListeningShortcut(null);
        return;
      }
      if (event.key === "Shift" || event.key === "Alt" || event.key === "Control" || event.key === "Meta") {
        return;
      }
      const updates: Partial<NonNullable<UserPrefs["playerShortcuts"]>> = {
        [listeningShortcut]: { code: event.code, label: formatShortcutLabel(event) },
      };
      void updatePlayerShortcuts(updates);
      setListeningShortcut(null);
    };
    document.addEventListener("keydown", handleShortcutCapture, true);
    return () => {
      document.removeEventListener("keydown", handleShortcutCapture, true);
    };
  }, [listeningShortcut, updatePlayerShortcuts]);

  const handleCustomShortcutKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (listeningShortcut) return false;
      if (isInteractiveTarget(event.target)) return false;
      if (event.altKey || event.ctrlKey || event.metaKey) return false;
      const handlers: Partial<Record<ShortcutAction, () => void>> = {
        mainSubtitleOffsetBack: () => callbacks.adjustSubtitleOffset(-500),
        mainSubtitleOffsetForward: () => callbacks.adjustSubtitleOffset(500),
        secondarySubtitleOffsetBack: () => callbacks.adjustSecondarySubtitleOffset(-500),
        secondarySubtitleOffsetForward: () => callbacks.adjustSecondarySubtitleOffset(500),
        toggleSecondarySubtitle: callbacks.toggleSecondarySubtitle,
        jumpNextSentence: callbacks.jumpToNextSentence,
        jumpPrevSentence: callbacks.jumpToPreviousSentence,
        toggleMainSubtitleRtl: callbacks.toggleMainSubtitleRtl,
        toggleSecondarySubtitleRtl: callbacks.toggleSecondarySubtitleRtl,
        toggleSkipSubtitleGaps: callbacks.toggleSkipSubtitleGaps,
      };
      for (const [action, handler] of Object.entries(handlers) as [ShortcutAction, () => void][]) {
        const binding = shortcutBindings[action];
        if (binding && binding.code === event.code) {
          stopShortcutEvent(event);
          handler();
          callbacks.focusPlayerContainer();
          return true;
        }
      }
      return false;
    },
    [callbacks, listeningShortcut, shortcutBindings],
  );

  const handleShortcutKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const customHandled = handleCustomShortcutKeyDown(event);
      if (customHandled) return true;
      return handlePlayerKeyDown(event, {
        video: callbacks.video,
        seekBy: callbacks.seekBy,
        toggleFullscreen: callbacks.toggleFullscreen,
        toggleMute: callbacks.toggleMute,
        togglePlayback: callbacks.togglePlayback,
        toggleSecondarySubtitle: callbacks.toggleSecondarySubtitle,
        stepVolume: callbacks.stepVolume,
        ignoreSecondarySubtitleShortcut: Boolean(shortcutBindings.toggleSecondarySubtitle),
      });
    },
    [callbacks, handleCustomShortcutKeyDown, shortcutBindings],
  );

  useEffect(() => {
    if (!isActive) return;
    document.addEventListener("keydown", handleShortcutKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleShortcutKeyDown, true);
    };
  }, [handleShortcutKeyDown, isActive]);

  return {
    listeningShortcut,
    handleShortcutEditToggle,
    getShortcutLabel,
    handleShortcutKeyDown,
  };
}

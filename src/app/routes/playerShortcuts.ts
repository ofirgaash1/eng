type PlayerShortcutHandlers = {
  video: HTMLVideoElement | null;
  seekBy: (seconds: number) => void;
  toggleFullscreen: () => void;
  toggleMute: () => void;
  togglePlayback: () => void;
  toggleSecondarySubtitle: () => void;
  stepVolume: (direction: "up" | "down") => void;
  ignoreSecondarySubtitleShortcut?: boolean;
};

const INTERACTIVE_TAGS = ["INPUT", "TEXTAREA", "SELECT"];

function shouldIgnoreTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined") return false;
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return INTERACTIVE_TAGS.includes(target.tagName);
}

function stopShortcutEvent(event: KeyboardEvent) {
  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === "function") {
    event.stopImmediatePropagation();
  }
}

function matchesShortcut(event: KeyboardEvent, codes: string[], keys: string[]): boolean {
  return codes.includes(event.code) || keys.includes(event.key);
}

export function handlePlayerKeyDown(
  event: KeyboardEvent,
  handlers: PlayerShortcutHandlers,
): boolean {
  const { video, seekBy, toggleFullscreen, toggleMute, togglePlayback, toggleSecondarySubtitle } =
    handlers;
  const { stepVolume } = handlers;
  if (!video) return false;
  if (shouldIgnoreTarget(event.target)) return false;
  if (event.altKey || event.ctrlKey || event.metaKey) return false;

  if (matchesShortcut(event, ["Space"], [" ", "Spacebar"])) {
    stopShortcutEvent(event);
    togglePlayback();
    return true;
  }
  if (matchesShortcut(event, ["KeyK"], ["k", "K"])) {
    stopShortcutEvent(event);
    togglePlayback();
    return true;
  }
  if (matchesShortcut(event, ["ArrowLeft"], ["ArrowLeft"])) {
    stopShortcutEvent(event);
    seekBy(-5);
    return true;
  }
  if (matchesShortcut(event, ["ArrowRight"], ["ArrowRight"])) {
    stopShortcutEvent(event);
    seekBy(5);
    return true;
  }
  if (matchesShortcut(event, ["ArrowUp"], ["ArrowUp"])) {
    stopShortcutEvent(event);
    stepVolume("up");
    return true;
  }
  if (matchesShortcut(event, ["ArrowDown"], ["ArrowDown"])) {
    stopShortcutEvent(event);
    stepVolume("down");
    return true;
  }
  if (matchesShortcut(event, ["KeyF"], ["f", "F"])) {
    stopShortcutEvent(event);
    toggleFullscreen();
    return true;
  }
  if (matchesShortcut(event, ["KeyM"], ["m", "M"])) {
    stopShortcutEvent(event);
    toggleMute();
    return true;
  }
  if (!handlers.ignoreSecondarySubtitleShortcut && matchesShortcut(event, ["KeyH"], ["h", "H"])) {
    stopShortcutEvent(event);
    toggleSecondarySubtitle();
    return true;
  }
  return false;
}

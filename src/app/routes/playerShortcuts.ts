type PlayerShortcutHandlers = {
  video: HTMLVideoElement | null;
  seekBy: (seconds: number) => void;
  toggleFullscreen: () => void;
  toggleMute: () => void;
  togglePlayback: () => void;
  toggleSecondarySubtitle: () => void;
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

export function handlePlayerKeyDown(
  event: KeyboardEvent,
  handlers: PlayerShortcutHandlers,
): boolean {
  const { video, seekBy, toggleFullscreen, toggleMute, togglePlayback, toggleSecondarySubtitle } =
    handlers;
  if (!video) return false;
  if (shouldIgnoreTarget(event.target)) return false;
  if (event.altKey || event.ctrlKey || event.metaKey) return false;

  const code = event.code;
  switch (code) {
    case "Space": {
      stopShortcutEvent(event);
      togglePlayback();
      return true;
    }
    case "KeyK": {
      stopShortcutEvent(event);
      togglePlayback();
      return true;
    }
    case "ArrowLeft": {
      stopShortcutEvent(event);
      seekBy(-5);
      return true;
    }
    case "ArrowRight": {
      stopShortcutEvent(event);
      seekBy(5);
      return true;
    }
    case "KeyF": {
      stopShortcutEvent(event);
      toggleFullscreen();
      return true;
    }
    case "KeyM": {
      stopShortcutEvent(event);
      toggleMute();
      return true;
    }
    case "KeyH": {
      stopShortcutEvent(event);
      toggleSecondarySubtitle();
      return true;
    }
    default:
      return false;
  }
}

type PlayerShortcutHandlers = {
  video: HTMLVideoElement | null;
  seekBy: (seconds: number) => void;
  toggleFullscreen: () => void;
  togglePlayback: () => void;
  toggleSecondarySubtitle: () => void;
};

const INTERACTIVE_TAGS = ["INPUT", "TEXTAREA", "SELECT", "BUTTON"];

function shouldIgnoreTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined") return false;
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return INTERACTIVE_TAGS.includes(target.tagName);
}

function blurActiveElement(video: HTMLVideoElement | null) {
  if (typeof document === "undefined") return;
  const activeElement = document.activeElement as HTMLElement | null;
  if (!activeElement) return;
  if (activeElement === video) {
    video?.blur();
    return;
  }
  if (activeElement instanceof HTMLElement) {
    if (activeElement.tagName === "BUTTON") {
      activeElement.blur();
      return;
    }
    if (video && video.contains(activeElement)) {
      video.blur();
    }
  }
}

export function handlePlayerKeyDown(event: KeyboardEvent, handlers: PlayerShortcutHandlers) {
  const { video, seekBy, toggleFullscreen, togglePlayback, toggleSecondarySubtitle } = handlers;
  if (!video) return;
  if (shouldIgnoreTarget(event.target)) return;

  blurActiveElement(video);

  const code = event.code;
  switch (code) {
    case "Space": {
      event.preventDefault();
      togglePlayback();
      break;
    }
    case "ArrowLeft": {
      event.preventDefault();
      seekBy(-5);
      break;
    }
    case "ArrowRight": {
      event.preventDefault();
      seekBy(5);
      break;
    }
    case "KeyF": {
      event.preventDefault();
      toggleFullscreen();
      break;
    }
    case "KeyH": {
      event.preventDefault();
      toggleSecondarySubtitle();
      break;
    }
    default:
      break;
  }
}

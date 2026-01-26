import { describe, expect, it, vi } from "vitest";
import { handlePlayerKeyDown } from "./playerShortcuts";

function createEvent(code: string, key = "") {
  return {
    code,
    key,
    target: null,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent;
}

describe("handlePlayerKeyDown", () => {
  it("honors layout-independent shortcuts and seeks after playback toggle", () => {
    const video = {
      currentTime: 10,
      blur: vi.fn(),
      contains: vi.fn().mockReturnValue(false),
    } as unknown as HTMLVideoElement;
    let isPlaying = false;

    const togglePlayback = vi.fn(() => {
      isPlaying = !isPlaying;
    });
    const toggleFullscreen = vi.fn();
    const toggleSecondarySubtitle = vi.fn();
    const seekBy = vi.fn((delta: number) => {
      video.currentTime += delta;
    });

    handlePlayerKeyDown(createEvent("Space", " "), {
      video,
      seekBy,
      toggleFullscreen,
      togglePlayback,
      toggleSecondarySubtitle,
    });
    expect(isPlaying).toBe(true);

    handlePlayerKeyDown(createEvent("ArrowRight"), {
      video,
      seekBy,
      toggleFullscreen,
      togglePlayback,
      toggleSecondarySubtitle,
    });
    expect(seekBy).toHaveBeenLastCalledWith(5);
    expect(video.currentTime).toBe(15);

    handlePlayerKeyDown(createEvent("KeyF", "ف"), {
      video,
      seekBy,
      toggleFullscreen,
      togglePlayback,
      toggleSecondarySubtitle,
    });
    expect(toggleFullscreen).toHaveBeenCalled();

    handlePlayerKeyDown(createEvent("KeyH", "и"), {
      video,
      seekBy,
      toggleFullscreen,
      togglePlayback,
      toggleSecondarySubtitle,
    });
    expect(toggleSecondarySubtitle).toHaveBeenCalled();
  });
});

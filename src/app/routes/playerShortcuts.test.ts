import { describe, expect, it, vi } from "vitest";
import { handlePlayerKeyDown } from "./playerShortcuts";

function createEvent(code: string, key = "") {
  return {
    code,
    key,
    target: null,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    stopImmediatePropagation: vi.fn(),
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
    const toggleMute = vi.fn();
    const toggleSecondarySubtitle = vi.fn();
    const seekBy = vi.fn((delta: number) => {
      video.currentTime += delta;
    });

    expect(
      handlePlayerKeyDown(createEvent("Space", " "), {
        video,
        seekBy,
        toggleFullscreen,
        toggleMute,
        togglePlayback,
        toggleSecondarySubtitle,
      }),
    ).toBe(true);
    expect(isPlaying).toBe(true);

    handlePlayerKeyDown(createEvent("ArrowRight"), {
      video,
      seekBy,
      toggleFullscreen,
      toggleMute,
      togglePlayback,
      toggleSecondarySubtitle,
    });
    expect(seekBy).toHaveBeenLastCalledWith(5);
    expect(video.currentTime).toBe(15);

    handlePlayerKeyDown(createEvent("KeyF", "ف"), {
      video,
      seekBy,
      toggleFullscreen,
      toggleMute,
      togglePlayback,
      toggleSecondarySubtitle,
    });
    expect(toggleFullscreen).toHaveBeenCalled();

    handlePlayerKeyDown(createEvent("KeyH", "и"), {
      video,
      seekBy,
      toggleFullscreen,
      toggleMute,
      togglePlayback,
      toggleSecondarySubtitle,
    });
    expect(toggleSecondarySubtitle).toHaveBeenCalled();
  });

  it("falls back to key values when code is missing", () => {
    const video = {
      currentTime: 0,
      blur: vi.fn(),
      contains: vi.fn().mockReturnValue(false),
    } as unknown as HTMLVideoElement;

    const event = createEvent("", " ");
    const handled = handlePlayerKeyDown(event, {
      video,
      seekBy: vi.fn(),
      toggleFullscreen: vi.fn(),
      toggleMute: vi.fn(),
      togglePlayback: vi.fn(),
      toggleSecondarySubtitle: vi.fn(),
    });

    expect(handled).toBe(true);
  });
});

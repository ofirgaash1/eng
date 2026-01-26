import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Cue } from "../../core/types";
import { SubtitleCue } from "./PlayerPage";

describe("SubtitleCue", () => {
  it("renders token buttons above overlays while keeping wrappers click-through", () => {
    const cue: Cue = {
      index: 0,
      startMs: 0,
      endMs: 1000,
      rawText: "Hello world",
    };

    const markup = renderToStaticMarkup(
      <SubtitleCue
        cue={cue}
        classForToken={() => "bg-transparent"}
        onTokenClick={() => undefined}
        onTokenContextMenu={() => undefined}
        isRtl={false}
      />,
    );

    expect(markup).toContain("pointer-events-none flex flex-wrap");
    expect(markup).toContain("pointer-events-auto relative z-40");
    expect(markup).toContain("<button");
  });
});

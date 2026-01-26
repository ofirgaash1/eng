import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Cue } from "../../core/types";
import { SubtitleCue } from "./PlayerPage";

describe("SubtitleCue", () => {
  it("keeps the wrapper click-through while raising token buttons above controls", () => {
    const cue: Cue = {
      index: 0,
      startMs: 0,
      endMs: 1000,
      rawText: "Hello world",
    };

    const html = renderToStaticMarkup(
      <SubtitleCue
        cue={cue}
        classForToken={() => "bg-transparent"}
        onTokenClick={() => undefined}
        onTokenContextMenu={() => undefined}
      />,
    );

    expect(html).toContain("pointer-events-none");
    expect(html).toContain("pointer-events-auto");
    expect(html).toContain("z-50");
  });
});

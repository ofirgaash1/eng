import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Cue } from "../../../core/types";
import { SubtitleCueBackground } from "./SubtitleOverlay";

const SAMPLE_CUE: Cue = {
  index: 138,
  startMs: 370950,
  endMs: 374300,
  rawText: "\"כולל התקליט \"החלום של מונק\n.חתום ע\"י תלוניוס בעצמו",
  tokens: [],
};

const QUOTED_DASH_CUE: Cue = {
  index: 99,
  startMs: 300440,
  endMs: 303480,
  rawText: "טקילה \"קורבו\"? -טקילה\n.רבולוסיון, סילבר\", בלי ליים\"",
  tokens: [],
};

describe("SubtitleOverlay", () => {
  it("renders one row per subtitle line with normalized RTL punctuation", () => {
    const html = renderToStaticMarkup(
      <SubtitleCueBackground cue={SAMPLE_CUE} isRtl className="justify-center text-center" />,
    );

    expect(html).toContain('dir="rtl"');
    expect(html).toContain("<bdi");
    expect(html).toContain('dir="auto"');
    expect(html).toContain(">כולל<");
    expect(html).toContain("&quot;החלום");
    expect(html).toContain("מונק&quot;");
    expect(html).toContain(">חתום<");
    expect(html).toContain("ע&quot;י");
    expect(html).toContain("בעצמו.");
    expect(html).not.toContain("&quot;כולל");
    expect(html).not.toContain(".חתום");
  });

  it("renders compensated trailing quotes and dialogue dashes on the correct RTL tokens", () => {
    const html = renderToStaticMarkup(
      <SubtitleCueBackground cue={QUOTED_DASH_CUE} isRtl className="justify-center text-center" />,
    );

    expect(html).toContain("טקילה");
    expect(html).toContain("&quot;קורבו&quot;?");
    expect(html).toContain(">-טקילה<");
    expect(html).toContain("&quot;רבולוסיון,");
    expect(html).toContain("סילבר&quot;,");
    expect(html).toContain("ליים.");
    expect(html).not.toContain(".רבולוסיון");
    expect(html).not.toContain("ליים&quot;");
  });
});

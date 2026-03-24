import { describe, expect, it } from "vitest";
import type { Cue } from "../types";
import { buildTimingLockedCues } from "./timingLock";

function cue(index: number, startMs: number, endMs: number, rawText: string): Cue {
  return {
    index,
    startMs,
    endMs,
    rawText,
  };
}

describe("subtitle timing lock", () => {
  it("keeps unmatched intro groups while aligning merged speech groups", () => {
    const primaryCues: Cue[] = [
      cue(1, 0, 800, "synced by ofir"),
      cue(2, 2000, 2400, "a"),
      cue(3, 2600, 3000, "b"),
      cue(4, 3120, 3500, "c"),
      cue(5, 5000, 5400, "d"),
    ];
    const secondaryCues: Cue[] = [
      cue(1, 1000, 1400, "א"),
      cue(2, 1600, 2500, "ב ג"),
      cue(3, 4000, 4400, "ד"),
    ];

    const result = buildTimingLockedCues({
      primaryCues,
      secondaryCues,
      primaryOffsetMs: 0,
      secondaryOffsetMs: 0,
      blend: 0.5,
      enabled: true,
      groupGapMs: 180,
    });

    expect(result.active).toBe(true);
    expect(result.autoSecondaryShiftMs).toBe(1000);
    expect(result.matchedGroupCount).toBe(3);
    expect(result.matchedPrimaryGroupCount).toBe(3);
    expect(result.matchedSecondaryGroupCount).toBe(3);

    expect(result.primaryCues[0].startMs).toBe(0);
    expect(result.primaryCues[0].endMs).toBe(800);

    expect(result.secondaryCues[0].startMs).toBe(2000);
    expect(result.secondaryCues[0].endMs).toBe(2400);

    expect(result.secondaryCues[1].startMs).toBe(2600);
    expect(result.secondaryCues[1].endMs).toBe(3500);

    expect(result.primaryCues[2].startMs).toBe(2600);
    expect(result.primaryCues[2].endMs).toBe(3000);
    expect(result.primaryCues[3].startMs).toBe(3120);
    expect(result.primaryCues[3].endMs).toBe(3500);
  });

  it("blends matched groups toward the chosen subtitle side", () => {
    const primaryCues: Cue[] = [cue(1, 2000, 2400, "a"), cue(2, 4000, 4400, "b")];
    const secondaryCues: Cue[] = [cue(1, 1900, 2300, "א"), cue(2, 4100, 4500, "ב")];

    const towardPrimary = buildTimingLockedCues({
      primaryCues,
      secondaryCues,
      primaryOffsetMs: 0,
      secondaryOffsetMs: 0,
      blend: 0,
      enabled: true,
      groupGapMs: 180,
    });
    const towardSecondary = buildTimingLockedCues({
      primaryCues,
      secondaryCues,
      primaryOffsetMs: 0,
      secondaryOffsetMs: 0,
      blend: 1,
      enabled: true,
      groupGapMs: 180,
    });

    expect(towardPrimary.autoSecondaryShiftMs).toBe(towardSecondary.autoSecondaryShiftMs);

    expect(towardPrimary.primaryCues[0].startMs).toBe(2000);
    expect(towardPrimary.secondaryCues[0].startMs).toBe(2000);
    expect(towardPrimary.primaryCues[1].startMs).toBe(4000);
    expect(towardPrimary.secondaryCues[1].startMs).toBe(4000);

    expect(towardSecondary.primaryCues[0].startMs).toBe(
      secondaryCues[0].startMs + towardSecondary.autoSecondaryShiftMs,
    );
    expect(towardSecondary.secondaryCues[0].startMs).toBe(
      secondaryCues[0].startMs + towardSecondary.autoSecondaryShiftMs,
    );
    expect(towardSecondary.primaryCues[1].startMs).toBe(
      secondaryCues[1].startMs + towardSecondary.autoSecondaryShiftMs,
    );
    expect(towardSecondary.secondaryCues[1].startMs).toBe(
      secondaryCues[1].startMs + towardSecondary.autoSecondaryShiftMs,
    );
  });

  it("interpolates local drift for unmatched groups between matched anchors", () => {
    const primaryCues: Cue[] = [
      cue(1, 1000, 1200, "a"),
      cue(2, 2500, 2600, "x"),
      cue(3, 4000, 4200, "b"),
    ];
    const secondaryCues: Cue[] = [
      cue(1, 980, 1180, "א"),
      cue(2, 4050, 4250, "ב"),
    ];

    const result = buildTimingLockedCues({
      primaryCues,
      secondaryCues,
      primaryOffsetMs: 0,
      secondaryOffsetMs: 0,
      blend: 1,
      enabled: true,
      groupGapMs: 180,
    });

    expect(result.matchedSectionCount).toBe(2);
    expect(result.autoSecondaryShiftMs).toBe(0);
    expect(result.primaryCues[1].startMs).toBe(2513);
    expect(result.primaryCues[1].endMs).toBe(2615);
  });
});

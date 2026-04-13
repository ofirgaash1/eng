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

    expect(towardSecondary.referenceTrack).toBe("secondary");
    expect(towardSecondary.primaryCues[0].startMs).toBe(secondaryCues[0].startMs);
    expect(towardSecondary.secondaryCues[0].startMs).toBe(secondaryCues[0].startMs);
    expect(towardSecondary.primaryCues[1].startMs).toBe(secondaryCues[1].startMs);
    expect(towardSecondary.secondaryCues[1].startMs).toBe(secondaryCues[1].startMs);
  });

  it("keeps subtitle 2 on its original timeline even when auto shift is large", () => {
    const primaryCues: Cue[] = [cue(1, 132000, 132600, "a"), cue(2, 135000, 135700, "b")];
    const secondaryCues: Cue[] = [cue(1, 5000, 5600, "x"), cue(2, 8000, 8700, "y")];

    const result = buildTimingLockedCues({
      primaryCues,
      secondaryCues,
      primaryOffsetMs: 0,
      secondaryOffsetMs: 0,
      blend: 1,
      enabled: true,
      groupGapMs: 180,
    });

    expect(result.autoSecondaryShiftMs).toBe(127000);
    expect(result.referenceTrack).toBe("secondary");
    expect(result.secondaryCues[0].startMs).toBe(5000);
    expect(result.secondaryCues[1].startMs).toBe(8000);
    expect(result.primaryCues[0].startMs).toBe(5000);
    expect(result.primaryCues[1].startMs).toBe(8000);
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

  it("handles a major cut with extra leading cues in the secondary section", () => {
    const primaryCues: Cue[] = [
      cue(1, 0, 1000, "intro a"),
      cue(2, 2000, 3000, "intro b"),
      cue(3, 100000, 101000, "scene a"),
      cue(4, 102000, 103000, "scene b"),
      cue(5, 104000, 105000, "scene c"),
    ];
    const secondaryCues: Cue[] = [
      cue(1, 10000, 11000, "intro a secondary"),
      cue(2, 12000, 13000, "intro b secondary"),
      cue(3, 70000, 71000, "extra lead-in"),
      cue(4, 72000, 73000, "extra lead-in 2"),
      cue(5, 120000, 121000, "scene a secondary"),
      cue(6, 122000, 123000, "scene b secondary"),
      cue(7, 124000, 125000, "scene c secondary"),
    ];

    const result = buildTimingLockedCues({
      primaryCues,
      secondaryCues,
      primaryOffsetMs: 0,
      secondaryOffsetMs: 0,
      blend: 0,
      enabled: true,
      groupGapMs: 180,
    });

    expect(result.secondaryCues[0].startMs).toBe(primaryCues[0].startMs);
    expect(result.secondaryCues[1].startMs).toBe(primaryCues[1].startMs);
    expect(result.secondaryCues[4].startMs).toBe(primaryCues[2].startMs);
    expect(result.secondaryCues[5].startMs).toBe(primaryCues[3].startMs);
    expect(result.secondaryCues[6].startMs).toBe(primaryCues[4].startMs);
  });

  it("handles a major cut with extra leading cues in the primary section", () => {
    const primaryCues: Cue[] = [
      cue(1, 0, 1000, "intro a"),
      cue(2, 2000, 3000, "intro b"),
      cue(3, 70000, 71000, "extra lead-in 1"),
      cue(4, 72000, 73000, "extra lead-in 2"),
      cue(5, 74000, 75000, "extra lead-in 3"),
      cue(6, 76000, 77000, "extra lead-in 4"),
      cue(7, 78000, 79000, "extra lead-in 5"),
      cue(8, 80000, 81000, "extra lead-in 6"),
      cue(9, 82000, 83000, "extra lead-in 7"),
      cue(10, 120000, 121000, "scene a"),
      cue(11, 122000, 123000, "scene b"),
      cue(12, 124000, 125000, "scene c"),
    ];
    const secondaryCues: Cue[] = [
      cue(1, 10000, 11000, "intro a secondary"),
      cue(2, 12000, 13000, "intro b secondary"),
      cue(3, 100000, 101000, "scene a secondary"),
      cue(4, 102000, 103000, "scene b secondary"),
      cue(5, 104000, 105000, "scene c secondary"),
    ];

    const result = buildTimingLockedCues({
      primaryCues,
      secondaryCues,
      primaryOffsetMs: 0,
      secondaryOffsetMs: 0,
      blend: 0,
      enabled: true,
      groupGapMs: 180,
    });

    expect(result.secondaryCues[0].startMs).toBe(primaryCues[0].startMs);
    expect(result.secondaryCues[1].startMs).toBe(primaryCues[1].startMs);
    expect(result.secondaryCues[2].startMs).toBe(primaryCues[9].startMs);
    expect(result.secondaryCues[3].startMs).toBe(primaryCues[10].startMs);
    expect(result.secondaryCues[4].startMs).toBe(primaryCues[11].startMs);
  });

  it("keeps the previous section shift when only one side splits on a missing cue", () => {
    const primaryCues: Cue[] = [
      cue(1, 0, 1000, "intro a"),
      cue(2, 2000, 3000, "intro b"),
      cue(3, 18000, 19000, "non-dialogue bridge"),
      cue(4, 38000, 39000, "scene a"),
      cue(5, 40000, 41000, "scene b"),
      cue(6, 100000, 101000, "late scene a"),
      cue(7, 102000, 103000, "late scene b"),
    ];
    const secondaryCues: Cue[] = [
      cue(1, 0, 1000, "intro a secondary"),
      cue(2, 2000, 3000, "intro b secondary"),
      cue(3, 38000, 39000, "scene a secondary"),
      cue(4, 40000, 41000, "scene b secondary"),
      cue(5, 100000, 101000, "late scene a secondary"),
      cue(6, 102000, 103000, "late scene b secondary"),
    ];

    const result = buildTimingLockedCues({
      primaryCues,
      secondaryCues,
      primaryOffsetMs: 0,
      secondaryOffsetMs: 0,
      blend: 0,
      enabled: true,
      groupGapMs: 180,
    });

    expect(result.autoSecondaryShiftMs).toBe(0);
    expect(result.secondaryCues[2].startMs).toBe(primaryCues[3].startMs);
    expect(result.secondaryCues[3].startMs).toBe(primaryCues[4].startMs);
    expect(result.secondaryCues[4].startMs).toBe(primaryCues[5].startMs);
    expect(result.secondaryCues[5].startMs).toBe(primaryCues[6].startMs);
  });

  it("keeps later sections near the established shift when the secondary splits earlier", () => {
    const primaryCues: Cue[] = [
      cue(1, 8000, 10000, "previously on"),
      cue(2, 11000, 13000, "last time"),
      cue(3, 40000, 41000, "found him"),
      cue(4, 42000, 43000, "are you there"),
      cue(5, 44000, 45000, "dad died"),
      cue(6, 180000, 181000, "wrong scene a"),
      cue(7, 182000, 183000, "wrong scene b"),
      cue(8, 184000, 185000, "wrong scene c"),
    ];
    const secondaryCues: Cue[] = [
      cue(1, 1300, 3300, "previously on secondary"),
      cue(2, 4300, 6300, "last time secondary"),
      cue(3, 28200, 29200, "found him secondary"),
      cue(4, 30200, 31200, "are you there secondary"),
      cue(5, 32200, 33200, "dad died secondary"),
    ];

    const result = buildTimingLockedCues({
      primaryCues,
      secondaryCues,
      primaryOffsetMs: 0,
      secondaryOffsetMs: 0,
      blend: 0,
      enabled: true,
      groupGapMs: 180,
    });

    expect(result.secondaryCues[0].startMs).toBe(primaryCues[0].startMs);
    expect(result.secondaryCues[1].startMs).toBe(primaryCues[1].startMs);
    expect(result.secondaryCues[2].startMs).toBe(primaryCues[2].startMs);
    expect(result.secondaryCues[3].startMs).toBe(primaryCues[3].startMs);
    expect(result.secondaryCues[4].startMs).toBe(primaryCues[4].startMs);
  });
});

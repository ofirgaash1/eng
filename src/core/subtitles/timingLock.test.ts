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

  it("avoids stretching a single translated cue across three primary cues", () => {
    const primaryCues: Cue[] = [
      cue(344, 983291, 985531, "Danny."),
      cue(345, 985458, 989128, "I don't, either.\nNot yet."),
      cue(346, 989125, 991165, "Mommy, it's cold!"),
      cue(347, 991167, 992247, "Yeah, I'm coming,\nsweetie."),
      cue(348, 992250, 994830, "I called in a favor\nwith NYPD."),
      cue(349, 994834, 997044, "A guy on the task force\nnamed Danny Jones."),
      cue(350, 997042, 999752, "He can get you into the prison\nward at Bellevue tomorrow"),
      cue(351, 999750, 1000920, "to see Quinn."),
      cue(352, 1000917, 1002247, "-Thank you.\n-Don't thank me."),
      cue(353, 1002250, 1003960, "It shows\njust how fucked we are"),
    ];
    const secondaryCues: Cue[] = [
      cue(326, 986192, 988362, "היא לוקחת את הפלאפונים."),
      cue(327, 986880, 988860, ",גם אני לא יודעת\n.עדיין לא"),
      cue(328, 990280, 993130, ".אמא, קר לי\n.כן, אני באה, מותק-"),
      cue(329, 994010, 995830, "ביקשתי טובה\n.ממשטרת ניו-יורק"),
      cue(330, 995920, 997960, "בחור בכוח המשימה\n.בשם דני ג'ונס"),
      cue(331, 998570, 1001180, "הוא יכניס אותך מחר לאגף הכלא\n.ב-\"בלוויו\", כדי לפגוש את קווין"),
      cue(332, 1001560, 1003270, ".תודה לך\n.אל תודי לי-"),
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

    const primary348 = result.primaryCues.find((entry) => entry.index === 348);
    const primary349 = result.primaryCues.find((entry) => entry.index === 349);
    const secondary328 = result.secondaryCues.find((entry) => entry.index === 328);
    const secondary329 = result.secondaryCues.find((entry) => entry.index === 329);

    expect(primary348).toBeDefined();
    expect(primary349).toBeDefined();
    expect(secondary328).toBeDefined();
    expect(secondary329).toBeDefined();

    expect(secondary328!.endMs).toBeLessThan(secondary329!.startMs);
    expect(secondary329!.startMs).toBeLessThan(primary348!.endMs);
    expect(secondary329!.endMs).toBeLessThanOrEqual(primary348!.endMs);
    expect(secondary329!.startMs).toBeLessThan(primary349!.startMs);
  });

  it("keeps comma-intro dialogue aligned to the following primary boundary", () => {
    const primaryCues: Cue[] = [
      cue(646, 2180042, 2181832, "I am not\ndenying protection."),
      cue(647, 2181834, 2184884, "You are free to escort me\nback to New York."),
      cue(648, 2184875, 2186455, "Neither Mrs. Diehl\nnor her vehicle"),
      cue(649, 2186458, 2188208, "are equipped\nto transport you safely."),
      cue(650, 2188208, 2190078, "She is\nperfectly equipped."),
      cue(651, 2190083, 2192173, "Ma'am, I understand\nyour impatience,"),
      cue(652, 2192166, 2194956, "but it's still possible\nthat you were the target"),
      cue(653, 2194959, 2196499, "-of an assassination attempt.\n-No."),
      cue(654, 2196500, 2199130, "Agent Thoms, I don't believe\nthat anymore. And you know what?"),
      cue(655, 2199125, 2201375, "I don't believe anybody\nelse believes it, either."),
      cue(656, 2201375, 2203075, "See you in New York."),
    ];
    const secondaryCues: Cue[] = [
      cue(606, 2181820, 2183610, "אני לא מסרבת\n.להגנה"),
      cue(607, 2183614, 2186672, "אתם חופשיים ללוות אותי\n.חזרה לניו-יורק"),
      cue(608, 2187340, 2190350, "גברת דיהל והרכב שלה, שניהם\n.אינם מתאימים להסיע אותך בבטחה"),
      cue(609, 2190730, 2192470, ".היא מתאימה בהחלט"),
      cue(610, 2193020, 2194900, "גברתי, אני מבין\n,את חוסר הסבלנות שלך"),
      cue(611, 2195170, 2198220, "אבל זה עדיין אפשרי שאת\n.היית המטרה של נסיון התנקשות"),
      cue(612, 2198240, 2200809, "לא, הסוכן תומס,\n,אני כבר לא מאמינה שזה נכון"),
      cue(613, 2200810, 2203460, "ויודע מה, אני לא מאמינה\n.שיש עדיין מישהו שמאמין בזה"),
      cue(614, 2203570, 2205090, ".נתראה בניו-יורק"),
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

    const primary651 = result.primaryCues.find((entry) => entry.index === 651);
    const primary650 = result.primaryCues.find((entry) => entry.index === 650);
    const primary652 = result.primaryCues.find((entry) => entry.index === 652);
    const secondary610 = result.secondaryCues.find((entry) => entry.index === 610);
    const secondary609 = result.secondaryCues.find((entry) => entry.index === 609);

    expect(primary651).toBeDefined();
    expect(primary650).toBeDefined();
    expect(primary652).toBeDefined();
    expect(secondary610).toBeDefined();
    expect(secondary609).toBeDefined();

    expect(secondary610!.startMs).toBe(primary651!.startMs);
    expect(secondary610!.startMs).toBeLessThan(primary652!.startMs);
    expect(secondary609!.endMs).toBe(primary650!.endMs);
  });
});

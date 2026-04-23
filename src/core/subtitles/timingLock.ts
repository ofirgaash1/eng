import type { Cue } from "../types";

export type TimingLockOptions = {
  primaryCues: Cue[];
  secondaryCues: Cue[];
  primaryOffsetMs: number;
  secondaryOffsetMs: number;
  blend: number;
  enabled: boolean;
  groupGapMs?: number;
};

export type TimingLockResult = {
  primaryCues: Cue[];
  secondaryCues: Cue[];
  autoSecondaryShiftMs: number;
  matchedGroupCount: number;
  matchedSectionCount: number;
  matchedPrimaryGroupCount: number;
  matchedSecondaryGroupCount: number;
  primaryGroupCount: number;
  secondaryGroupCount: number;
  referenceTrack: "primary" | "blend" | "secondary";
  active: boolean;
};

type PreparedTimingLock = {
  primaryAdjustedCues: Cue[];
  secondaryAdjustedCues: Cue[];
  secondaryShiftedCues: Cue[];
  secondaryCueShiftMs: number[];
  autoSecondaryShiftMs: number;
  matchedSpans: SpanMatch[];
  primaryGroups: CueGroup[];
  secondaryGroups: CueGroup[];
  active: boolean;
};

type CueGroup = {
  cueIndices: number[];
  startMs: number;
  endMs: number;
  rawText: string;
  creditLikeScore: number;
  textProfile: TextProfile;
};

type GroupSpan = {
  groupStartIndex: number;
  groupEndIndex: number;
  cueIndices: number[];
  groups: CueGroup[];
  startMs: number;
  endMs: number;
  totalSpeechMs: number;
  creditLikeScore: number;
  textProfile: TextProfile;
};

type SpanMatch = {
  primarySpan: GroupSpan;
  secondarySpan: GroupSpan;
};

type AnchorPoint = {
  sourceMs: number;
  targetMs: number;
};

type SectionShiftResult = {
  score: number;
  shiftMs: number;
};

type TextProfile = {
  lineCount: number;
  wordCount: number;
  wordTokens: string[];
  latinWordTokens: string[];
  digitTokens: string[];
  questionCount: number;
  exclamationCount: number;
  ellipsisCount: number;
  colonCount: number;
  commaCount: number;
  dialogueLineCount: number;
  speakerLabelCount: number;
  parentheticalLineCount: number;
  musicLineCount: number;
};

type CellAction =
  | { type: "skipPrimary" }
  | { type: "skipSecondary" }
  | { type: "match"; primarySpanLength: number; secondarySpanLength: number };

const DEFAULT_GROUP_GAP_MS = 180;
const OFFSET_COARSE_STEP_MS = 250;
const OFFSET_FINE_STEP_MS = 50;
const OFFSET_FINE_RANGE_MS = 500;
const MATCH_SCORE_THRESHOLD = 120;
const GROUP_SKIP_PENALTY = 90;
const MAX_MATCH_SPAN = 3;
const BOUNDARY_REFINEMENT_SCORE_TOLERANCE = 700;
const MAX_GROUP_DURATION_MS = 2800;
const MAX_GROUP_CUE_COUNT = 3;
const SECTION_GAP_MS = 20_000;
const SECTION_SHIFT_PRIMARY_CANDIDATE_GROUP_COUNT = 6;
const SECTION_SHIFT_LOOKAHEAD_GROUP_COUNT = 21;
const MIN_SECTION_SHIFT_GROUP_COUNT = 2;
const SECTION_CONTINUITY_TOLERANCE_MS = 2_500;
const SECTION_SHIFT_REFERENCE_TOLERANCE_MS = 45_000;
const SECTION_LEAD_IN_SHIFT_JUMP_TOLERANCE_MS = 12_000;
const MUSIC_MARKER_RE = /[♪♫♬♩]/;
const DIGIT_TOKEN_RE = /\d+/g;
const SPEAKER_LABEL_RE = /^[\p{L}\p{N} .'\-]{2,24}:/u;
const DIALOGUE_LINE_RE = /^\s*[-–—]\s*/;
const PARENTHETICAL_LINE_RE = /^\s*[\(\[].*[\)\]]\s*$/;
const CREDIT_MARKER_RE =
  /(qsubs|addic7ed|opensubtitles|subscene|www\.|sync(?:ed)?|translated|subtitle|subtitles|תורגם|סונכרן|כתוביות|מצוות|epitaph|zipc)/i;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(start: number, end: number, weight: number): number {
  return start + (end - start) * weight;
}

function groupDuration(group: Pick<CueGroup, "startMs" | "endMs">): number {
  return Math.max(1, group.endMs - group.startMs);
}

function groupCenter(group: Pick<CueGroup, "startMs" | "endMs">): number {
  return (group.startMs + group.endMs) / 2;
}

function durationSimilarity(aDuration: number, bDuration: number): number {
  const longer = Math.max(aDuration, bDuration);
  const shorter = Math.min(aDuration, bDuration);
  return longer <= 0 ? 1 : shorter / longer;
}

function overlapMs(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

function stripMarkup(text: string): string {
  return text.replace(/[\u0001\u0002]/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function isShortHyphenWrappedCredit(text: string): boolean {
  const compact = stripMarkup(text);
  if (compact.length === 0 || compact.length > 48) {
    return false;
  }
  return /^[-–—]\s*[^.?!:]{2,40}\s*[-–—]$/.test(compact);
}

function scoreCueCreditLike(text: string): number {
  const compact = stripMarkup(text);
  if (!compact) {
    return 0;
  }

  let score = 0;
  if (CREDIT_MARKER_RE.test(compact)) {
    score += 1;
  }
  if (isShortHyphenWrappedCredit(compact)) {
    score += 0.8;
  }
  return score;
}

const textProfileCache = new Map<string, TextProfile>();

function parseTextProfile(text: string): TextProfile {
  const compact = stripMarkup(text);
  const lines = compact
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const wordTokens = Array.from(
    new Set(
      compact
        .toLocaleLowerCase()
        .match(/[\p{L}\p{N}]+/gu)
        ?.filter((token) => token.length >= 2) ?? [],
    ),
  ).sort();
  const latinWordTokens = wordTokens.filter((token) => /[a-z]/.test(token));
  const digitTokens = Array.from(new Set(compact.match(DIGIT_TOKEN_RE) ?? []));
  let questionCount = 0;
  let exclamationCount = 0;
  let ellipsisCount = 0;
  let colonCount = 0;
  let commaCount = 0;
  let dialogueLineCount = 0;
  let speakerLabelCount = 0;
  let parentheticalLineCount = 0;
  let musicLineCount = 0;

  for (const line of lines) {
    questionCount += (line.match(/\?/g) ?? []).length;
    exclamationCount += (line.match(/!/g) ?? []).length;
    ellipsisCount += (line.match(/\.{3,}|…/g) ?? []).length;
    colonCount += (line.match(/:/g) ?? []).length;
    commaCount += (line.match(/,/g) ?? []).length;
    if (DIALOGUE_LINE_RE.test(line)) {
      dialogueLineCount += 1;
    }
    if (SPEAKER_LABEL_RE.test(line)) {
      speakerLabelCount += 1;
    }
    if (PARENTHETICAL_LINE_RE.test(line)) {
      parentheticalLineCount += 1;
    }
    if (MUSIC_MARKER_RE.test(line)) {
      musicLineCount += 1;
    }
  }

  const wordCount = compact
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean).length;

  return {
    lineCount: lines.length,
    wordCount,
    wordTokens,
    latinWordTokens,
    digitTokens,
    questionCount,
    exclamationCount,
    ellipsisCount,
    colonCount,
    commaCount,
    dialogueLineCount,
    speakerLabelCount,
    parentheticalLineCount,
    musicLineCount,
  };
}

function getTextProfile(text: string): TextProfile {
  const cached = textProfileCache.get(text);
  if (cached) {
    return cached;
  }
  const profile = parseTextProfile(text);
  textProfileCache.set(text, profile);
  return profile;
}

function isCueOrderSorted(cues: Cue[]): boolean {
  for (let index = 1; index < cues.length; index += 1) {
    const previous = cues[index - 1];
    const current = cues[index];
    if (current.startMs < previous.startMs) {
      return false;
    }
    if (current.startMs === previous.startMs && current.endMs < previous.endMs) {
      return false;
    }
  }
  return true;
}

function combineTextProfiles(profiles: TextProfile[]): TextProfile {
  const wordTokens = new Set<string>();
  const latinWordTokens = new Set<string>();
  const digitTokens = new Set<string>();
  let lineCount = 0;
  let wordCount = 0;
  let questionCount = 0;
  let exclamationCount = 0;
  let ellipsisCount = 0;
  let colonCount = 0;
  let commaCount = 0;
  let dialogueLineCount = 0;
  let speakerLabelCount = 0;
  let parentheticalLineCount = 0;
  let musicLineCount = 0;

  for (const profile of profiles) {
    lineCount += profile.lineCount;
    wordCount += profile.wordCount;
    for (const wordToken of profile.wordTokens) {
      wordTokens.add(wordToken);
    }
    for (const latinWordToken of profile.latinWordTokens) {
      latinWordTokens.add(latinWordToken);
    }
    questionCount += profile.questionCount;
    exclamationCount += profile.exclamationCount;
    ellipsisCount += profile.ellipsisCount;
    colonCount += profile.colonCount;
    commaCount += profile.commaCount;
    dialogueLineCount += profile.dialogueLineCount;
    speakerLabelCount += profile.speakerLabelCount;
    parentheticalLineCount += profile.parentheticalLineCount;
    musicLineCount += profile.musicLineCount;
    for (const digitToken of profile.digitTokens) {
      digitTokens.add(digitToken);
    }
  }

  return {
    lineCount,
    wordCount,
    wordTokens: [...wordTokens].sort(),
    latinWordTokens: [...latinWordTokens].sort(),
    digitTokens: [...digitTokens].sort(),
    questionCount,
    exclamationCount,
    ellipsisCount,
    colonCount,
    commaCount,
    dialogueLineCount,
    speakerLabelCount,
    parentheticalLineCount,
    musicLineCount,
  };
}

function countSimilarity(aCount: number, bCount: number): number {
  const larger = Math.max(aCount, bCount);
  if (larger <= 0) {
    return 1;
  }
  return 1 - Math.abs(aCount - bCount) / larger;
}

function hasExactDigitMatch(primaryProfile: TextProfile, secondaryProfile: TextProfile): boolean {
  if (primaryProfile.digitTokens.length === 0 || secondaryProfile.digitTokens.length === 0) {
    return false;
  }

  return (
    primaryProfile.digitTokens.length === secondaryProfile.digitTokens.length &&
    primaryProfile.digitTokens.every((digitToken, index) => digitToken === secondaryProfile.digitTokens[index])
  );
}

function countSharedTokens(primaryTokens: string[], secondaryTokens: string[]): number {
  if (primaryTokens.length === 0 || secondaryTokens.length === 0) {
    return 0;
  }

  const secondaryTokenSet = new Set(secondaryTokens);
  let sharedTokenCount = 0;
  for (const token of primaryTokens) {
    if (secondaryTokenSet.has(token)) {
      sharedTokenCount += 1;
    }
  }
  return sharedTokenCount;
}

function scoreTextCompatibility(primaryProfile: TextProfile, secondaryProfile: TextProfile): number {
  const lineSimilarity = countSimilarity(primaryProfile.lineCount, secondaryProfile.lineCount);
  const wordSimilarity = countSimilarity(primaryProfile.wordCount, secondaryProfile.wordCount);
  const questionSimilarity = countSimilarity(
    primaryProfile.questionCount,
    secondaryProfile.questionCount,
  );
  const exclamationSimilarity = countSimilarity(
    primaryProfile.exclamationCount,
    secondaryProfile.exclamationCount,
  );
  const dialogueSimilarity = countSimilarity(
    primaryProfile.dialogueLineCount,
    secondaryProfile.dialogueLineCount,
  );
  const speakerSimilarity = countSimilarity(
    primaryProfile.speakerLabelCount,
    secondaryProfile.speakerLabelCount,
  );
  const parentheticalSimilarity = countSimilarity(
    primaryProfile.parentheticalLineCount,
    secondaryProfile.parentheticalLineCount,
  );
  const musicSimilarity = countSimilarity(primaryProfile.musicLineCount, secondaryProfile.musicLineCount);
  const ellipsisSimilarity = countSimilarity(primaryProfile.ellipsisCount, secondaryProfile.ellipsisCount);
  const colonSimilarity = countSimilarity(primaryProfile.colonCount, secondaryProfile.colonCount);
  const commaSimilarity = countSimilarity(primaryProfile.commaCount, secondaryProfile.commaCount);
  const primaryHasDigits = primaryProfile.digitTokens.length > 0;
  const secondaryHasDigits = secondaryProfile.digitTokens.length > 0;
  const sharedWordTokenCount = countSharedTokens(primaryProfile.wordTokens, secondaryProfile.wordTokens);
  const sharedLatinWordTokenCount = countSharedTokens(
    primaryProfile.latinWordTokens,
    secondaryProfile.latinWordTokens,
  );

  let score =
    lineSimilarity * 70 +
    wordSimilarity * 90 +
    questionSimilarity * 35 +
    exclamationSimilarity * 30 +
    dialogueSimilarity * 45 +
    speakerSimilarity * 30 +
    parentheticalSimilarity * 30 +
    musicSimilarity * 65 +
    ellipsisSimilarity * 20 +
    colonSimilarity * 15 +
    commaSimilarity * 18;

  if (sharedWordTokenCount > 0) {
    score += Math.min(180, sharedWordTokenCount * 60);
  }
  if (primaryProfile.latinWordTokens.length > 0 && secondaryProfile.latinWordTokens.length > 0) {
    score += sharedLatinWordTokenCount > 0 ? Math.min(260, sharedLatinWordTokenCount * 90) : -180;
  }

  if (primaryHasDigits !== secondaryHasDigits) {
    score -= 150;
  } else if (primaryHasDigits && secondaryHasDigits) {
    score += hasExactDigitMatch(primaryProfile, secondaryProfile) ? 150 : -110;
  }

  if (primaryProfile.musicLineCount > 0 !== (secondaryProfile.musicLineCount > 0)) {
    score -= 180;
  }

  if (primaryProfile.parentheticalLineCount > 0 !== (secondaryProfile.parentheticalLineCount > 0)) {
    score -= 55;
  }

  return score;
}

function shiftCue(cue: Cue, offsetMs: number): Cue {
  return {
    ...cue,
    startMs: cue.startMs + offsetMs,
    endMs: cue.endMs + offsetMs,
  };
}

function shiftCues(cues: Cue[], offsetMs: number): Cue[] {
  if (offsetMs === 0) {
    return cues.map((cue) => ({ ...cue }));
  }
  return cues.map((cue) => shiftCue(cue, offsetMs));
}

function buildCueGroups(cues: Cue[], groupGapMs: number): CueGroup[] {
  if (cues.length === 0) {
    return [];
  }

  const orderedCues = isCueOrderSorted(cues)
    ? cues.map((cue, index) => ({ cue, originalIndex: index }))
    : cues
        .map((cue, index) => ({ cue, originalIndex: index }))
        .sort(
          (left, right) =>
            left.cue.startMs - right.cue.startMs ||
            left.cue.endMs - right.cue.endMs ||
            left.originalIndex - right.originalIndex,
        );
  const groups: CueGroup[] = [];
  const firstCue = orderedCues[0];
  let current: CueGroup = {
    cueIndices: [firstCue.originalIndex],
    startMs: firstCue.cue.startMs,
    endMs: firstCue.cue.endMs,
    rawText: firstCue.cue.rawText,
    creditLikeScore: scoreCueCreditLike(firstCue.cue.rawText),
    textProfile: getTextProfile(firstCue.cue.rawText),
  };

  for (let index = 1; index < orderedCues.length; index += 1) {
    const orderedCue = orderedCues[index];
    const cue = orderedCue.cue;
    const gapMs = cue.startMs - current.endMs;
    const nextDurationMs = cue.endMs - current.startMs;
    const nextCueCount = current.cueIndices.length + 1;
    if (
      gapMs <= groupGapMs &&
      nextDurationMs <= MAX_GROUP_DURATION_MS &&
      nextCueCount <= MAX_GROUP_CUE_COUNT
    ) {
      current.cueIndices.push(orderedCue.originalIndex);
      current.endMs = Math.max(current.endMs, cue.endMs);
      current.rawText = `${current.rawText}\n${cue.rawText}`;
      current.creditLikeScore += scoreCueCreditLike(cue.rawText);
      current.textProfile = combineTextProfiles([current.textProfile, getTextProfile(cue.rawText)]);
      continue;
    }

    groups.push(current);
    current = {
      cueIndices: [orderedCue.originalIndex],
      startMs: cue.startMs,
      endMs: cue.endMs,
      rawText: cue.rawText,
      creditLikeScore: scoreCueCreditLike(cue.rawText),
      textProfile: getTextProfile(cue.rawText),
    };
  }

  groups.push(current);
  return groups;
}

function splitGroupsIntoSections(groups: CueGroup[], sectionGapMs: number): CueGroup[][] {
  if (groups.length === 0) {
    return [];
  }

  const sections: CueGroup[][] = [];
  let sectionStartIndex = 0;

  for (let index = 1; index < groups.length; index += 1) {
    const previous = groups[index - 1];
    const group = groups[index];
    if (group.startMs - previous.endMs > sectionGapMs) {
      sections.push(groups.slice(sectionStartIndex, index));
      sectionStartIndex = index;
    }
  }

  sections.push(groups.slice(sectionStartIndex));
  return sections;
}

function scoreGlobalOverlap(primaryGroups: CueGroup[], secondaryGroups: CueGroup[], shiftMs: number): number {
  let primaryIndex = 0;
  let secondaryIndex = 0;
  let totalOverlap = 0;
  let primarySpeechMs = 0;
  let secondarySpeechMs = 0;

  for (const group of primaryGroups) {
    primarySpeechMs += groupDuration(group);
  }
  for (const group of secondaryGroups) {
    secondarySpeechMs += groupDuration(group);
  }

  while (primaryIndex < primaryGroups.length && secondaryIndex < secondaryGroups.length) {
    const primaryGroup = primaryGroups[primaryIndex];
    const secondaryGroup = secondaryGroups[secondaryIndex];
    const shiftedStart = secondaryGroup.startMs + shiftMs;
    const shiftedEnd = secondaryGroup.endMs + shiftMs;
    const overlap = overlapMs(
      primaryGroup.startMs,
      primaryGroup.endMs,
      shiftedStart,
      shiftedEnd,
    );

    if (overlap > 0) {
      const similarity = durationSimilarity(groupDuration(primaryGroup), groupDuration(secondaryGroup));
      const sharedWordTokenCount = countSharedTokens(
        primaryGroup.textProfile.wordTokens,
        secondaryGroup.textProfile.wordTokens,
      );
      const lexicalBonus = sharedWordTokenCount * 220;
      const digitBonus = hasExactDigitMatch(
        primaryGroup.textProfile,
        secondaryGroup.textProfile,
      )
        ? 120
        : 0;
      totalOverlap += overlap * (0.7 + similarity * 0.3) + lexicalBonus + digitBonus;
    }

    if (primaryGroup.endMs <= shiftedEnd) {
      primaryIndex += 1;
    } else {
      secondaryIndex += 1;
    }
  }

  const union = Math.max(1, primarySpeechMs + secondarySpeechMs - totalOverlap);
  const ratio = totalOverlap / union;
  const shiftedSecondaryStart = secondaryGroups[0].startMs + shiftMs;
  const shiftedSecondaryEnd = secondaryGroups[secondaryGroups.length - 1].endMs + shiftMs;
  const boundaryPenalty =
    Math.abs(primaryGroups[0].startMs - shiftedSecondaryStart) * 0.03 +
    Math.abs(primaryGroups[primaryGroups.length - 1].endMs - shiftedSecondaryEnd) * 0.01;

  return totalOverlap * (0.35 + ratio) - boundaryPenalty;
}

function findBestGlobalShift(
  primaryGroups: CueGroup[],
  secondaryGroups: CueGroup[],
  preferredShiftMs?: number,
  preferredRangeMs?: number,
): number {
  if (primaryGroups.length === 0 || secondaryGroups.length === 0) {
    return 0;
  }

  let minimumShiftMs =
    primaryGroups[0].startMs - secondaryGroups[secondaryGroups.length - 1].endMs;
  let maximumShiftMs =
    primaryGroups[primaryGroups.length - 1].endMs - secondaryGroups[0].startMs;

  if (
    typeof preferredShiftMs === "number" &&
    typeof preferredRangeMs === "number" &&
    preferredRangeMs > 0
  ) {
    minimumShiftMs = Math.max(minimumShiftMs, preferredShiftMs - preferredRangeMs);
    maximumShiftMs = Math.min(maximumShiftMs, preferredShiftMs + preferredRangeMs);
  }

  let bestShiftMs = 0;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (
    let coarseCandidate = minimumShiftMs;
    coarseCandidate <= maximumShiftMs;
    coarseCandidate += OFFSET_COARSE_STEP_MS
  ) {
    const score = scoreGlobalOverlap(primaryGroups, secondaryGroups, coarseCandidate);
    if (score > bestScore) {
      bestScore = score;
      bestShiftMs = coarseCandidate;
    }
  }

  let refinedShiftMs = bestShiftMs;
  let refinedScore = bestScore;

  for (
    let candidate = bestShiftMs - OFFSET_FINE_RANGE_MS;
    candidate <= bestShiftMs + OFFSET_FINE_RANGE_MS;
    candidate += OFFSET_FINE_STEP_MS
  ) {
    const score = scoreGlobalOverlap(primaryGroups, secondaryGroups, candidate);
    if (score > refinedScore) {
      refinedScore = score;
      refinedShiftMs = candidate;
    }
  }

  return refinedShiftMs;
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function findEarlySectionGapIndex(groups: CueGroup[]): number | undefined {
  const lookaheadLimit = Math.min(groups.length, SECTION_SHIFT_LOOKAHEAD_GROUP_COUNT);

  for (let index = 1; index < lookaheadLimit; index += 1) {
    if (groups[index].startMs - groups[index - 1].endMs <= SECTION_GAP_MS) {
      continue;
    }

    return index;
  }

  return undefined;
}

function appendCandidateGroups(candidates: CueGroup[], seenGroups: Set<CueGroup>, groups: CueGroup[]): void {
  for (const group of groups) {
    if (!seenGroups.has(group)) {
      candidates.push(group);
      seenGroups.add(group);
    }
  }
}

function buildPrimarySectionShiftCandidates(groups: CueGroup[], preferAfterEarlyGap: boolean): CueGroup[] {
  const candidates: CueGroup[] = [];
  const seenGroups = new Set<CueGroup>();
  const earlyGapIndex = findEarlySectionGapIndex(groups);
  const baseCandidates = groups.slice(0, SECTION_SHIFT_PRIMARY_CANDIDATE_GROUP_COUNT);
  const afterGapCandidates =
    typeof earlyGapIndex === "number"
      ? groups.slice(
          earlyGapIndex,
          Math.min(groups.length, earlyGapIndex + SECTION_SHIFT_PRIMARY_CANDIDATE_GROUP_COUNT),
        )
      : [];

  if (preferAfterEarlyGap) {
    appendCandidateGroups(candidates, seenGroups, afterGapCandidates);
    appendCandidateGroups(candidates, seenGroups, baseCandidates);
  } else {
    appendCandidateGroups(candidates, seenGroups, baseCandidates);
    appendCandidateGroups(candidates, seenGroups, afterGapCandidates);
  }

  return candidates;
}

function shiftedSectionStartDistanceMs(
  primaryGroups: CueGroup[],
  secondarySection: CueGroup[],
  shiftMs: number,
): number {
  if (primaryGroups.length === 0 || secondarySection.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  const shiftedStartMs = secondarySection[0].startMs + shiftMs;
  let nearestDistanceMs = Number.POSITIVE_INFINITY;

  for (const primaryGroup of primaryGroups) {
    const distanceMs = Math.abs(primaryGroup.startMs - shiftedStartMs);
    if (distanceMs < nearestDistanceMs) {
      nearestDistanceMs = distanceMs;
    }
  }

  return nearestDistanceMs;
}

function findFirstOverlappingGroupIndex(
  primaryGroups: CueGroup[],
  secondarySection: CueGroup[],
  shiftMs: number,
): number {
  for (let groupIndex = 0; groupIndex < secondarySection.length; groupIndex += 1) {
    const group = secondarySection[groupIndex];
    for (const primaryGroup of primaryGroups) {
      if (
        overlapMs(
          primaryGroup.startMs,
          primaryGroup.endMs,
          group.startMs + shiftMs,
          group.endMs + shiftMs,
        ) > 0
      ) {
        return groupIndex;
      }
    }
  }
  return -1;
}

function shouldContinueSectionShift(
  primaryGroups: CueGroup[],
  secondarySection: CueGroup[],
  continuityShiftMs: number,
): boolean {
  return (
    shiftedSectionStartDistanceMs(primaryGroups, secondarySection, continuityShiftMs) <=
    SECTION_CONTINUITY_TOLERANCE_MS
  );
}

function findBestSectionShift(
  primaryGroups: CueGroup[],
  secondaryGroups: CueGroup[],
  fallbackShiftMs: number,
  referenceShiftMs?: number,
): SectionShiftResult {
  if (
    primaryGroups.length < MIN_SECTION_SHIFT_GROUP_COUNT ||
    secondaryGroups.length < MIN_SECTION_SHIFT_GROUP_COUNT
  ) {
    return {
      score: scoreGlobalOverlap(primaryGroups, secondaryGroups, fallbackShiftMs),
      shiftMs: fallbackShiftMs,
    };
  }

  const primaryEarlyGapIndex = findEarlySectionGapIndex(primaryGroups);
  const secondaryEarlyGapIndex = findEarlySectionGapIndex(secondaryGroups);
  const hasPrimaryOnlyEarlyGap =
    typeof primaryEarlyGapIndex === "number" && typeof secondaryEarlyGapIndex !== "number";
  const hasSecondaryOnlyEarlyGap =
    typeof secondaryEarlyGapIndex === "number" && typeof primaryEarlyGapIndex !== "number";
  const scoringPrimaryGroups = hasPrimaryOnlyEarlyGap
    ? primaryGroups.slice(primaryEarlyGapIndex)
    : primaryGroups;
  const scoringSecondaryGroups = hasSecondaryOnlyEarlyGap
    ? secondaryGroups.slice(secondaryEarlyGapIndex)
    : secondaryGroups;
  const primaryCandidates = buildPrimarySectionShiftCandidates(primaryGroups, hasPrimaryOnlyEarlyGap);
  const secondaryCandidates = secondaryGroups.slice(0, SECTION_SHIFT_LOOKAHEAD_GROUP_COUNT);
  const candidateShifts = new Set<number>();

  for (const primaryGroup of primaryCandidates) {
    for (const secondaryGroup of secondaryCandidates) {
      candidateShifts.add(primaryGroup.startMs - secondaryGroup.startMs);
      candidateShifts.add(primaryGroup.endMs - secondaryGroup.endMs);
    }
  }

  if (candidateShifts.size === 0) {
    return {
      score: scoreGlobalOverlap(scoringPrimaryGroups, scoringSecondaryGroups, fallbackShiftMs),
      shiftMs: fallbackShiftMs,
    };
  }

  let bestShiftMs = fallbackShiftMs;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidateShiftMs of candidateShifts) {
    const refinedShiftMs = findBestGlobalShift(
      scoringPrimaryGroups,
      scoringSecondaryGroups,
      candidateShiftMs,
      OFFSET_FINE_RANGE_MS,
    );
    if (
      typeof referenceShiftMs === "number" &&
      Math.abs(refinedShiftMs - referenceShiftMs) > SECTION_SHIFT_REFERENCE_TOLERANCE_MS
    ) {
      continue;
    }
    const score = scoreGlobalOverlap(scoringPrimaryGroups, scoringSecondaryGroups, refinedShiftMs);
    if (score > bestScore) {
      bestScore = score;
      bestShiftMs = refinedShiftMs;
    }
  }

  if (bestScore === Number.NEGATIVE_INFINITY) {
    return {
      score: scoreGlobalOverlap(scoringPrimaryGroups, scoringSecondaryGroups, fallbackShiftMs),
      shiftMs: fallbackShiftMs,
    };
  }

  return {
    score: bestScore,
    shiftMs: bestShiftMs,
  };
}

function buildSecondaryCueShiftsBySection(
  primaryGroups: CueGroup[],
  secondaryGroups: CueGroup[],
  secondaryCueCount: number,
): { shifts: number[]; representativeShiftMs: number } {
  const fallbackShiftMs = findBestGlobalShift(primaryGroups, secondaryGroups);
  const shifts = Array.from({ length: secondaryCueCount }, () => fallbackShiftMs);
  const primarySections = splitGroupsIntoSections(primaryGroups, SECTION_GAP_MS);
  const secondarySections = splitGroupsIntoSections(secondaryGroups, SECTION_GAP_MS);

  if (secondarySections.length <= 1) {
    return { shifts, representativeShiftMs: fallbackShiftMs };
  }

  const sectionShifts: number[] = [];
  let previousSectionShiftMs = fallbackShiftMs;

  for (let index = 0; index < secondarySections.length; index += 1) {
    const secondarySection = secondarySections[index];
    let sectionShiftMs = previousSectionShiftMs;
    const continuityShiftMs = previousSectionShiftMs;

    if (
      index === 0 ||
      !shouldContinueSectionShift(primaryGroups, secondarySection, previousSectionShiftMs)
    ) {
      let bestSectionShift = findBestSectionShift(
        primarySections[0] ?? primaryGroups,
        secondarySection,
        fallbackShiftMs,
        index > 0 ? previousSectionShiftMs : undefined,
      );

      if (index > 0) {
        for (
          let primarySectionIndex = 1;
          primarySectionIndex < primarySections.length;
          primarySectionIndex += 1
        ) {
          const candidateSectionShift = findBestSectionShift(
            primarySections[primarySectionIndex],
            secondarySection,
            fallbackShiftMs,
            previousSectionShiftMs,
          );
          if (candidateSectionShift.score > bestSectionShift.score) {
            bestSectionShift = candidateSectionShift;
          }
        }
      }

      sectionShiftMs = bestSectionShift.shiftMs;
    }

    const hasLargeShiftJump =
      index > 0 &&
      Math.abs(sectionShiftMs - continuityShiftMs) > SECTION_LEAD_IN_SHIFT_JUMP_TOLERANCE_MS;
    const firstOverlappingGroupIndex = hasLargeShiftJump
      ? findFirstOverlappingGroupIndex(primaryGroups, secondarySection, sectionShiftMs)
      : -1;

    for (let groupIndex = 0; groupIndex < secondarySection.length; groupIndex += 1) {
      const group = secondarySection[groupIndex];
      const groupShiftMs =
        hasLargeShiftJump &&
        firstOverlappingGroupIndex > 0 &&
        groupIndex < firstOverlappingGroupIndex
          ? continuityShiftMs
          : sectionShiftMs;
      for (const cueIndex of group.cueIndices) {
        shifts[cueIndex] = groupShiftMs;
      }
    }

    sectionShifts.push(sectionShiftMs);
    previousSectionShiftMs = sectionShiftMs;
  }

  return {
    shifts,
    representativeShiftMs: median(sectionShifts),
  };
}

function buildGroupSpan(groups: CueGroup[], groupStartIndex: number, spanLength: number): GroupSpan {
  const groupEndIndex = groupStartIndex + spanLength - 1;
  const cueIndices: number[] = [];
  const segmentGroups: CueGroup[] = [];
  let totalSpeechMs = 0;
  let creditLikeScore = 0;
  const textProfiles: TextProfile[] = [];
  for (let index = groupStartIndex; index <= groupEndIndex; index += 1) {
    const group = groups[index];
    cueIndices.push(...group.cueIndices);
    segmentGroups.push(group);
    totalSpeechMs += groupDuration(group);
    creditLikeScore += group.creditLikeScore;
    textProfiles.push(group.textProfile);
  }

  return {
    groupStartIndex,
    groupEndIndex,
    cueIndices,
    groups: segmentGroups,
    startMs: groups[groupStartIndex].startMs,
    endMs: groups[groupEndIndex].endMs,
    totalSpeechMs,
    creditLikeScore,
    textProfile: combineTextProfiles(textProfiles),
  };
}

function computeSpanActivityOverlap(primarySpan: GroupSpan, secondarySpan: GroupSpan): number {
  let primaryIndex = 0;
  let secondaryIndex = 0;
  let overlap = 0;

  while (primaryIndex < primarySpan.groups.length && secondaryIndex < secondarySpan.groups.length) {
    const primaryGroup = primarySpan.groups[primaryIndex];
    const secondaryGroup = secondarySpan.groups[secondaryIndex];
    overlap += overlapMs(
      primaryGroup.startMs,
      primaryGroup.endMs,
      secondaryGroup.startMs,
      secondaryGroup.endMs,
    );

    if (primaryGroup.endMs <= secondaryGroup.endMs) {
      primaryIndex += 1;
    } else {
      secondaryIndex += 1;
    }
  }

  return overlap;
}

function scoreSpanPair(primarySpan: GroupSpan, secondarySpan: GroupSpan): number {
  const overlap = computeSpanActivityOverlap(primarySpan, secondarySpan);
  const centerDistance = Math.abs(groupCenter(primarySpan) - groupCenter(secondarySpan));
  const similarity = durationSimilarity(primarySpan.totalSpeechMs, secondarySpan.totalSpeechMs);
  const primaryCueCount = primarySpan.cueIndices.length;
  const secondaryCueCount = secondarySpan.cueIndices.length;
  const cueCountGap = Math.abs(primaryCueCount - secondaryCueCount);
  const sharedLatinWordTokenCount = countSharedTokens(
    primarySpan.textProfile.latinWordTokens,
    secondarySpan.textProfile.latinWordTokens,
  );
  const textCompatibility = scoreTextCompatibility(
    primarySpan.textProfile,
    secondarySpan.textProfile,
  );
  const primaryIsCreditLike = primarySpan.creditLikeScore >= 0.8;
  const secondaryIsCreditLike = secondarySpan.creditLikeScore >= 0.8;
  const creditMismatchPenalty =
    Math.abs(primarySpan.creditLikeScore - secondarySpan.creditLikeScore) * 260;
  const spanComplexityPenalty =
    (primarySpan.groupEndIndex - primarySpan.groupStartIndex) * 28 +
    (secondarySpan.groupEndIndex - secondarySpan.groupStartIndex) * 28;
  const cueCountPenalty = cueCountGap * 120 + (cueCountGap > 1 ? (cueCountGap - 1) * 220 : 0);

  if (primaryIsCreditLike !== secondaryIsCreditLike) {
    return Number.NEGATIVE_INFINITY;
  }
  if (
    primarySpan.textProfile.latinWordTokens.length >= 2 &&
    secondarySpan.textProfile.latinWordTokens.length >= 2 &&
    sharedLatinWordTokenCount === 0
  ) {
    return Number.NEGATIVE_INFINITY;
  }
  if (cueCountGap >= 2 && (primaryCueCount === 1 || secondaryCueCount === 1)) {
    return Number.NEGATIVE_INFINITY;
  }

  if (overlap <= 0 && centerDistance > 700) {
    return Number.NEGATIVE_INFINITY;
  }

  return (
    overlap * 1.15 +
    similarity * 260 -
    centerDistance * 0.14 -
    spanComplexityPenalty -
    creditMismatchPenalty +
    -cueCountPenalty +
    textCompatibility
  );
}

function alignGroups(primaryGroups: CueGroup[], secondaryGroups: CueGroup[]): SpanMatch[] {
  const primaryCount = primaryGroups.length;
  const secondaryCount = secondaryGroups.length;
  const stride = secondaryCount + 1;
  const scores = new Float64Array((primaryCount + 1) * (secondaryCount + 1));
  const actions: Array<CellAction | null> = new Array((primaryCount + 1) * (secondaryCount + 1)).fill(
    null,
  );

  for (let primaryIndex = 1; primaryIndex <= primaryCount; primaryIndex += 1) {
    scores[primaryIndex * stride] = -primaryIndex * GROUP_SKIP_PENALTY;
    actions[primaryIndex * stride] = { type: "skipPrimary" };
  }
  for (let secondaryIndex = 1; secondaryIndex <= secondaryCount; secondaryIndex += 1) {
    scores[secondaryIndex] = -secondaryIndex * GROUP_SKIP_PENALTY;
    actions[secondaryIndex] = { type: "skipSecondary" };
  }

  for (let primaryIndex = 1; primaryIndex <= primaryCount; primaryIndex += 1) {
    for (let secondaryIndex = 1; secondaryIndex <= secondaryCount; secondaryIndex += 1) {
      const cellIndex = primaryIndex * stride + secondaryIndex;
      let bestScore = scores[(primaryIndex - 1) * stride + secondaryIndex] - GROUP_SKIP_PENALTY;
      let bestAction: CellAction = { type: "skipPrimary" };

      const skipSecondaryScore = scores[primaryIndex * stride + secondaryIndex - 1] - GROUP_SKIP_PENALTY;
      if (skipSecondaryScore > bestScore) {
        bestScore = skipSecondaryScore;
        bestAction = { type: "skipSecondary" };
      }

      for (
        let primarySpanLength = 1;
        primarySpanLength <= MAX_MATCH_SPAN && primarySpanLength <= primaryIndex;
        primarySpanLength += 1
      ) {
        const primarySpan = buildGroupSpan(
          primaryGroups,
          primaryIndex - primarySpanLength,
          primarySpanLength,
        );
        for (
          let secondarySpanLength = 1;
          secondarySpanLength <= MAX_MATCH_SPAN && secondarySpanLength <= secondaryIndex;
          secondarySpanLength += 1
        ) {
          const secondarySpan = buildGroupSpan(
            secondaryGroups,
            secondaryIndex - secondarySpanLength,
            secondarySpanLength,
          );
          const pairScore = scoreSpanPair(primarySpan, secondarySpan);
          if (pairScore < MATCH_SCORE_THRESHOLD) {
            continue;
          }

          const candidateScore =
            scores[
              (primaryIndex - primarySpanLength) * stride + (secondaryIndex - secondarySpanLength)
            ] + pairScore;
          if (candidateScore > bestScore) {
            bestScore = candidateScore;
            bestAction = {
              type: "match",
              primarySpanLength,
              secondarySpanLength,
            };
          }
        }
      }

      scores[cellIndex] = bestScore;
      actions[cellIndex] = bestAction;
    }
  }

  const matches: SpanMatch[] = [];
  let primaryIndex = primaryCount;
  let secondaryIndex = secondaryCount;

  while (primaryIndex > 0 || secondaryIndex > 0) {
    const action = actions[primaryIndex * stride + secondaryIndex];
    if (!action) {
      break;
    }
    if (action.type === "skipPrimary") {
      primaryIndex -= 1;
      continue;
    }
    if (action.type === "skipSecondary") {
      secondaryIndex -= 1;
      continue;
    }

    const primarySpan = buildGroupSpan(
      primaryGroups,
      primaryIndex - action.primarySpanLength,
      action.primarySpanLength,
    );
    const secondarySpan = buildGroupSpan(
      secondaryGroups,
      secondaryIndex - action.secondarySpanLength,
      action.secondarySpanLength,
    );

    matches.push({ primarySpan, secondarySpan });
    primaryIndex -= action.primarySpanLength;
    secondaryIndex -= action.secondarySpanLength;
  }

  matches.reverse();
  return matches;
}

function refineAdjacentMatchBoundaries(
  matches: SpanMatch[],
  primaryGroups: CueGroup[],
  secondaryGroups: CueGroup[],
): SpanMatch[] {
  if (matches.length < 2) {
    return matches;
  }

  const refined = matches.map((match) => ({
    primarySpan: match.primarySpan,
    secondarySpan: match.secondarySpan,
  }));

  for (let index = 0; index < refined.length - 1; index += 1) {
    const leftMatch = refined[index];
    const rightMatch = refined[index + 1];
    if (
      leftMatch.primarySpan.groupEndIndex + 1 !== rightMatch.primarySpan.groupStartIndex ||
      leftMatch.secondarySpan.groupEndIndex + 1 !== rightMatch.secondarySpan.groupStartIndex
    ) {
      continue;
    }

    const leftPrimarySpanLength =
      leftMatch.primarySpan.groupEndIndex - leftMatch.primarySpan.groupStartIndex + 1;
    const rightPrimarySpanLength =
      rightMatch.primarySpan.groupEndIndex - rightMatch.primarySpan.groupStartIndex + 1;
    if (leftPrimarySpanLength <= 1 || rightPrimarySpanLength >= MAX_MATCH_SPAN) {
      continue;
    }

    const movedPrimaryGroup = primaryGroups[leftMatch.primarySpan.groupEndIndex];
    const rightPrimaryFirstGroup = primaryGroups[rightMatch.primarySpan.groupStartIndex];
    const leftSecondaryLastGroup = secondaryGroups[leftMatch.secondarySpan.groupEndIndex];
    const rightSecondaryFirstGroup = secondaryGroups[rightMatch.secondarySpan.groupStartIndex];

    const hasCommaBoundarySignal =
      movedPrimaryGroup.textProfile.commaCount > 0 &&
      rightSecondaryFirstGroup.textProfile.commaCount > 0 &&
      movedPrimaryGroup.textProfile.commaCount > rightPrimaryFirstGroup.textProfile.commaCount &&
      rightSecondaryFirstGroup.textProfile.commaCount > leftSecondaryLastGroup.textProfile.commaCount;
    if (!hasCommaBoundarySignal) {
      continue;
    }

    const candidateLeftPrimarySpan = buildGroupSpan(
      primaryGroups,
      leftMatch.primarySpan.groupStartIndex,
      leftPrimarySpanLength - 1,
    );
    const candidateRightPrimarySpan = buildGroupSpan(
      primaryGroups,
      rightMatch.primarySpan.groupStartIndex - 1,
      rightPrimarySpanLength + 1,
    );

    const leftCurrentScore = scoreSpanPair(leftMatch.primarySpan, leftMatch.secondarySpan);
    const rightCurrentScore = scoreSpanPair(rightMatch.primarySpan, rightMatch.secondarySpan);
    const leftCandidateScore = scoreSpanPair(candidateLeftPrimarySpan, leftMatch.secondarySpan);
    const rightCandidateScore = scoreSpanPair(candidateRightPrimarySpan, rightMatch.secondarySpan);
    if (
      !Number.isFinite(leftCurrentScore) ||
      !Number.isFinite(rightCurrentScore) ||
      !Number.isFinite(leftCandidateScore) ||
      !Number.isFinite(rightCandidateScore)
    ) {
      continue;
    }

    const currentTotalScore = leftCurrentScore + rightCurrentScore;
    const candidateTotalScore = leftCandidateScore + rightCandidateScore;
    if (candidateTotalScore + BOUNDARY_REFINEMENT_SCORE_TOLERANCE < currentTotalScore) {
      continue;
    }

    refined[index] = {
      primarySpan: candidateLeftPrimarySpan,
      secondarySpan: leftMatch.secondarySpan,
    };
    refined[index + 1] = {
      primarySpan: candidateRightPrimarySpan,
      secondarySpan: rightMatch.secondarySpan,
    };
  }

  return refined;
}

function remapSpanCues(
  outputCues: Cue[],
  sourceCues: Cue[],
  span: GroupSpan,
  targetStartMs: number,
  targetEndMs: number,
): void {
  const targetDuration = Math.max(1, targetEndMs - targetStartMs);
  const sourceDuration = Math.max(1, span.endMs - span.startMs);
  const spanCueIndices = span.cueIndices;

  if (spanCueIndices.length === 1) {
    const cueIndex = spanCueIndices[0];
    outputCues[cueIndex] = {
      ...sourceCues[cueIndex],
      startMs: targetStartMs,
      endMs: targetEndMs,
    };
    return;
  }

  for (let position = 0; position < spanCueIndices.length; position += 1) {
    const cueIndex = spanCueIndices[position];
    const cue = sourceCues[cueIndex];
    const relativeStart = clamp((cue.startMs - span.startMs) / sourceDuration, 0, 1);
    const relativeEnd = clamp((cue.endMs - span.startMs) / sourceDuration, relativeStart, 1);
    const nextStartMs = Math.round(targetStartMs + relativeStart * targetDuration);
    const nextEndMs = Math.round(targetStartMs + relativeEnd * targetDuration);
    const minimumEndMs = position === spanCueIndices.length - 1 ? targetEndMs : nextStartMs + 20;

    outputCues[cueIndex] = {
      ...cue,
      startMs: nextStartMs,
      endMs: Math.max(nextEndMs, minimumEndMs),
    };
  }
}

function addAnchorPoints(anchors: AnchorPoint[], sourceStartMs: number, sourceEndMs: number, targetStartMs: number, targetEndMs: number): void {
  anchors.push({ sourceMs: sourceStartMs, targetMs: targetStartMs });
  anchors.push({ sourceMs: sourceEndMs, targetMs: targetEndMs });
}

function normalizeAnchors(anchors: AnchorPoint[]): AnchorPoint[] {
  const sorted = [...anchors].sort((left, right) => left.sourceMs - right.sourceMs);
  const normalized: AnchorPoint[] = [];

  for (const anchor of sorted) {
    const previous = normalized[normalized.length - 1];
    if (previous && previous.sourceMs === anchor.sourceMs) {
      previous.targetMs = anchor.targetMs;
      continue;
    }
    normalized.push({ ...anchor });
  }

  return normalized;
}

function interpolateAnchoredTime(
  sourceMs: number,
  anchors: AnchorPoint[],
  sourceStartMs: number,
  sourceEndMs: number,
): number {
  if (anchors.length === 0) {
    return sourceMs;
  }

  if (sourceMs <= anchors[0].sourceMs) {
    const sourceRange = Math.max(1, anchors[0].sourceMs - sourceStartMs);
    const ratio = clamp((sourceMs - sourceStartMs) / sourceRange, 0, 1);
    return lerp(sourceStartMs, anchors[0].targetMs, ratio);
  }

  const lastAnchor = anchors[anchors.length - 1];
  if (sourceMs >= lastAnchor.sourceMs) {
    const sourceRange = Math.max(1, sourceEndMs - lastAnchor.sourceMs);
    const ratio = clamp((sourceMs - lastAnchor.sourceMs) / sourceRange, 0, 1);
    return lerp(lastAnchor.targetMs, sourceEndMs, ratio);
  }

  for (let index = 1; index < anchors.length; index += 1) {
    const previous = anchors[index - 1];
    const next = anchors[index];
    if (sourceMs > next.sourceMs) {
      continue;
    }

    const sourceRange = Math.max(1, next.sourceMs - previous.sourceMs);
    const ratio = clamp((sourceMs - previous.sourceMs) / sourceRange, 0, 1);
    return lerp(previous.targetMs, next.targetMs, ratio);
  }

  return sourceMs;
}

function applyAnchorInterpolationToUnmatchedGroups(
  outputCues: Cue[],
  sourceCues: Cue[],
  groups: CueGroup[],
  matchedGroupIndices: Set<number>,
  anchors: AnchorPoint[],
): void {
  if (anchors.length === 0) {
    return;
  }

  const sourceStartMs = groups[0]?.startMs ?? 0;
  const sourceEndMs = groups[groups.length - 1]?.endMs ?? sourceStartMs;

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    if (matchedGroupIndices.has(groupIndex)) {
      continue;
    }

    const group = groups[groupIndex];
    const targetStartMs = Math.round(
      interpolateAnchoredTime(group.startMs, anchors, sourceStartMs, sourceEndMs),
    );
    const targetEndMs = Math.round(
      interpolateAnchoredTime(group.endMs, anchors, sourceStartMs, sourceEndMs),
    );
    remapSpanCues(
      outputCues,
      sourceCues,
      {
        groupStartIndex: groupIndex,
        groupEndIndex: groupIndex,
        cueIndices: group.cueIndices,
        groups: [group],
        startMs: group.startMs,
        endMs: group.endMs,
        totalSpeechMs: groupDuration(group),
        creditLikeScore: group.creditLikeScore,
        textProfile: group.textProfile,
      },
      targetStartMs,
      Math.max(targetEndMs, targetStartMs + 20),
    );
  }
}

function buildInactiveTimingLockResult(
  primaryCues: Cue[],
  secondaryCues: Cue[],
  referenceTrack: TimingLockResult["referenceTrack"],
): TimingLockResult {
  return {
    primaryCues,
    secondaryCues,
    autoSecondaryShiftMs: 0,
    matchedGroupCount: 0,
    matchedSectionCount: 0,
    matchedPrimaryGroupCount: 0,
    matchedSecondaryGroupCount: 0,
    primaryGroupCount: 0,
    secondaryGroupCount: 0,
    referenceTrack,
    active: false,
  };
}

function resolveReferenceTrack(blend: number): TimingLockResult["referenceTrack"] {
  if (blend <= 0) {
    return "primary";
  }
  if (blend >= 1) {
    return "secondary";
  }
  return "blend";
}

function getSecondarySpanShiftMs(prepared: PreparedTimingLock, span: GroupSpan): number {
  const shifts = span.cueIndices
    .map((cueIndex) => prepared.secondaryCueShiftMs[cueIndex])
    .filter((shift): shift is number => typeof shift === "number");
  return shifts.length > 0 ? median(shifts) : prepared.autoSecondaryShiftMs;
}

export function prepareTimingLock(
  options: Omit<TimingLockOptions, "blend">,
): PreparedTimingLock {
  const primaryAdjustedCues = shiftCues(options.primaryCues, options.primaryOffsetMs);
  const secondaryAdjustedCues = shiftCues(options.secondaryCues, options.secondaryOffsetMs);

  if (!options.enabled || primaryAdjustedCues.length === 0 || secondaryAdjustedCues.length === 0) {
    return {
      primaryAdjustedCues,
      secondaryAdjustedCues,
      secondaryShiftedCues: secondaryAdjustedCues.map((cue) => ({ ...cue })),
      secondaryCueShiftMs: secondaryAdjustedCues.map(() => 0),
      autoSecondaryShiftMs: 0,
      matchedSpans: [],
      primaryGroups: [],
      secondaryGroups: [],
      active: false,
    };
  }

  const groupGapMs = options.groupGapMs ?? DEFAULT_GROUP_GAP_MS;
  const primaryGroups = buildCueGroups(primaryAdjustedCues, groupGapMs);
  const secondaryGroupsBase = buildCueGroups(secondaryAdjustedCues, groupGapMs);
  const { shifts: secondaryCueShiftMs, representativeShiftMs: autoSecondaryShiftMs } =
    buildSecondaryCueShiftsBySection(
      primaryGroups,
      secondaryGroupsBase,
      secondaryAdjustedCues.length,
    );
  const secondaryShiftedCues = secondaryAdjustedCues.map((cue, index) =>
    shiftCue(cue, secondaryCueShiftMs[index] ?? autoSecondaryShiftMs),
  );
  const secondaryGroups = buildCueGroups(secondaryShiftedCues, groupGapMs);
  const matchedSpans = refineAdjacentMatchBoundaries(
    alignGroups(primaryGroups, secondaryGroups),
    primaryGroups,
    secondaryGroups,
  );

  return {
    primaryAdjustedCues,
    secondaryAdjustedCues,
    secondaryShiftedCues,
    secondaryCueShiftMs,
    autoSecondaryShiftMs,
    matchedSpans,
    primaryGroups,
    secondaryGroups,
    active: true,
  };
}

export function buildTimingLockedCuesFromPrepared(
  prepared: PreparedTimingLock,
  blend: number,
): TimingLockResult {
  const clampedBlend = clamp(blend, 0, 1);
  const referenceTrack = resolveReferenceTrack(clampedBlend);

  if (!prepared.active) {
    return buildInactiveTimingLockResult(
      prepared.primaryAdjustedCues,
      prepared.secondaryAdjustedCues,
      referenceTrack,
    );
  }

  const primaryOutputCues = prepared.primaryAdjustedCues.map((cue) => ({ ...cue }));
  const secondaryOutputCues =
    referenceTrack === "secondary"
      ? prepared.secondaryAdjustedCues.map((cue) => ({ ...cue }))
      : prepared.secondaryShiftedCues.map((cue) => ({ ...cue }));
  const primaryMatchedGroups = new Set<number>();
  const secondaryMatchedGroups = new Set<number>();
  const primaryAnchors: AnchorPoint[] = [];
  const secondaryAnchors: AnchorPoint[] = [];

  for (const match of prepared.matchedSpans) {
    let unifiedStartMs: number;
    let unifiedEndMs: number;
    if (referenceTrack === "primary") {
      unifiedStartMs = match.primarySpan.startMs;
      unifiedEndMs = match.primarySpan.endMs;
    } else if (referenceTrack === "secondary") {
      const secondarySpanShiftMs = getSecondarySpanShiftMs(prepared, match.secondarySpan);
      unifiedStartMs = match.secondarySpan.startMs - secondarySpanShiftMs;
      unifiedEndMs = match.secondarySpan.endMs - secondarySpanShiftMs;
    } else {
      unifiedStartMs = Math.round(
        lerp(match.primarySpan.startMs, match.secondarySpan.startMs, clampedBlend),
      );
      unifiedEndMs = Math.round(
        lerp(match.primarySpan.endMs, match.secondarySpan.endMs, clampedBlend),
      );
    }

    if (referenceTrack !== "primary") {
      remapSpanCues(
        primaryOutputCues,
        prepared.primaryAdjustedCues,
        match.primarySpan,
        unifiedStartMs,
        unifiedEndMs,
      );
      addAnchorPoints(
        primaryAnchors,
        match.primarySpan.startMs,
        match.primarySpan.endMs,
        unifiedStartMs,
        unifiedEndMs,
      );
    }
    if (referenceTrack !== "secondary") {
      remapSpanCues(
        secondaryOutputCues,
        prepared.secondaryShiftedCues,
        match.secondarySpan,
        unifiedStartMs,
        unifiedEndMs,
      );
      addAnchorPoints(
        secondaryAnchors,
        match.secondarySpan.startMs,
        match.secondarySpan.endMs,
        unifiedStartMs,
        unifiedEndMs,
      );
    }

    for (
      let primaryIndex = match.primarySpan.groupStartIndex;
      primaryIndex <= match.primarySpan.groupEndIndex;
      primaryIndex += 1
    ) {
      primaryMatchedGroups.add(primaryIndex);
    }
    for (
      let secondaryIndex = match.secondarySpan.groupStartIndex;
      secondaryIndex <= match.secondarySpan.groupEndIndex;
      secondaryIndex += 1
    ) {
      secondaryMatchedGroups.add(secondaryIndex);
    }
  }

  if (referenceTrack !== "primary") {
    applyAnchorInterpolationToUnmatchedGroups(
      primaryOutputCues,
      prepared.primaryAdjustedCues,
      prepared.primaryGroups,
      primaryMatchedGroups,
      normalizeAnchors(primaryAnchors),
    );
  }
  if (referenceTrack !== "secondary") {
    applyAnchorInterpolationToUnmatchedGroups(
      secondaryOutputCues,
      prepared.secondaryShiftedCues,
      prepared.secondaryGroups,
      secondaryMatchedGroups,
      normalizeAnchors(secondaryAnchors),
    );
  }

  return {
    primaryCues: primaryOutputCues,
    secondaryCues: secondaryOutputCues,
    autoSecondaryShiftMs: prepared.autoSecondaryShiftMs,
    matchedGroupCount: prepared.matchedSpans.length,
    matchedSectionCount: prepared.matchedSpans.length,
    matchedPrimaryGroupCount: primaryMatchedGroups.size,
    matchedSecondaryGroupCount: secondaryMatchedGroups.size,
    primaryGroupCount: prepared.primaryGroups.length,
    secondaryGroupCount: prepared.secondaryGroups.length,
    referenceTrack,
    active: true,
  };
}

export function buildTimingLockedCues(options: TimingLockOptions): TimingLockResult {
  const prepared = prepareTimingLock({
    primaryCues: options.primaryCues,
    secondaryCues: options.secondaryCues,
    primaryOffsetMs: options.primaryOffsetMs,
    secondaryOffsetMs: options.secondaryOffsetMs,
    enabled: options.enabled,
    groupGapMs: options.groupGapMs,
  });
  return buildTimingLockedCuesFromPrepared(prepared, options.blend);
}

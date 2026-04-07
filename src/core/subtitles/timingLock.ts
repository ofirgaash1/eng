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
};

type SpanMatch = {
  primarySpan: GroupSpan;
  secondarySpan: GroupSpan;
};

type AnchorPoint = {
  sourceMs: number;
  targetMs: number;
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
const MAX_GROUP_DURATION_MS = 2800;
const MAX_GROUP_CUE_COUNT = 3;
const SECTION_GAP_MS = 20_000;
const SECTION_SHIFT_PRIMARY_CANDIDATE_GROUP_COUNT = 6;
const SECTION_SHIFT_LOOKAHEAD_GROUP_COUNT = 21;
const MIN_SECTION_SHIFT_GROUP_COUNT = 2;
const SECTION_CONTINUITY_TOLERANCE_MS = 2_500;
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
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
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

  const groups: CueGroup[] = [];
  let current: CueGroup = {
    cueIndices: [0],
    startMs: cues[0].startMs,
    endMs: cues[0].endMs,
    rawText: cues[0].rawText,
    creditLikeScore: scoreCueCreditLike(cues[0].rawText),
  };

  for (let index = 1; index < cues.length; index += 1) {
    const cue = cues[index];
    const gapMs = cue.startMs - current.endMs;
    const nextDurationMs = cue.endMs - current.startMs;
    const nextCueCount = current.cueIndices.length + 1;
    if (
      gapMs <= groupGapMs &&
      nextDurationMs <= MAX_GROUP_DURATION_MS &&
      nextCueCount <= MAX_GROUP_CUE_COUNT
    ) {
      current.cueIndices.push(index);
      current.endMs = Math.max(current.endMs, cue.endMs);
      current.rawText = `${current.rawText}\n${cue.rawText}`;
      current.creditLikeScore += scoreCueCreditLike(cue.rawText);
      continue;
    }

    groups.push(current);
    current = {
      cueIndices: [index],
      startMs: cue.startMs,
      endMs: cue.endMs,
      rawText: cue.rawText,
      creditLikeScore: scoreCueCreditLike(cue.rawText),
    };
  }

  groups.push(current);
  return groups;
}

function splitGroupsIntoSections(groups: CueGroup[], sectionGapMs: number): CueGroup[][] {
  if (groups.length === 0) {
    return [];
  }

  for (let index = 1; index < groups.length; index += 1) {
    const previous = groups[index - 1];
    const group = groups[index];
    if (group.startMs - previous.endMs > sectionGapMs) {
      return [groups.slice(0, index), groups.slice(index)];
    }
  }

  return [groups];
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
      totalOverlap += overlap * (0.7 + similarity * 0.3);
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
): number {
  if (
    primaryGroups.length < MIN_SECTION_SHIFT_GROUP_COUNT ||
    secondaryGroups.length < MIN_SECTION_SHIFT_GROUP_COUNT
  ) {
    return fallbackShiftMs;
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
    return fallbackShiftMs;
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
    const score = scoreGlobalOverlap(scoringPrimaryGroups, scoringSecondaryGroups, refinedShiftMs);
    if (score > bestScore) {
      bestScore = score;
      bestShiftMs = refinedShiftMs;
    }
  }

  return bestShiftMs;
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

  if (primarySections.length <= 1 || secondarySections.length <= 1) {
    return { shifts, representativeShiftMs: fallbackShiftMs };
  }

  const pairedSectionCount = Math.min(primarySections.length, secondarySections.length);
  const sectionShifts: number[] = [];
  let previousSectionShiftMs = fallbackShiftMs;

  for (let index = 0; index < pairedSectionCount; index += 1) {
    const sectionShiftMs =
      index > 0 && shouldContinueSectionShift(primaryGroups, secondarySections[index], previousSectionShiftMs)
        ? previousSectionShiftMs
        : findBestSectionShift(primarySections[index], secondarySections[index], fallbackShiftMs);
    sectionShifts.push(sectionShiftMs);
    previousSectionShiftMs = sectionShiftMs;

    for (const group of secondarySections[index]) {
      for (const cueIndex of group.cueIndices) {
        shifts[cueIndex] = sectionShiftMs;
      }
    }
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
  for (let index = groupStartIndex; index <= groupEndIndex; index += 1) {
    const group = groups[index];
    cueIndices.push(...group.cueIndices);
    segmentGroups.push(group);
    totalSpeechMs += groupDuration(group);
    creditLikeScore += group.creditLikeScore;
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
  const primaryIsCreditLike = primarySpan.creditLikeScore >= 0.8;
  const secondaryIsCreditLike = secondarySpan.creditLikeScore >= 0.8;
  const creditMismatchPenalty =
    Math.abs(primarySpan.creditLikeScore - secondarySpan.creditLikeScore) * 260;
  const spanComplexityPenalty =
    (primarySpan.groupEndIndex - primarySpan.groupStartIndex) * 28 +
    (secondarySpan.groupEndIndex - secondarySpan.groupStartIndex) * 28;

  if (primaryIsCreditLike !== secondaryIsCreditLike) {
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
    creditMismatchPenalty
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
  const matchedSpans = alignGroups(primaryGroups, secondaryGroups);

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

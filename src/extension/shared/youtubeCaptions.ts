import type { Cue } from "../../core/types";
import { tokenize } from "../../core/nlp/tokenize";
import type { CaptionTrackInfo } from "./messages";

type Json3Segment = {
  utf8?: string;
};

type Json3Event = {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: Json3Segment[];
};

type Json3CaptionsResponse = {
  events?: Json3Event[];
};

function toTrackLabel(track: CaptionTrackInfo): string {
  return `${track.languageCode}:${track.kind ?? "manual"}:${track.name}`.toLowerCase();
}

export function chooseBestCaptionTrack(tracks: CaptionTrackInfo[]): CaptionTrackInfo | undefined {
  if (tracks.length === 0) {
    return undefined;
  }

  const scored = tracks.map((track) => {
    const label = toTrackLabel(track);
    let score = 0;

    if (track.languageCode === "en") score += 100;
    if (track.languageCode.startsWith("en-")) score += 90;
    if (label.includes("english")) score += 25;
    if (!track.kind) score += 15;
    if (track.kind === "asr") score -= 5;
    if (label.includes("auto")) score -= 5;
    if (label.includes("translate")) score -= 10;

    return { track, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.track ?? tracks[0];
}

export function buildJson3CaptionsUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("fmt", "json3");
  return url.toString();
}

export function parseYouTubeJson3Captions(input: unknown): Cue[] {
  const payload = input as Json3CaptionsResponse;
  const events = Array.isArray(payload?.events) ? payload.events : [];
  const cues: Cue[] = [];

  events.forEach((event, index) => {
    const startMs = Number(event.tStartMs);
    if (!Number.isFinite(startMs) || startMs < 0) {
      return;
    }

    const segments = Array.isArray(event.segs) ? event.segs : [];
    const rawText = segments
      .map((segment) => segment.utf8 ?? "")
      .join("")
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .trim();

    if (!rawText) {
      return;
    }

    const durationMs = Number(event.dDurationMs);
    const endMs =
      Number.isFinite(durationMs) && durationMs > 0
        ? startMs + durationMs
        : startMs + 2_000;

    cues.push({
      index,
      startMs,
      endMs,
      rawText,
      tokens: tokenize(rawText),
    });
  });

  return cues;
}

import type { Cue } from "../types";

const TIME_REGEX = /(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/;
export const ITALIC_START = "\u0001";
export const ITALIC_END = "\u0002";

function toMs(timecode: string) {
  const [hours, minutes, rest] = timecode.split(":");
  const [seconds, milliseconds] = rest.split(",");
  return (
    Number(hours) * 3600 * 1000 +
    Number(minutes) * 60 * 1000 +
    Number(seconds) * 1000 +
    Number(milliseconds)
  );
}

function sanitizeCueText(text: string) {
  return text
    .replace(/<i>/gi, ITALIC_START)
    .replace(/<\/i>/gi, ITALIC_END)
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCueIndex(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value?.trim() ?? "", 10);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return fallback;
}

export function parseSrt(text: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = text.split(/\r?\n\r?\n/).filter(Boolean);

  for (const block of blocks) {
    const lines = block
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length < 2) {
      continue;
    }

    const timeLineIndex = lines.findIndex((line) => TIME_REGEX.test(line));
    if (timeLineIndex === -1) {
      continue;
    }

    const match = lines[timeLineIndex]?.match(TIME_REGEX);
    if (!match) {
      continue;
    }

    const rawText = sanitizeCueText(lines.slice(timeLineIndex + 1).join("\n"));
    if (!rawText) {
      continue;
    }

    const startMs = toMs(match[1]);
    const endMs = toMs(match[2]);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
      continue;
    }

    cues.push({
      index: parseCueIndex(lines[timeLineIndex - 1], cues.length),
      startMs,
      endMs,
      rawText,
    });
  }

  return cues;
}

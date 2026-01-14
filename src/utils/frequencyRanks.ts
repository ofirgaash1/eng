import type { UnknownWord } from "../core/types";

const FREQUENCY_CSV_PATH = `${import.meta.env.BASE_URL ?? "/"}word-frequency.csv`;

function parseFrequencyCsv(text: string): Map<string, number> {
  const lines = text.split(/\r?\n/);
  const ranks = new Map<string, number>();

  for (let index = 1; index < lines.length; index += 1) {
    const rawLine = lines[index];
    if (!rawLine) continue;

    const commaIndex = rawLine.indexOf(",");
    const word = (commaIndex === -1 ? rawLine : rawLine.slice(0, commaIndex))
      .trim()
      .toLowerCase();

    if (!word || ranks.has(word)) continue;
    ranks.set(word, index);
  }

  return ranks;
}

async function fetchFrequencyRanks(): Promise<Map<string, number>> {
  const response = await fetch(FREQUENCY_CSV_PATH);
  if (!response.ok) {
    throw new Error("Failed to load frequency list.");
  }
  const text = await response.text();
  return parseFrequencyCsv(text);
}

let cachedRanks: Promise<Map<string, number>> | null = null;

export function loadFrequencyRanks(): Promise<Map<string, number>> {
  if (!cachedRanks) {
    cachedRanks = fetchFrequencyRanks();
  }
  return cachedRanks;
}

export function getFrequencyRankForWord(
  word: Pick<UnknownWord, "normalized" | "stem">,
  ranks: Map<string, number> | null,
): number | null {
  if (!ranks) return null;
  const stemRank = ranks.get(word.stem.toLowerCase());
  if (typeof stemRank === "number") return stemRank;

  const normalizedRank = ranks.get(word.normalized.toLowerCase());
  return typeof normalizedRank === "number" ? normalizedRank : null;
}

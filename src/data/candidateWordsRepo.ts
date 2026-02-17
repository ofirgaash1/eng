import { nanoid } from "nanoid";
import type { CandidateWordSource, Cue, Token, WordDecision, WordDecisionRecord } from "../core/types";
import { db, withDb, withDbVoid } from "./db";

function normalizeToken(token: Token) {
  if (!token.isWord) return null;
  if (!token.normalized || token.normalized.trim().length < 2) return null;
  if (/^\d+$/.test(token.normalized)) return null;
  return token;
}

function collectTokenStats(cues: Cue[]) {
  const stats = new Map<string, { stem: string; count: number; example: string }>();
  for (const cue of cues) {
    const tokens = cue.tokens ?? [];
    for (const token of tokens) {
      const normalized = normalizeToken(token);
      if (!normalized) continue;
      const key = normalized.normalized;
      const existing = stats.get(key);
      if (existing) {
        existing.count += 1;
        if (!existing.example && cue.rawText.trim()) {
          existing.example = cue.rawText.trim();
        }
      } else {
        stats.set(key, {
          stem: normalized.stem,
          count: 1,
          example: cue.rawText.trim(),
        });
      }
    }
  }
  return stats;
}

export async function indexCandidateWordsForFile(fileHash: string, cues: Cue[]): Promise<void> {
  const stats = collectTokenStats(cues);
  const now = Date.now();

  await withDbVoid(() =>
    db.transaction("rw", db.candidateWordSources, async () => {
      await db.candidateWordSources.where("fileHash").equals(fileHash).delete();
      if (stats.size === 0) return;
      const rows: CandidateWordSource[] = [];
      for (const [normalized, value] of stats) {
        rows.push({
          id: `${fileHash}:${normalized}:${nanoid(6)}`,
          normalized,
          stem: value.stem,
          fileHash,
          count: value.count,
          example: value.example,
          updatedAt: now,
        });
      }
      await db.candidateWordSources.bulkPut(rows);
    }),
  );
}

export async function deleteCandidateWordsForFile(fileHash: string): Promise<void> {
  await withDbVoid(() => db.candidateWordSources.where("fileHash").equals(fileHash).delete());
}

export async function listCandidateWordSources(): Promise<CandidateWordSource[]> {
  return withDb([], () => db.candidateWordSources.toArray());
}

export async function saveWordDecision(normalized: string, decision: WordDecision): Promise<void> {
  const row: WordDecisionRecord = {
    normalized,
    decision,
    updatedAt: Date.now(),
  };
  await withDbVoid(() => db.wordDecisions.put(row));
}

export async function getWordDecisions(): Promise<WordDecisionRecord[]> {
  return withDb([], () => db.wordDecisions.toArray());
}

export async function rebuildAllCandidateWords(
  records: Array<{ fileHash: string; cues: Cue[] }>,
): Promise<void> {
  await withDbVoid(() =>
    db.transaction("rw", db.candidateWordSources, async () => {
      await db.candidateWordSources.clear();
      for (const record of records) {
        const stats = collectTokenStats(record.cues);
        const now = Date.now();
        const rows: CandidateWordSource[] = [];
        for (const [normalized, value] of stats) {
          rows.push({
            id: `${record.fileHash}:${normalized}:${nanoid(6)}`,
            normalized,
            stem: value.stem,
            fileHash: record.fileHash,
            count: value.count,
            example: value.example,
            updatedAt: now,
          });
        }
        if (rows.length > 0) {
          await db.candidateWordSources.bulkPut(rows);
        }
      }
    }),
  );
}

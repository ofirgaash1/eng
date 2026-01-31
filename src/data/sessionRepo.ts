import type { RecentSessionRecord } from "../core/types";
import { db, withDb, withDbVoid } from "./db";

const SESSION_ID = "last-session";

export async function getLastSession(): Promise<RecentSessionRecord | undefined> {
  return withDb(undefined, () => db.sessions.get(SESSION_ID));
}

export async function saveLastSession(
  updates: Partial<Omit<RecentSessionRecord, "id" | "updatedAt">>
): Promise<void> {
  const updatedAt = Date.now();
  const updated = await withDb(0, () =>
    db.sessions.update(SESSION_ID, { ...updates, updatedAt }),
  );

  if (updated > 0) {
    return;
  }

  const next: RecentSessionRecord = {
    id: SESSION_ID,
    updatedAt,
    videoName: updates.videoName,
    videoBlob: updates.videoBlob,
    subtitleName: updates.subtitleName,
    subtitleText: updates.subtitleText,
    subtitleHash: updates.subtitleHash,
    subtitleOffsetMs: updates.subtitleOffsetMs,
    videoTimeSeconds: updates.videoTimeSeconds,
    secondarySubtitleName: updates.secondarySubtitleName,
    secondarySubtitleText: updates.secondarySubtitleText,
    secondarySubtitleHash: updates.secondarySubtitleHash,
    secondarySubtitleEnabled: updates.secondarySubtitleEnabled,
    secondarySubtitleOffsetMs: updates.secondarySubtitleOffsetMs,
  };

  await withDbVoid(() => db.sessions.put(next));
}

export async function clearLastSession(): Promise<void> {
  await withDbVoid(() => db.sessions.delete(SESSION_ID));
}

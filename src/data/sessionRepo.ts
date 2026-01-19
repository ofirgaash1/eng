import type { RecentSessionRecord } from "../core/types";
import { db } from "./db";

const SESSION_ID = "last-session";

export async function getLastSession(): Promise<RecentSessionRecord | undefined> {
  return db.sessions.get(SESSION_ID);
}

export async function saveLastSession(
  updates: Partial<Omit<RecentSessionRecord, "id" | "updatedAt">>
): Promise<void> {
  const current = await getLastSession();
  const next: RecentSessionRecord = {
    id: SESSION_ID,
    updatedAt: Date.now(),
    videoName: current?.videoName,
    videoBlob: current?.videoBlob,
    subtitleName: current?.subtitleName,
    subtitleText: current?.subtitleText,
    subtitleHash: current?.subtitleHash,
    videoTimeSeconds: current?.videoTimeSeconds,
    secondarySubtitleName: current?.secondarySubtitleName,
    secondarySubtitleText: current?.secondarySubtitleText,
    secondarySubtitleHash: current?.secondarySubtitleHash,
    secondarySubtitleEnabled: current?.secondarySubtitleEnabled,
    secondarySubtitleOffsetMs: current?.secondarySubtitleOffsetMs,
  };

  if (Object.prototype.hasOwnProperty.call(updates, "videoName")) {
    next.videoName = updates.videoName;
  }
  if (Object.prototype.hasOwnProperty.call(updates, "videoBlob")) {
    next.videoBlob = updates.videoBlob;
  }
  if (Object.prototype.hasOwnProperty.call(updates, "subtitleName")) {
    next.subtitleName = updates.subtitleName;
  }
  if (Object.prototype.hasOwnProperty.call(updates, "subtitleText")) {
    next.subtitleText = updates.subtitleText;
  }
  if (Object.prototype.hasOwnProperty.call(updates, "subtitleHash")) {
    next.subtitleHash = updates.subtitleHash;
  }
  if (Object.prototype.hasOwnProperty.call(updates, "videoTimeSeconds")) {
    next.videoTimeSeconds = updates.videoTimeSeconds;
  }
  if (Object.prototype.hasOwnProperty.call(updates, "secondarySubtitleName")) {
    next.secondarySubtitleName = updates.secondarySubtitleName;
  }
  if (Object.prototype.hasOwnProperty.call(updates, "secondarySubtitleText")) {
    next.secondarySubtitleText = updates.secondarySubtitleText;
  }
  if (Object.prototype.hasOwnProperty.call(updates, "secondarySubtitleHash")) {
    next.secondarySubtitleHash = updates.secondarySubtitleHash;
  }
  if (Object.prototype.hasOwnProperty.call(updates, "secondarySubtitleEnabled")) {
    next.secondarySubtitleEnabled = updates.secondarySubtitleEnabled;
  }
  if (Object.prototype.hasOwnProperty.call(updates, "secondarySubtitleOffsetMs")) {
    next.secondarySubtitleOffsetMs = updates.secondarySubtitleOffsetMs;
  }

  await db.sessions.put(next);
}

export async function clearLastSession(): Promise<void> {
  await db.sessions.delete(SESSION_ID);
}

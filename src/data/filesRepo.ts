import { nanoid } from "nanoid";
import type { SubtitleFile } from "../core/types";
import { db } from "./db";

export async function upsertSubtitleFile(
  input: Omit<SubtitleFile, "id" | "addedAt"> & { addedAt?: number }
): Promise<SubtitleFile> {
  const existing = await db.subtitleFiles.where("bytesHash").equals(input.bytesHash).first();
  const record: SubtitleFile = existing
    ? { ...existing, ...input, addedAt: input.addedAt ?? Date.now() }
    : {
        id: nanoid(),
        name: input.name,
        bytesHash: input.bytesHash,
        totalCues: input.totalCues,
        language: input.language,
        addedAt: input.addedAt ?? Date.now(),
      };

  await db.subtitleFiles.put(record);
  return record;
}

export async function listSubtitleFiles(): Promise<SubtitleFile[]> {
  return db.subtitleFiles.orderBy("addedAt").reverse().toArray();
}

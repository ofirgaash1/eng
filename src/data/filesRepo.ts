import { nanoid } from "nanoid";
import type { SubtitleFile } from "../core/types";
import { db } from "./db";
import { deleteCuesForFile } from "./cuesRepo";

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

export async function deleteSubtitleFile(id: string): Promise<void> {
  await db.transaction("rw", db.subtitleFiles, db.subtitleCues, async () => {
    const record = await db.subtitleFiles.get(id);
    if (!record) {
      return;
    }

    await db.subtitleFiles.delete(id);
    await deleteCuesForFile(record.bytesHash);
  });
}

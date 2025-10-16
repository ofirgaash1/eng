import type { UnknownWord } from "../core/types";
import { db } from "./db";

export async function getAllWords(): Promise<UnknownWord[]> {
  return db.words.toArray();
}

export async function saveWord(word: UnknownWord): Promise<void> {
  await db.words.put(word);
}

export async function deleteWord(id: string): Promise<void> {
  await db.words.delete(id);
}

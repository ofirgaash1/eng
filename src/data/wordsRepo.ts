import type { UnknownWord } from "../core/types";
import { db, withDb, withDbVoid } from "./db";

export async function getAllWords(): Promise<UnknownWord[]> {
  return withDb([], () => db.words.toArray());
}

export async function saveWord(word: UnknownWord): Promise<void> {
  await withDbVoid(() => db.words.put(word));
}

export async function deleteWord(id: string): Promise<void> {
  await withDbVoid(() => db.words.delete(id));
}

export async function replaceAllWords(words: UnknownWord[]): Promise<void> {
  await withDbVoid(() =>
    db.transaction("rw", db.words, async () => {
      await db.words.clear();
      if (words.length > 0) {
        await db.words.bulkPut(words);
      }
    })
  );
}

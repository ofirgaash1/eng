import { db } from "./db";
export async function getAllWords() {
    return db.words.toArray();
}
export async function saveWord(word) {
    await db.words.put(word);
}
export async function deleteWord(id) {
    await db.words.delete(id);
}
export async function replaceAllWords(words) {
    await db.transaction("rw", db.words, async () => {
        await db.words.clear();
        if (words.length > 0) {
            await db.words.bulkPut(words);
        }
    });
}
//# sourceMappingURL=wordsRepo.js.map
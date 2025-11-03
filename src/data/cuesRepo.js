import { db } from "./db";
function toCue(record) {
    const { index, startMs, endMs, rawText, tokens } = record;
    return {
        index,
        startMs,
        endMs,
        rawText,
        tokens,
    };
}
function toRecord(fileHash, cue) {
    return {
        id: `${fileHash}:${cue.index}`,
        fileHash,
        index: cue.index,
        startMs: cue.startMs,
        endMs: cue.endMs,
        rawText: cue.rawText,
        tokens: cue.tokens ?? [],
    };
}
export async function getCuesForFile(fileHash) {
    const records = await db.subtitleCues.where("fileHash").equals(fileHash).sortBy("index");
    if (records.length === 0) {
        return undefined;
    }
    return records.map(toCue);
}
export async function saveCuesForFile(fileHash, cues) {
    await db.transaction("rw", db.subtitleCues, async () => {
        await db.subtitleCues.where("fileHash").equals(fileHash).delete();
        if (cues.length > 0) {
            await db.subtitleCues.bulkPut(cues.map((cue) => toRecord(fileHash, cue)));
        }
    });
}
export async function deleteCuesForFile(fileHash) {
    await db.subtitleCues.where("fileHash").equals(fileHash).delete();
}
//# sourceMappingURL=cuesRepo.js.map
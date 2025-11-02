import { db } from "./db";
const SESSION_ID = "last-session";
export async function getLastSession() {
    return db.sessions.get(SESSION_ID);
}
export async function saveLastSession(updates) {
    const current = await getLastSession();
    const next = {
        id: SESSION_ID,
        updatedAt: Date.now(),
        videoName: current?.videoName,
        videoBlob: current?.videoBlob,
        subtitleName: current?.subtitleName,
        subtitleText: current?.subtitleText,
        subtitleHash: current?.subtitleHash,
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
    await db.sessions.put(next);
}
export async function clearLastSession() {
    await db.sessions.delete(SESSION_ID);
}
//# sourceMappingURL=sessionRepo.js.map
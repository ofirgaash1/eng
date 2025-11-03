import { db } from "./db";
const PREFS_ID = "prefs";
export async function getPrefs() {
    const record = await db.prefs.get(PREFS_ID);
    return record?.value;
}
export async function savePrefs(prefs) {
    await db.prefs.put({ id: PREFS_ID, value: prefs, updatedAt: Date.now() });
}
//# sourceMappingURL=prefsRepo.js.map
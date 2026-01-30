import type { UserPrefs } from "../core/types";
import { db, withDb, withDbVoid } from "./db";

const PREFS_ID = "prefs";

export async function getPrefs(): Promise<UserPrefs | undefined> {
  return withDb(undefined, async () => {
    const record = await db.prefs.get(PREFS_ID);
    return record?.value;
  });
}

export async function savePrefs(prefs: UserPrefs): Promise<void> {
  await withDbVoid(() => db.prefs.put({ id: PREFS_ID, value: prefs, updatedAt: Date.now() }));
}

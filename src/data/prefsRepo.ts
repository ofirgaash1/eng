import type { UserPrefs } from "../core/types";
import { db } from "./db";

const PREFS_ID = "prefs";

export async function getPrefs(): Promise<UserPrefs | undefined> {
  const record = await db.prefs.get(PREFS_ID);
  return record?.value;
}

export async function savePrefs(prefs: UserPrefs): Promise<void> {
  await db.prefs.put({ id: PREFS_ID, value: prefs, updatedAt: Date.now() });
}
